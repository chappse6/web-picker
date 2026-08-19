import { describe, it, expect } from 'vitest';
import { createState, DEFAULT_PORT } from '../../src/daemon/state.js';
import type {
  CapturePayload,
  QueueSnapshot,
  Status,
  WebRequest,
} from '../../src/shared/types.js';

function payload(overrides: Partial<CapturePayload> = {}): CapturePayload {
  const { element, ...rest } = overrides;
  return {
    url: 'http://localhost:3000/',
    title: 'Test Page',
    viewport: { width: 1024, height: 768 },
    element: {
      selector: '#save-btn',
      tagName: 'button',
      id: 'save-btn',
      className: 'btn primary',
      role: null,
      ariaLabel: null,
      dataset: [],
      attributes: {},
      ancestors: [],
      rect: { x: 0, y: 0, width: 100, height: 40 },
      maskedText: '••••',
      maskedOuterHTML: '<button class="btn primary">…</button>',
      landmark: null,
      visibleLabel: 'Save',
      locatorEvidence: {
        candidates: [{ kind: 'id', value: '#save-btn', matchCount: 1, stability: 100 }],
        confidence: 'high',
        reasons: ['unique-candidate'],
      },
      ...(element ?? {}),
    },
    userQuestion: 'Make this button blue',
    createdAt: '2026-07-18T00:00:00.000Z',
    source: 'chrome-extension',
    ...rest,
  };
}

function request(
  id: string,
  status: Status,
  createdAt: number,
  resolvedAt: number | null = status === 'resolved' ? createdAt : null,
): WebRequest {
  return {
    id,
    payload: payload({ userQuestion: id }),
    status,
    createdAt,
    claimedAt: status === 'claimed' ? createdAt : null,
    resolvedAt,
  };
}

function controlledPersistence() {
  let failure: Error | null = null;
  let latest: QueueSnapshot | null = null;

  return {
    persistence: {
      save(snapshot: QueueSnapshot) {
        latest = snapshot;
        if (failure) throw failure;
      },
    },
    failWith(error: Error | null) {
      failure = error;
    },
    latest() {
      return latest;
    },
  };
}

describe('config', () => {
  it('default daemon port is 8787', () => {
    expect(DEFAULT_PORT).toBe(8787);
  });
});

describe('session occupancy', () => {
  it('claim succeeds on an empty state', () => {
    const s = createState();
    s.register('a', 'Claude Code');
    expect(s.claim('a')).toBe(true);
    expect(s.activeSessionId).toBe('a');
  });

  it('claim fails when already occupied', () => {
    const s = createState();
    s.register('a', 'A');
    s.register('b', 'B');
    s.claim('a');
    expect(s.claim('b')).toBe(false);
    expect(s.activeSessionId).toBe('a');
  });

  it('take_over transfers occupancy from another session', () => {
    const s = createState();
    s.register('a', 'A');
    s.register('b', 'B');
    s.claim('a');
    expect(s.takeOver('b')).toBe(true);
    expect(s.activeSessionId).toBe('b');
  });

  it('release succeeds for the owning session', () => {
    const s = createState();
    s.register('a', 'A');
    s.claim('a');
    expect(s.release('a')).toBe(true);
    expect(s.activeSessionId).toBe(null);
  });

  it('release fails for a non-owning session', () => {
    const s = createState();
    s.register('a', 'A');
    s.register('b', 'B');
    s.claim('a');
    expect(s.release('b')).toBe(false);
    expect(s.activeSessionId).toBe('a');
  });
});

describe('session registry', () => {
  it('stores label and lastHeartbeat on register', () => {
    let now = 500;
    const s = createState({ now: () => now });
    s.register('a', 'Claude Code');
    const info = s.sessionRegistry.get('a');
    expect(info?.label).toBe('Claude Code');
    expect(info?.lastHeartbeat).toBe(500);
  });
});

