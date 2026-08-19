import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRuntimeMessage } from '../../extension/runtime-api.js';
import { getStatus, getVersion, postRequest, release } from '../../extension/transport.js';

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

afterEach(() => vi.unstubAllGlobals());

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

  it('normalizes an unknown typed dependency error instead of relaying it', async () => {
    const error = Object.assign(new Error('SECRET_QUESTION <img src=x>'), {
      code: 'SECRET_QUESTION <img src=x>',
      status: 502,
    });
    const transport = deps({ getStatus: vi.fn().mockRejectedValue(error) });

    await expect(handleRuntimeMessage(
      { type: 'web-picker:get-status' },
      { tab: { url: 'http://localhost:3000/' } },
      transport,
    )).resolves.toEqual({
      ok: false,
      error: { code: 'daemon-unavailable', status: 503 },
    });
  });

  it('normalizes a mismatched public dependency error pair', async () => {
    const error = Object.assign(new Error('forbidden-origin'), {
      code: 'forbidden-origin',
      status: 400,
    });
    const transport = deps({ getStatus: vi.fn().mockRejectedValue(error) });

    await expect(handleRuntimeMessage(
      { type: 'web-picker:get-status' },
      { tab: { url: 'http://localhost:3000/' } },
      transport,
    )).resolves.toEqual({
      ok: false,
      error: { code: 'daemon-unavailable', status: 503 },
    });
  });

  it.each([
    [400, 'invalid-payload'],
    [403, 'forbidden-origin'],
    [413, 'payload-too-large'],
    [507, 'persistence-failed'],
    [503, 'daemon-unavailable'],
  ])('preserves %s/%s across the runtime relay', async (status, code) => {
    const error = Object.assign(new Error(code), { status, code });
    const transport = deps({ postRequest: vi.fn().mockRejectedValue(error) });

    const result = await handleRuntimeMessage(
      { type: 'web-picker:create-request', payload: validPayload() },
      { tab: { url: 'http://localhost:3000/' } },
      transport,
    );

    expect(result).toEqual({ ok: false, error: { status, code } });
  });

  it.each([
    ['invalid-payload', '요소를 다시 선택해 요청을 작성해 주세요.'],
    ['forbidden-origin', '확장 프로그램을 새로고침하거나 다시 설치해 주세요.'],
    ['payload-too-large', '요청을 짧게 줄이거나 더 작은 요소를 다시 선택해 주세요.'],
    ['persistence-failed', '디스크 여유 공간과 웹픽커 저장 폴더 권한을 확인해 주세요.'],
    ['daemon-unavailable', '웹픽커 데몬을 시작하거나 도구 등록을 다시 실행해 주세요.'],
  ])('provides static Korean guidance for %s without captured content', async (code, note) => {
    const guidanceModule = await import('../../extension/error-guidance.js').catch(() => ({}));

    expect(guidanceModule.runtimeErrorGuidance?.(code)).toEqual({
      title: '요청을 보낼 수 없습니다',
      note,
    });
    expect(note).not.toContain('SECRET_CAPTURE');
  });
});

describe('extension daemon transport', () => {
  it.each([
    ['create request', () => postRequest(validPayload()), 400, 'invalid-payload'],
    ['status', () => getStatus(), 403, 'forbidden-origin'],
    ['release', () => release(), 507, 'persistence-failed'],
    ['version', () => getVersion(), 503, 'daemon-unavailable'],
  ])('throws a typed response error for %s', async (_label, call, status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: code }),
      { status, headers: { 'content-type': 'application/json' } },
    )));

    await expect(call()).rejects.toMatchObject({ status, code, message: code });
  });

  it.each([
    [418, 'SECRET_QUESTION <img src=x>'],
    [400, 'forbidden-origin'],
    [500, undefined],
  ])('normalizes an unsafe or mismatched %s response error', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify(code === undefined ? {} : { error: code }),
      { status, headers: { 'content-type': 'application/json' } },
    )));

    let caught;
    try {
      await getStatus();
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      status: 503,
      code: 'daemon-unavailable',
      message: 'daemon-unavailable',
    });
    expect(JSON.stringify(caught)).not.toContain('SECRET_QUESTION');
  });
});
