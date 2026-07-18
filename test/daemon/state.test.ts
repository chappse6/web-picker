import { describe, it, expect } from 'vitest';
import { createState, DEFAULT_PORT } from '../../src/daemon/state.js';
import type { CapturePayload } from '../../src/shared/types.js';

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
      ...(element ?? {}),
    },
    userQuestion: 'Make this button blue',
    createdAt: '2026-07-18T00:00:00.000Z',
    source: 'chrome-extension',
    ...rest,
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

  it('resolve on an already-resolved request returns false', () => {
    const s = createState();
    const req = s.enqueue(payload());
    s.resolve(req.id);
    expect(s.resolve(req.id)).toBe(false);
  });

  it('resolve on an unknown id returns false', () => {
    const s = createState();
    expect(s.resolve('does-not-exist')).toBe(false);
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
