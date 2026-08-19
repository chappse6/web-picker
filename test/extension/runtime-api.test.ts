import { describe, expect, it, vi } from 'vitest';
import { handleRuntimeMessage } from '../../extension/runtime-api.js';

function validPayload() {
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
    },
    userQuestion: 'Make this button blue',
    createdAt: '2026-07-18T00:00:00.000Z',
    source: 'chrome-extension',
  };
}

function deps(overrides = {}) {
  return {
    postRequest: vi.fn(),
    getStatus: vi.fn(),
    release: vi.fn(),
    ...overrides,
  };
}

describe('extension runtime API', () => {
  it.each([
    'http://localhost:3000/',
    'http://127.0.0.1:5500/',
    'http://app.localhost:4173/',
  ])('forwards a valid sanitized request from local tab %s without stripping evidence', async (tabUrl) => {
    const payload = validPayload();
    const transport = deps({
      postRequest: vi.fn().mockResolvedValue({ id: 'req_1', status: 'pending' }),
    });

    const result = await handleRuntimeMessage(
      { type: 'web-picker:create-request', payload },
      { tab: { url: tabUrl } },
      transport,
    );

    expect(result).toEqual({ ok: true, data: { id: 'req_1', status: 'pending' } });
    expect(transport.postRequest).toHaveBeenCalledWith(payload);
    expect(transport.postRequest.mock.calls[0][0].element.locatorEvidence).toEqual(payload.element.locatorEvidence);
  });

  it.each([
    ['public page', { tab: { url: 'https://example.com/' } }],
    ['localhost lookalike', { tab: { url: 'https://localhost.evil.example/' } }],
    ['extension page', { tab: { url: 'chrome-extension://mnglicpibnccgcifnndemfpidkcgboli/popup.html' } }],
    ['missing tab URL', { tab: {} }],
    ['missing sender', undefined],
  ])('rejects a %s sender before transport', async (_label, sender) => {
    const transport = deps();

    const result = await handleRuntimeMessage(
      { type: 'web-picker:create-request', payload: validPayload() },
      sender,
      transport,
    );

    expect(result).toEqual({ ok: false, error: { code: 'forbidden-sender', status: 403 } });
    expect(transport.postRequest).not.toHaveBeenCalled();
    expect(transport.getStatus).not.toHaveBeenCalled();
    expect(transport.release).not.toHaveBeenCalled();
  });

  it('routes status and release messages for a local tab', async () => {
    const transport = deps({
      getStatus: vi.fn().mockResolvedValue({ queue: [] }),
      release: vi.fn().mockResolvedValue({ ok: true, released: null }),
    });
    const sender = { tab: { url: 'http://localhost:3000/' } };

    await expect(handleRuntimeMessage({ type: 'web-picker:get-status' }, sender, transport))
      .resolves.toEqual({ ok: true, data: { queue: [] } });
    await expect(handleRuntimeMessage({ type: 'web-picker:release' }, sender, transport))
      .resolves.toEqual({ ok: true, data: { ok: true, released: null } });
  });

  it.each([
    ['missing create payload', { type: 'web-picker:create-request' }],
    ['null create payload', { type: 'web-picker:create-request', payload: null }],
    ['malformed create payload', { type: 'web-picker:create-request', payload: { source: 'chrome-extension' } }],
    ['create payload without locator evidence', (() => {
      const payload = validPayload();
      delete payload.element.locatorEvidence;
      return { type: 'web-picker:create-request', payload };
    })()],
    ['status payload', { type: 'web-picker:get-status', payload: { ignored: true } }],
    ['release payload', { type: 'web-picker:release', payload: { ignored: true } }],
  ])('rejects %s as invalid before transport', async (_label, message) => {
    const transport = deps();

    const result = await handleRuntimeMessage(
      message,
      { tab: { url: 'http://localhost:3000/' } },
      transport,
    );

    expect(result).toEqual({ ok: false, error: { code: 'invalid-message', status: 400 } });
    expect(transport.postRequest).not.toHaveBeenCalled();
    expect(transport.getStatus).not.toHaveBeenCalled();
    expect(transport.release).not.toHaveBeenCalled();
  });

  it('rejects unknown messages without touching transport', async () => {
    const transport = deps();
    const result = await handleRuntimeMessage(
      { type: 'web-picker:not-real' },
      { tab: { url: 'http://localhost:3000/' } },
      transport,
    );

    expect(result).toEqual({ ok: false, error: { code: 'unknown-message', status: 400 } });
    expect(transport.postRequest).not.toHaveBeenCalled();
    expect(transport.getStatus).not.toHaveBeenCalled();
    expect(transport.release).not.toHaveBeenCalled();
  });

  it('returns a typed daemon error instead of rejecting', async () => {
    const error = Object.assign(new Error('offline'), { code: 'daemon-offline', status: 502 });
    const transport = deps({ getStatus: vi.fn().mockRejectedValue(error) });

    await expect(handleRuntimeMessage(
      { type: 'web-picker:get-status' },
      { tab: { url: 'http://localhost:3000/' } },
      transport,
    )).resolves.toEqual({ ok: false, error: { code: 'daemon-offline', status: 502 } });
  });
});
