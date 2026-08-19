import { describe, it, expect } from 'vitest';
import { createState } from '../../src/daemon/state.js';
import { createExtensionApi } from '../../src/daemon/extension-api.js';
import { createIpcApi } from '../../src/daemon/ipc-api.js';
import { createServer } from '../../src/daemon/server.js';
import type { ApiRequest } from '../../src/daemon/http.js';
import type { CapturePayload } from '../../src/shared/types.js';

const EXTENSION_ORIGIN = 'chrome-extension://mnglicpibnccgcifnndemfpidkcgboli';

function extensionApi(state = createState(), version = '0.1.0') {
  return createExtensionApi(state, { version, expectedExtensionOrigin: EXTENSION_ORIGIN });
}

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

function req(overrides: Partial<ApiRequest>): ApiRequest {
  return {
    method: 'GET',
    path: '/',
    headers: {},
    body: undefined,
    ...overrides,
  };
}

describe('extension HTTP api — exact extension origin', () => {
  it('accepts POST /requests from the pinned extension origin and enqueues', async () => {
    const state = createState();
    const api = extensionApi(state);
    const res = await api(
      req({
        method: 'POST',
        path: '/requests',
        headers: { origin: EXTENSION_ORIGIN },
        body: payload(),
      }),
    );
    expect(res.status).toBe(200);
    expect((res.body as { id: string }).id).toBeTruthy();
    expect((res.body as { status: string }).status).toBe('pending');
    expect(state.list()).toHaveLength(1);
  });

  it.each([
    ['absent', undefined],
    ['localhost page', 'http://localhost:3000'],
    ['127.0.0.1 page', 'http://127.0.0.1:5500'],
    ['public page', 'https://evil.example.com'],
    ['wrong extension', 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ])('rejects %s origin with 403 and does not enqueue', async (_label, origin) => {
    const state = createState();
    const api = extensionApi(state);
    const res = await api(
      req({
        method: 'POST',
        path: '/requests',
        headers: { origin },
        body: payload(),
      }),
    );
    expect(res.status).toBe(403);
    expect(state.list()).toHaveLength(0);
  });

  it('rejects an invalid capture payload with 400', async () => {
    const state = createState();
    const api = extensionApi(state);
    const res = await api(
      req({
        method: 'POST',
        path: '/requests',
        headers: { origin: EXTENSION_ORIGIN },
        body: { nope: true },
      }),
    );
    expect(res.status).toBe(400);
    expect(state.list()).toHaveLength(0);
  });

  async function expectRejected(body: CapturePayload) {
    const state = createState();
    const api = extensionApi(state);
    const res = await api(
      req({
        method: 'POST',
        path: '/requests',
        headers: { origin: EXTENSION_ORIGIN },
        body,
      }),
    );

    expect(res.status).toBe(400);
    expect(state.list()).toHaveLength(0);
  }

  it('rejects more than eight locator candidates with 400', async () => {
    const invalid = payload();
    invalid.element.locatorEvidence.candidates = Array.from(
      { length: 9 },
      (_, index) => ({ kind: 'id', value: `#save-${index}`, matchCount: 1, stability: 100 }),
    );

    await expectRejected(invalid);
  });

  it('rejects locator stability above 100 with 400', async () => {
    const invalid = payload();
    invalid.element.locatorEvidence.candidates[0].stability = 101;

    await expectRejected(invalid);
  });

  it('rejects a user question longer than 2,000 characters with 400', async () => {
    await expectRejected(payload({ userQuestion: 'q'.repeat(2_001) }));
  });

  it('GET /status returns queue summary and active session', async () => {
    const state = createState();
    state.enqueue(payload());
    const api = extensionApi(state);
    const res = await api(req({ method: 'GET', path: '/status', headers: { origin: EXTENSION_ORIGIN } }));
    expect(res.status).toBe(200);
    const b = res.body as { activeSessionId: string | null; queue: Array<{ status: string }> };
    expect(b.activeSessionId).toBe(null);
    expect(b.queue).toHaveLength(1);
    expect(b.queue[0].status).toBe('pending');
  });

  it('GET /version.json returns the version', async () => {
    const state = createState();
    const api = extensionApi(state, '9.9.9');
    const res = await api(req({ method: 'GET', path: '/version.json' }));
    expect(res.status).toBe(200);
    expect((res.body as { version: string }).version).toBe('9.9.9');
  });

  it('POST /release clears the active session', async () => {
    const state = createState();
    state.register('a', 'A');
    state.claim('a');
    const api = extensionApi(state);
    const res = await api(req({ method: 'POST', path: '/release', headers: { origin: EXTENSION_ORIGIN }, body: {} }));
    expect(res.status).toBe(200);
    expect(state.activeSessionId).toBe(null);
  });
});

describe('IPC api — token guard', () => {
  const TOKEN = 'test-secret-token';

  function ipc(state = createState()) {
    return { state, api: createIpcApi(state, { token: TOKEN }) };
  }

  it('rejects a missing token with 401', async () => {
    const { api } = ipc();
    const res = await api(req({ method: 'POST', path: '/ipc', body: { op: 'register', sessionId: 'a', label: 'A' } }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong token with 401', async () => {
    const { api } = ipc();
    const res = await api(
      req({ method: 'POST', path: '/ipc', headers: { 'x-web-picker-token': 'wrong' }, body: { op: 'register', sessionId: 'a', label: 'A' } }),
    );
    expect(res.status).toBe(401);
  });

  it('register + claim works with a valid token', async () => {
    const { state, api } = ipc();
    const h = { 'x-web-picker-token': TOKEN };
    await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'register', sessionId: 'a', label: 'Claude Code' } }));
    const res = await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'claim', sessionId: 'a' } }));
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect(state.activeSessionId).toBe('a');
  });

  it('claim fails when occupied, take_over succeeds', async () => {
    const { state, api } = ipc();
    const h = { 'x-web-picker-token': TOKEN };
    await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'register', sessionId: 'a', label: 'A' } }));
    await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'register', sessionId: 'b', label: 'B' } }));
    await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'claim', sessionId: 'a' } }));
    const claim2 = await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'claim', sessionId: 'b' } }));
    expect((claim2.body as { ok: boolean }).ok).toBe(false);
    const takeover = await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'take_over', sessionId: 'b' } }));
    expect((takeover.body as { ok: boolean }).ok).toBe(true);
    expect(state.activeSessionId).toBe('b');
  });

  it('pull returns pending requests and marks them claimed; resolve resolves', async () => {
    const { state, api } = ipc();
    const h = { 'x-web-picker-token': TOKEN };
    const reqRow = state.enqueue(payload());
    const pulled = await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'pull' } }));
    expect((pulled.body as { requests: Array<{ id: string }> }).requests[0].id).toBe(reqRow.id);
    expect(state.get(reqRow.id)?.status).toBe('claimed');
    const resolved = await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'resolve', id: reqRow.id } }));
    expect((resolved.body as { ok: boolean }).ok).toBe(true);
    expect(state.get(reqRow.id)?.status).toBe('resolved');
  });

  it('rejects an unknown op with 400', async () => {
    const { api } = ipc();
    const res = await api(req({ method: 'POST', path: '/ipc', headers: { 'x-web-picker-token': TOKEN }, body: { op: 'nonsense' } }));
    expect(res.status).toBe(400);
  });

  it('list returns the whole queue; get returns one by id', async () => {
    const state = createState();
    const row = state.enqueue(payload());
    const api = createIpcApi(state, { token: TOKEN });
    const h = { 'x-web-picker-token': TOKEN };
    const list = await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'list' } }));
    expect((list.body as { requests: unknown[] }).requests).toHaveLength(1);
    const got = await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'get', id: row.id } }));
    expect((got.body as { request: { id: string } }).request.id).toBe(row.id);
    const missing = await api(req({ method: 'POST', path: '/ipc', headers: h, body: { op: 'get', id: 'nope' } }));
    expect((missing.body as { request: unknown }).request).toBe(null);
  });

  it('watch returns immediately when a pending request already exists', async () => {
    const state = createState();
    state.enqueue(payload());
    const api = createIpcApi(state, { token: TOKEN });
    const res = await api(req({ method: 'POST', path: '/ipc', headers: { 'x-web-picker-token': TOKEN }, body: { op: 'watch', timeoutMs: 50 } }));
    expect((res.body as { requests: unknown[] }).requests).toHaveLength(1);
  });

  it('watch times out to an empty list when nothing arrives', async () => {
    const state = createState();
    const api = createIpcApi(state, { token: TOKEN });
    const res = await api(req({ method: 'POST', path: '/ipc', headers: { 'x-web-picker-token': TOKEN }, body: { op: 'watch', timeoutMs: 20 } }));
    expect((res.body as { requests: unknown[] }).requests).toHaveLength(0);
  });

  it('watch resolves when a request is enqueued during the wait', async () => {
    const state = createState();
    const api = createIpcApi(state, { token: TOKEN });
    const pending = api(req({ method: 'POST', path: '/ipc', headers: { 'x-web-picker-token': TOKEN }, body: { op: 'watch', timeoutMs: 1000 } }));
    setTimeout(() => state.enqueue(payload()), 10);
    const res = await pending;
    expect((res.body as { requests: unknown[] }).requests).toHaveLength(1);
  });
});