describe('heartbeat timeout', () => {
  it('auto-releases the active session after heartbeat timeout', () => {
    let now = 1000;
    const s = createState({ heartbeatTimeoutMs: 5000, now: () => now });
    s.register('a', 'A');
    s.claim('a');
    now = 1000 + 4000;
    s.sweep();
    expect(s.activeSessionId).toBe('a');
    now = 1000 + 6000;
    s.sweep();
    expect(s.activeSessionId).toBe(null);
  });

  it('heartbeat keeps the session alive past the original window', () => {
    let now = 1000;
    const s = createState({ heartbeatTimeoutMs: 5000, now: () => now });
    s.register('a', 'A');
    s.claim('a');
    now = 4000;
    s.heartbeat('a');
    now = 8000;
    s.sweep();
    expect(s.activeSessionId).toBe('a');
  });
});

describe('request queue', () => {
  it('enqueue adds a pending request with an id', () => {
    const s = createState();
    const req = s.enqueue(payload());
    expect(req.id).toBeTruthy();
    expect(req.status).toBe('pending');
    expect(s.list()).toHaveLength(1);
  });

  it('get returns a request with its status', () => {
    const s = createState();
    const req = s.enqueue(payload());
    expect(s.get(req.id)?.status).toBe('pending');
  });

  it('pull marks pending requests as claimed', () => {
    const s = createState();
    const req = s.enqueue(payload());
    const pulled = s.pull();
    expect(pulled.map((r) => r.id)).toContain(req.id);
    expect(s.get(req.id)?.status).toBe('claimed');
  });

  it('resolve moves a pending request to resolved', () => {
    const s = createState();
    const req = s.enqueue(payload());
    expect(s.resolve(req.id)).toBe(true);
    expect(s.get(req.id)?.status).toBe('resolved');
  });

  it('resolve moves a claimed request to resolved', () => {
    const s = createState();
    const req = s.enqueue(payload());
    s.pull();
    expect(s.resolve(req.id)).toBe(true);
    expect(s.get(req.id)?.status).toBe('resolved');
  });

  it('resolve on an already-resolved known request succeeds idempotently', () => {
    const s = createState();
    const req = s.enqueue(payload());
    s.resolve(req.id);
    expect(s.resolve(req.id)).toBe(true);
  });

  it('resolve on an unknown id returns false', () => {
    const s = createState();
    expect(s.resolve('does-not-exist')).toBe(false);
  });
});

