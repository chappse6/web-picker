import { describe, it, expect } from 'vitest';
import { createTools } from '../../src/shim/tools.js';
import type { WebPickerClient } from '../../src/shim/client.js';
import type { WebRequest } from '../../src/shared/types.js';

function reqRow(id = 'r1'): WebRequest {
  return {
    id,
    status: 'pending',
    createdAt: 0,
    claimedAt: null,
    resolvedAt: null,
    payload: {
      url: 'http://localhost:3000/',
      title: 'Test',
      viewport: { width: 1024, height: 768 },
      element: {
        selector: '#save-btn',
        tagName: 'button',
        id: 'save-btn',
        className: 'btn',
        role: null,
        ariaLabel: null,
        dataset: [],
        attributes: {},
        ancestors: [{ tagName: 'footer', id: null, className: null, role: null }],
        rect: { x: 0, y: 0, width: 100, height: 40 },
        maskedText: '••••',
        maskedOuterHTML: '<button>',
        landmark: 'footer',
        visibleLabel: '저장',
        locatorEvidence: {
          candidates: [{ kind: 'id', value: '#save-btn', matchCount: 1, stability: 100 }],
          confidence: 'high',
          reasons: ['unique-candidate'],
        },
      },
      userQuestion: 'make it blue',
      createdAt: '2026-07-18T00:00:00.000Z',
      source: 'chrome-extension',
    },
  };
}

function fakeClient(overrides: Partial<WebPickerClient> = {}) {
  const calls: string[] = [];
  const base: WebPickerClient = {
    async connect() {
      calls.push('connect');
      return { claimed: true, activeSessionId: 'me', pending: 1 };
    },
    async takeOver() {
      calls.push('takeOver');
      return { ok: true, activeSessionId: 'me' };
    },
    async release() {
      calls.push('release');
      return { ok: true };
    },
    async heartbeat() {
      calls.push('heartbeat');
    },
    async list() {
      calls.push('list');
      return [reqRow()];
    },
    async pull() {
      calls.push('pull');
      return [reqRow()];
    },
    async watch() {
      calls.push('watch');
      return [reqRow('r2')];
    },
    async get(id) {
      calls.push('get:' + id);
      return id === 'missing' ? null : reqRow(id);
    },
    async resolve(id) {
      calls.push('resolve:' + id);
      return { ok: id !== 'missing' };
    },
    ...overrides,
  };
  return { calls, client: base };
}

describe('MCP tools', () => {
  it('connect_web_picker reports holding the session', async () => {
    const { client } = fakeClient();
    const tools = createTools(client);
    const r = await tools.connect_web_picker();
    expect(r.content[0].text).toMatch(/hold the web picker/i);
  });

  it('connect_web_picker reports occupied when claim fails', async () => {
    const { client } = fakeClient({
      async connect() {
        return { claimed: false, activeSessionId: 'other', pending: 0 };
      },
    });
    const r = await createTools(client).connect_web_picker();
    expect(r.content[0].text).toMatch(/take_over_web_picker/);
  });

  it('list_web_requests auto-claims on first call then lists', async () => {
    const { client, calls } = fakeClient();
    const tools = createTools(client);
    const r = await tools.list_web_requests();
    expect(calls).toEqual(['connect', 'list']);
    expect(r.content[0].text).toContain('r1');
    expect(r.content[0].text).toContain('저장');
  });

  it('list_web_requests does not re-connect once claimed', async () => {
    const { client, calls } = fakeClient();
    const tools = createTools(client);
    await tools.list_web_requests();
    await tools.list_web_requests();
    expect(calls).toEqual(['connect', 'list', 'list']);
  });

  it('list_web_requests returns an error result when occupied', async () => {
    const { client, calls } = fakeClient({
      async connect() {
        return { claimed: false, activeSessionId: 'other', pending: 0 };
      },
    });
    const r = await createTools(client).list_web_requests();
    expect(r.isError).toBe(true);
    expect(calls).not.toContain('list');
  });

  it('watch_web_requests long-polls and returns new requests', async () => {
    const { client, calls } = fakeClient();
    const r = await createTools(client).watch_web_requests({ timeoutMs: 10 });
    expect(calls).toContain('watch');
    expect(r.content[0].text).toContain('r2');
  });

  it('get_web_request returns element detail with identifying clues', async () => {
    const { client } = fakeClient();
    const r = await createTools(client).get_web_request({ id: 'r1' });
    const t = r.content[0].text;
    expect(t).toContain('selector: #save-btn');
    expect(t).toContain('landmark: footer');
    expect(t).toContain('visibleLabel: 저장');
  });

  it('get_web_request errors on unknown id', async () => {
    const { client } = fakeClient();
    const r = await createTools(client).get_web_request({ id: 'missing' });
    expect(r.isError).toBe(true);
  });

  it('resolve_web_request confirms resolution', async () => {
    const { client } = fakeClient();
    const r = await createTools(client).resolve_web_request({ id: 'r1' });
    expect(r.content[0].text).toMatch(/Resolved r1/);
  });

  it('release_web_picker releases and forces re-claim on next list', async () => {
    const { client, calls } = fakeClient();
    const tools = createTools(client);
    await tools.list_web_requests(); // connect + list
    await tools.release_web_picker(); // release
    await tools.list_web_requests(); // must connect again
    expect(calls).toEqual(['connect', 'list', 'release', 'connect', 'list']);
  });

  it('take_over_web_picker claims and lets list skip re-connect', async () => {
    const { client, calls } = fakeClient();
    const tools = createTools(client);
    await tools.take_over_web_picker();
    await tools.list_web_requests();
    expect(calls).toEqual(['takeOver', 'list']);
  });
});
