import { describe, it, expect } from 'vitest';
import { createClient, createHttpTransport } from '../../src/shim/client.js';
import type { DaemonHandle, IpcTransport } from '../../src/shim/client.js';
import { createState } from '../../src/daemon/state.js';
import { createServer } from '../../src/daemon/server.js';

const EXTENSION_ORIGIN = 'chrome-extension://mnglicpibnccgcifnndemfpidkcgboli';

function fakeLauncher(handle: DaemonHandle = { port: 8787, token: 't' }) {
  let count = 0;
  return {
    calls: () => count,
    ensureRunning: async () => {
      count += 1;
      return handle;
    },
  };
}

function fakeTransport(responses: Record<string, unknown> = {}) {
  const calls: Array<{ op: string; args?: Record<string, unknown> }> = [];
  const transport: IpcTransport = {
    async send(op, args) {
      calls.push({ op, args });
      return responses[op] ?? { ok: true };
    },
  };
  return { calls, transport };
}

describe('shim client — lazy daemon start', () => {
  it('lazy-starts the daemon exactly once across multiple ops', async () => {
    const launcher = fakeLauncher();
    const { transport } = fakeTransport();
    const client = createClient({
      launcher,
      createTransport: () => transport,
      sessionId: 'a',
      label: 'Claude Code',
    });
    await client.connect();
    await client.heartbeat();
    await client.pull();
    expect(launcher.calls()).toBe(1);
  });
});

describe('shim client — connect / claim', () => {
  it('registers then auto-claims on connect', async () => {
    const { transport, calls } = fakeTransport({
      claim: { ok: true, activeSessionId: 'a', pending: 2 },
    });
    const client = createClient({
      launcher: fakeLauncher(),
      createTransport: () => transport,
      sessionId: 'a',
      label: 'Claude Code',
    });
    const result = await client.connect();
    expect(calls.map((c) => c.op)).toEqual(['register', 'claim']);
    expect(result.claimed).toBe(true);
    expect(result.pending).toBe(2);
  });

  it('surfaces occupied state when claim fails', async () => {
    const { transport } = fakeTransport({
      claim: { ok: false, activeSessionId: 'other', pending: 0 },
    });
    const client = createClient({
      launcher: fakeLauncher(),
      createTransport: () => transport,
      sessionId: 'a',
      label: 'Codex',
    });
    const result = await client.connect();
    expect(result.claimed).toBe(false);
    expect(result.activeSessionId).toBe('other');
  });

  it('sends its session id with every queue operation', async () => {
    const { transport, calls } = fakeTransport({
      list: { ok: true, requests: [] },
      pull: { ok: true, requests: [] },
      watch: { ok: true, requests: [] },
      get: { ok: true, request: null },
      resolve: { ok: true },
    });
    const client = createClient({
      launcher: fakeLauncher(),
      createTransport: () => transport,
      sessionId: 'session-a',
      label: 'A',
    });

    await client.list();
    await client.pull();
    await client.watch(123);
    await client.get('r1');
    await client.resolve('r1');

    expect(calls).toEqual([
      { op: 'list', args: { sessionId: 'session-a' } },
      { op: 'pull', args: { sessionId: 'session-a' } },
      { op: 'watch', args: { sessionId: 'session-a', timeoutMs: 123 } },
      { op: 'get', args: { sessionId: 'session-a', id: 'r1' } },
      { op: 'resolve', args: { sessionId: 'session-a', id: 'r1' } },
    ]);
  });

  it('takeOver transfers occupancy', async () => {
    const { transport, calls } = fakeTransport({
      take_over: { ok: true, activeSessionId: 'a' },
    });
    const client = createClient({
      launcher: fakeLauncher(),
      createTransport: () => transport,
      sessionId: 'a',
      label: 'Codex',
    });
    const result = await client.takeOver();
    expect(result.ok).toBe(true);
    expect(result.activeSessionId).toBe('a');
    expect(calls.at(-1)).toEqual({ op: 'take_over', args: { sessionId: 'a' } });
  });

  it('watch forwards timeout and returns requests', async () => {
    const { transport, calls } = fakeTransport({
      watch: { ok: true, requests: [{ id: 'r9' }] },
    });
    const client = createClient({
      launcher: fakeLauncher(),
      createTransport: () => transport,
      sessionId: 'a',
      label: 'A',
    });
    const requests = await client.watch(1234);
    expect(requests.map((r) => r.id)).toEqual(['r9']);
    expect(calls.at(-1)).toEqual({ op: 'watch', args: { sessionId: 'a', timeoutMs: 1234 } });
  });

  it('pull returns requests and resolve forwards the id', async () => {
    const { transport, calls } = fakeTransport({
      pull: { ok: true, requests: [{ id: 'r1' }, { id: 'r2' }] },
      resolve: { ok: true },
    });
    const client = createClient({
      launcher: fakeLauncher(),
      createTransport: () => transport,
      sessionId: 'a',
      label: 'A',
    });
    const requests = await client.pull();
    expect(requests.map((r) => r.id)).toEqual(['r1', 'r2']);
    const r = await client.resolve('r1');
    expect(r.ok).toBe(true);
    expect(calls.at(-1)).toEqual({ op: 'resolve', args: { sessionId: 'a', id: 'r1' } });
  });
});

describe('http transport — talks to a real daemon server', () => {
  it('registers and claims over http with the token', async () => {
    const state = createState();
    const server = createServer({
      state,
      version: '0.1.0',
      token: 'real-token',
      expectedExtensionOrigin: EXTENSION_ORIGIN,
    });
    const { port } = await server.listen(0);
    try {
      const transport = createHttpTransport({ port, token: 'real-token' });
      const reg = await transport.send('register', { sessionId: 'a', label: 'A' });
      expect(reg.ok).toBe(true);
      const claim = await transport.send('claim', { sessionId: 'a' });
      expect(claim.ok).toBe(true);
      expect(state.activeSessionId).toBe('a');
    } finally {
      await server.close();
    }
  });

  it('rejects with an error when the token is wrong', async () => {
    const state = createState();
    const server = createServer({
      state,
      version: '0.1.0',
      token: 'real-token',
      expectedExtensionOrigin: EXTENSION_ORIGIN,
    });
    const { port } = await server.listen(0);
    try {
      const transport = createHttpTransport({ port, token: 'bad' });
      await expect(transport.send('register', { sessionId: 'a', label: 'A' })).rejects.toThrow();
    } finally {
      await server.close();
    }
  });
});
