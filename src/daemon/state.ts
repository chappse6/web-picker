/**
 * Daemon state machine: request queue + session occupancy.
 *
 * Agent-neutral by design. Sessions are opaque ids with labels; the state has
 * no idea whether a session is Claude Code, Codex, or anything else.
 */
import type {
  CapturePayload,
  QueuePersistence,
  SessionInfo,
  WebRequest,
} from '../shared/types.js';
import {
  noOpQueuePersistence,
  QUEUE_SCHEMA_VERSION,
  retainedRequests,
} from './persistence.js';

/** Default HTTP port the daemon binds on 127.0.0.1. */
export const DEFAULT_PORT = 8787;

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000;
const DEFAULT_DEDUP_WINDOW_MS = 1_500;

export interface StateOptions {
  /** ms without a heartbeat before the active session is auto-released. */
  heartbeatTimeoutMs?: number;
  /** window in which an identical selector+question collapses to one request. */
  dedupWindowMs?: number;
  /** injectable clock for deterministic tests. */
  now?: () => number;
  /** recovered queue rows; claimed work is normalized back to pending. */
  initialRequests?: WebRequest[];
  /** synchronous durability port for queue mutations. */
  persistence?: QueuePersistence;
}

export interface State {
  readonly port: number;
  readonly activeSessionId: string | null;
  readonly sessionRegistry: ReadonlyMap<string, SessionInfo>;

  register(sessionId: string, label: string): SessionInfo;
  heartbeat(sessionId: string): void;
  claim(sessionId: string): boolean;
  takeOver(sessionId: string): boolean;
  release(sessionId: string): boolean;
  /** release sessions whose heartbeat has timed out. */
  sweep(): void;

  enqueue(payload: CapturePayload): WebRequest;
  list(): WebRequest[];
  get(id: string): WebRequest | undefined;
  /** return pending requests, marking them claimed. */
  pull(): WebRequest[];
  /** mark a pending/claimed request resolved. */
  resolve(id: string): boolean;
  /** subscribe to new-request notifications (for long-poll watch); returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
}

function dedupKey(payload: CapturePayload): string {
  return `${payload.element.selector}\u0000${payload.userQuestion}`;
}

export function createState(options: StateOptions = {}): State {
  const heartbeatTimeoutMs =
    options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
  const dedupWindowMs = options.dedupWindowMs ?? DEFAULT_DEDUP_WINDOW_MS;
  const now = options.now ?? (() => Date.now());
  const persistence = options.persistence ?? noOpQueuePersistence;

  const sessions = new Map<string, SessionInfo>();
  let queue = retainedRequests(
    (options.initialRequests ?? []).map((row) =>
      row.status === 'claimed'
        ? { ...row, status: 'pending', claimedAt: null }
        : { ...row },
    ),
  );
  let byId = new Map(queue.map((row) => [row.id, row]));
  const recentByKey = new Map<string, { id: string; at: number }>();
  const listeners = new Set<() => void>();

  let activeSessionId: string | null = null;
  let seq = 0;

  for (const row of queue) {
    const key = dedupKey(row.payload);
    const recent = recentByKey.get(key);
    if (!recent || row.createdAt > recent.at) {
      recentByKey.set(key, { id: row.id, at: row.createdAt });
    }
  }

  function candidateId(at: number): { id: string; nextSeq: number } {
    let nextSeq = seq;
    let id: string;
    do {
      nextSeq += 1;
      id = `req_${at}_${nextSeq}`;
    } while (byId.has(id));
    return { id, nextSeq };
  }

  function saveAndCommit(next: WebRequest[]): WebRequest[] {
    const retained = retainedRequests(next);
    persistence.save({
      schemaVersion: QUEUE_SCHEMA_VERSION,
      requests: retained,
    });
    queue = retained;
    byId = new Map(queue.map((row) => [row.id, row]));
    return queue;
  }

  const state: State = {
    get port() {
      return DEFAULT_PORT;
    },
    get activeSessionId() {
      return activeSessionId;
    },
    get sessionRegistry(): ReadonlyMap<string, SessionInfo> {
      return sessions;
    },

    register(sessionId, label) {
      const info: SessionInfo = {
        id: sessionId,
        label,
        lastHeartbeat: now(),
      };
      sessions.set(sessionId, info);
      return info;
    },

    heartbeat(sessionId) {
      const info = sessions.get(sessionId);
      if (info) info.lastHeartbeat = now();
    },

    claim(sessionId) {
      state.sweep();
      if (activeSessionId === sessionId) {
        state.heartbeat(sessionId);
        return true;
      }
      if (activeSessionId !== null) return false;
      if (!sessions.has(sessionId)) this.register(sessionId, sessionId);
      state.heartbeat(sessionId);
      activeSessionId = sessionId;
      return true;
    },

    takeOver(sessionId) {
      if (!sessions.has(sessionId)) this.register(sessionId, sessionId);
      state.heartbeat(sessionId);
      activeSessionId = sessionId;
      return true;
    },

    release(sessionId) {
      if (activeSessionId !== sessionId) return false;
      activeSessionId = null;
      return true;
    },

    sweep() {
      if (activeSessionId === null) return;
      const info = sessions.get(activeSessionId);
      if (!info) {
        activeSessionId = null;
        return;
      }
      if (now() - info.lastHeartbeat > heartbeatTimeoutMs) {
        if (queue.some((row) => row.status === 'claimed')) {
          const next = queue.map((row) =>
            row.status === 'claimed'
              ? { ...row, status: 'pending' as const, claimedAt: null }
              : row,
          );
          saveAndCommit(next);
        }
        activeSessionId = null;
      }
    },

    enqueue(payload) {
      const key = dedupKey(payload);
      const recent = recentByKey.get(key);
      const t = now();
      if (recent && t - recent.at <= dedupWindowMs) {
        const existing = byId.get(recent.id);
        if (existing) {
          recent.at = t;
          return existing;
        }
      }
      const { id, nextSeq } = candidateId(t);
      const req: WebRequest = {
        id,
        payload,
        status: 'pending',
        createdAt: t,
        claimedAt: null,
        resolvedAt: null,
      };
      saveAndCommit([...queue, req]);
      seq = nextSeq;
      recentByKey.set(key, { id: req.id, at: t });
      for (const listener of listeners) listener();
      return byId.get(req.id)!;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    list() {
      return [...queue];
    },

    get(id) {
      return byId.get(id);
    },

    pull() {
      const pending = queue.filter((r) => r.status === 'pending');
      if (pending.length === 0) return [];
      const pendingIds = new Set(pending.map((row) => row.id));
      const t = now();
      const committed = saveAndCommit(
        queue.map((row) =>
          pendingIds.has(row.id)
            ? { ...row, status: 'claimed' as const, claimedAt: t }
            : row,
        ),
      );
      return committed.filter((row) => pendingIds.has(row.id));
    },

    resolve(id) {
      const req = byId.get(id);
      if (!req) return false;
      if (req.status === 'resolved') return true;
      const resolvedAt = now();
      saveAndCommit(
        queue.map((row) =>
          row.id === id
            ? { ...row, status: 'resolved' as const, resolvedAt }
            : row,
        ),
      );
      return true;
    },
  };

  return state;
}