describe('transactional queue persistence', () => {
  it('rolls back enqueue state, identity sequence, and notification when save fails', () => {
    let attemptedId: string | undefined;
    let shouldFail = true;
    const state = createState({
      now: () => 1_000,
      persistence: {
        save(snapshot) {
          attemptedId = snapshot.requests[0]?.id;
          if (shouldFail) throw new Error('disk full');
        },
      },
    });
    let notifications = 0;
    state.subscribe(() => {
      notifications += 1;
    });

    expect(() => state.enqueue(payload())).toThrow('disk full');
    expect(state.list()).toEqual([]);
    expect(notifications).toBe(0);

    shouldFail = false;
    const committed = state.enqueue(payload());
    expect(committed.id).toBe(attemptedId);
    expect(notifications).toBe(1);
  });

  it('rolls back pull without mutating existing request objects when save fails', () => {
    const store = controlledPersistence();
    const state = createState({ persistence: store.persistence });
    const original = state.enqueue(payload());
    store.failWith(new Error('disk full'));

    expect(() => state.pull()).toThrow('disk full');
    expect(state.list()[0]).toBe(original);
    expect(state.get(original.id)).toBe(original);
    expect(original.status).toBe('pending');
    expect(original.claimedAt).toBe(null);
  });

  it('rolls back resolve without mutating existing request objects when save fails', () => {
    const store = controlledPersistence();
    const state = createState({ persistence: store.persistence });
    const original = state.enqueue(payload());
    const claimed = state.pull()[0];
    expect(claimed).not.toBe(original);
    store.failWith(new Error('disk full'));

    expect(() => state.resolve(claimed.id)).toThrow('disk full');
    expect(state.list()[0]).toBe(claimed);
    expect(state.get(claimed.id)).toBe(claimed);
    expect(claimed.status).toBe('claimed');
    expect(claimed.resolvedAt).toBe(null);
  });

  it('loads claimed requests as pending and caps resolved history at 50', () => {
    const claimed = request('claimed', 'claimed', 3);
    const initialRequests = [
      request('pending-1', 'pending', 1),
      request('pending-2', 'pending', 2),
      claimed,
      ...Array.from({ length: 55 }, (_, index) =>
        request(`resolved-${index}`, 'resolved', 100 + index, 1_000 + index),
      ),
    ];

    const state = createState({ initialRequests });
    const rows = state.list();

    expect(rows.filter((row) => row.status !== 'resolved')).toHaveLength(3);
    expect(rows.filter((row) => row.status === 'resolved')).toHaveLength(50);
    expect(rows.some((row) => row.status === 'claimed')).toBe(false);
    expect(rows.filter((row) => row.status === 'resolved').map((row) => row.id))
      .toEqual(Array.from({ length: 50 }, (_, index) => `resolved-${index + 5}`));
    expect(claimed.status).toBe('claimed');
    expect(claimed.claimedAt).toBe(3);
  });

  it('returns claimed work to pending when heartbeat expires', () => {
    let now = 0;
    const store = controlledPersistence();
    const state = createState({
      now: () => now,
      heartbeatTimeoutMs: 10,
      persistence: store.persistence,
    });
    state.register('agent', 'Agent');
    state.claim('agent');
    state.enqueue(payload());
    state.pull();

    now = 11;
    state.sweep();

    expect(state.activeSessionId).toBe(null);
    expect(state.list()[0].status).toBe('pending');
    expect(state.list()[0].claimedAt).toBe(null);
    expect(store.latest()?.requests[0]?.status).toBe('pending');
  });

  it('rolls back heartbeat expiry requeue and occupancy when save fails', () => {
    let now = 0;
    const store = controlledPersistence();
    const state = createState({
      now: () => now,
      heartbeatTimeoutMs: 10,
      persistence: store.persistence,
    });
    state.register('agent', 'Agent');
    state.claim('agent');
    state.enqueue(payload());
    const claimed = state.pull()[0];
    store.failWith(new Error('disk full'));

    now = 11;
    expect(() => state.sweep()).toThrow('disk full');
    expect(state.activeSessionId).toBe('agent');
    expect(state.list()[0]).toBe(claimed);
    expect(claimed.status).toBe('claimed');
    expect(claimed.claimedAt).toBe(0);
  });
});

describe('duplicate enqueue idempotency', () => {
  it('collapses same selector + question within the dedup window', () => {
    let now = 1000;
    const s = createState({ dedupWindowMs: 1000, now: () => now });
    const a = s.enqueue(payload());
    now = 1200;
    const b = s.enqueue(payload());
    expect(b.id).toBe(a.id);
    expect(s.list()).toHaveLength(1);
  });

  it('separates same selector + question outside the dedup window', () => {
    let now = 1000;
    const s = createState({ dedupWindowMs: 1000, now: () => now });
    const a = s.enqueue(payload());
    now = 3000;
    const b = s.enqueue(payload());
    expect(b.id).not.toBe(a.id);
    expect(s.list()).toHaveLength(2);
  });

  it('separates different questions on the same selector', () => {
    const s = createState();
    const a = s.enqueue(payload({ userQuestion: 'q1' }));
    const b = s.enqueue(payload({ userQuestion: 'q2' }));
    expect(b.id).not.toBe(a.id);
    expect(s.list()).toHaveLength(2);
  });
});

describe('subscribe', () => {
  it('notifies listeners when a new request is enqueued', () => {
    const s = createState();
    let fired = 0;
    s.subscribe(() => {
      fired += 1;
    });
    s.enqueue(payload());
    expect(fired).toBe(1);
  });

  it('does not notify on a deduped enqueue', () => {
    let now = 1000;
    const s = createState({ dedupWindowMs: 1000, now: () => now });
    s.enqueue(payload());
    let fired = 0;
    s.subscribe(() => {
      fired += 1;
    });
    now = 1200;
    s.enqueue(payload());
    expect(fired).toBe(0);
  });

  it('stops notifying after unsubscribe', () => {
    const s = createState();
    let fired = 0;
    const off = s.subscribe(() => {
      fired += 1;
    });
    off();
    s.enqueue(payload());
    expect(fired).toBe(0);
  });
});
