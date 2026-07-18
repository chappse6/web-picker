/**
 * Daemon IPC client (application layer for the shim).
 *
 * Depends only on ports (DaemonLauncher, IpcTransport) so it unit-tests with
 * fakes and no process/socket. The real http transport adapter lives at the
 * bottom of this file; the process-spawning launcher lives in spawn.ts.
 *
 * Agent-neutral: sessionId/label are opaque; nothing here knows the agent kind.
 */
import type { WebRequest } from '../shared/types.js';

/** Where the daemon is reachable + the shared secret to authenticate. */
export interface DaemonHandle {
  port: number;
  token: string;
  host?: string;
}

/** Port: a single request/response IPC call to the daemon. */
export interface IpcTransport {
  send(op: string, args?: Record<string, unknown>): Promise<any>;
}

/** Port: lazily ensure the daemon is running, returning how to reach it. */
export interface DaemonLauncher {
  ensureRunning(): Promise<DaemonHandle>;
}

export interface ClientDeps {
  launcher: DaemonLauncher;
  createTransport: (handle: DaemonHandle) => IpcTransport;
  sessionId: string;
  label: string;
}

export interface ConnectResult {
  claimed: boolean;
  activeSessionId: string | null;
  pending: number;
}

export interface WebPickerClient {
  connect(): Promise<ConnectResult>;
  takeOver(): Promise<{ ok: boolean; activeSessionId: string | null }>;
  release(): Promise<{ ok: boolean }>;
  heartbeat(): Promise<void>;
  list(): Promise<WebRequest[]>;
  pull(): Promise<WebRequest[]>;
  get(id: string): Promise<WebRequest | null>;
  resolve(id: string): Promise<{ ok: boolean }>;
}

export function createClient(deps: ClientDeps): WebPickerClient {
  let transport: IpcTransport | null = null;

  // Lazily start the daemon and build the transport once, then reuse it.
  async function tx(): Promise<IpcTransport> {
    if (!transport) {
      const handle = await deps.launcher.ensureRunning();
      transport = deps.createTransport(handle);
    }
    return transport;
  }

  return {
    async connect() {
      const t = await tx();
      await t.send('register', { sessionId: deps.sessionId, label: deps.label });
      const r = await t.send('claim', { sessionId: deps.sessionId });
      return {
        claimed: Boolean(r?.ok),
        activeSessionId: r?.activeSessionId ?? null,
        pending: r?.pending ?? 0,
      };
    },
    async takeOver() {
      const t = await tx();
      const r = await t.send('take_over', { sessionId: deps.sessionId });
      return { ok: Boolean(r?.ok), activeSessionId: r?.activeSessionId ?? null };
    },
    async release() {
      const t = await tx();
      const r = await t.send('release', { sessionId: deps.sessionId });
      return { ok: Boolean(r?.ok) };
    },
    async heartbeat() {
      const t = await tx();
      await t.send('heartbeat', { sessionId: deps.sessionId });
    },
    async list() {
      const t = await tx();
      const r = await t.send('list');
      return r?.requests ?? [];
    },
    async pull() {
      const t = await tx();
      const r = await t.send('pull');
      return r?.requests ?? [];
    },
    async get(id) {
      const t = await tx();
      const r = await t.send('get', { id });
      return r?.request ?? null;
    },
    async resolve(id) {
      const t = await tx();
      const r = await t.send('resolve', { id });
      return { ok: Boolean(r?.ok) };
    },
  };
}

/**
 * Real IPC transport adapter over http to the daemon's /ipc endpoint.
 * A non-2xx response throws so the client surfaces auth/transport failures.
 */
export function createHttpTransport(handle: DaemonHandle): IpcTransport {
  const host = handle.host ?? '127.0.0.1';
  return {
    async send(op, args = {}) {
      const res = await fetch(`http://${host}:${handle.port}/ipc`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-web-picker-token': handle.token,
        },
        body: JSON.stringify({ op, ...args }),
      });
      if (!res.ok) {
        throw new Error(`ipc ${op} failed: ${res.status}`);
      }
      return res.json();
    },
  };
}