describe('server adapter — binds 127.0.0.1 and wires both apis', () => {
  it('serves extension and IPC over a real socket on 127.0.0.1', async () => {
    const state = createState();
    const server = createServer({ state, version: '0.1.0', token: 'sock-token', expectedExtensionOrigin: EXTENSION_ORIGIN });
    const { host, port } = await server.listen(0);
    expect(host).toBe('127.0.0.1');
    try {
      // extension: version.json
      const vres = await fetch(`http://127.0.0.1:${port}/version.json`);
      expect(vres.status).toBe(200);
      expect((await vres.json()).version).toBe('0.1.0');

      // ipc: register requires token
      const noAuth = await fetch(`http://127.0.0.1:${port}/ipc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'register', sessionId: 'a', label: 'A' }),
      });
      expect(noAuth.status).toBe(401);

      const ok = await fetch(`http://127.0.0.1:${port}/ipc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-web-picker-token': 'sock-token' },
        body: JSON.stringify({ op: 'register', sessionId: 'a', label: 'A' }),
      });
      expect(ok.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('answers pinned-extension CORS preflight with 204 and a fixed allow origin', async () => {
    const state = createState();
    const server = createServer({ state, version: '0.1.0', token: 'x', expectedExtensionOrigin: EXTENSION_ORIGIN });
    const { port } = await server.listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/requests`, {
        method: 'OPTIONS',
        headers: { origin: EXTENSION_ORIGIN },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe(EXTENSION_ORIGIN);
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    } finally {
      await server.close();
    }
  });

  it.each([
    ['absent', undefined],
    ['localhost page', 'http://localhost:3000'],
    ['public page', 'https://evil.example.com'],
    ['wrong extension', 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ])('rejects %s origin preflight without reflecting it', async (_label, origin) => {
    const server = createServer({
      state: createState(),
      version: '0.1.0',
      token: 'x',
      expectedExtensionOrigin: EXTENSION_ORIGIN,
    });
    const { port } = await server.listen(0);
    try {
      const headers = origin ? { origin } : undefined;
      const res = await fetch(`http://127.0.0.1:${port}/requests`, { method: 'OPTIONS', headers });

      expect(res.status).toBe(403);
      expect(res.headers.get('access-control-allow-origin')).toBe(EXTENSION_ORIGIN);
    } finally {
      await server.close();
    }
  });
});
