// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

afterEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
  delete window.__webPickerLoaded;
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubChrome(sendMessage: ReturnType<typeof vi.fn>) {
  const requested: string[] = [];
  const extensionRoot = pathToFileURL(`${join(process.cwd(), 'extension')}/`);
  vi.stubGlobal('chrome', {
    runtime: {
      getURL(path: string) {
        requested.push(path);
        return new URL(path, extensionRoot).href;
      },
      sendMessage,
    },
  });
  return requested;
}

function accessibleResources() {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'extension/manifest.json'), 'utf8'),
  ) as { web_accessible_resources: Array<{ resources: string[] }> };
  return new Set(manifest.web_accessible_resources.flatMap((entry) => entry.resources));
}

it('initializes through manifest-accessible modules and starts pick in general mode', async () => {
  const accessible = accessibleResources();
  const sendMessage = vi.fn().mockResolvedValue({
    ok: false,
    error: { status: 503, code: 'daemon-unavailable' },
  });
  const requested = stubChrome(sendMessage);

  await import('../../extension/content.js?manifest-initialization');

  await vi.waitFor(() => {
    expect(document.querySelector('#wp-fab .wp-brand')?.textContent).toBe('webpicker');
    expect(document.querySelector('#wp-fab')?.classList.contains('err')).toBe(true);
  });
  for (const modulePath of requested) {
    expect(accessible.has(modulePath), `${modulePath} must be web-accessible`).toBe(true);
  }

  document.querySelector<HTMLElement>('#wp-dot')!.click();
  expect(document.documentElement.classList.contains('wp-picking')).toBe(true);
  expect(document.documentElement.textContent).not.toContain('SECRET_QUESTION');
});

it('copies a masked prompt when MCP is not connected', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  const sendMessage = vi.fn().mockImplementation(async (message: { type: string }) => {
    if (message.type === 'web-picker:get-status') {
      return { ok: true, data: { activeSessionId: null, queue: [] } };
    }
    return { ok: true, data: { id: 'should-not-queue' } };
  });
  stubChrome(sendMessage);

  document.body.innerHTML = '<main><button id="profile-save">저장 owner@example.com</button></main>';
  await import('../../extension/content.js?offline-copy');

  const pick = await vi.waitFor(() => {
    const node = document.querySelector<HTMLElement>('#wp-pick');
    expect(node?.hidden).toBe(false);
    return node!;
  });
  pick.click();

  const target = document.getElementById('profile-save')!;
  target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  const input = await vi.waitFor(() => document.querySelector<HTMLTextAreaElement>('#wp-q')!);
  expect(document.querySelector('#wp-send')?.textContent).toBe('복사');
  expect(document.documentElement.textContent).toContain('클립보드에 복사됩니다');
  input.value = '이 버튼을 파란색으로 바꾸고 owner@example.com 은 숨기세요';
  document.querySelector<HTMLElement>('#wp-send')!.click();

  await vi.waitFor(() => {
    expect(writeText).toHaveBeenCalled();
    expect(document.documentElement.textContent).toContain('복사했습니다');
  });
  const done = document.querySelector<HTMLElement>('#wp-panel')!;
  expect(done.style.width).toBeTruthy();
  expect(done.style.height).toBeTruthy();
  const copied = String(writeText.mock.calls[0]?.[0] || '');
  expect(copied).toContain('파란색');
  expect(copied).not.toContain('owner@example.com');
  expect(sendMessage.mock.calls.some((call) => call[0]?.type === 'web-picker:create-request')).toBe(false);
});

it('still queues the request when an MCP session is live', async () => {
  const writeText = vi.fn();
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  const sendMessage = vi.fn().mockImplementation(async (message: { type: string }) => {
    if (message.type === 'web-picker:get-status') {
      return { ok: true, data: { activeSessionId: 'agent-1', queue: [] } };
    }
    if (message.type === 'web-picker:create-request') {
      return { ok: true, data: { id: 'req-9' } };
    }
    return { ok: false, error: { code: 'unknown' } };
  });
  stubChrome(sendMessage);

  document.body.innerHTML = '<main><button id="profile-save">저장</button></main>';
  await import('../../extension/content.js?mcp-queue');

  const pick = await vi.waitFor(() => {
    const node = document.querySelector<HTMLElement>('#wp-pick');
    expect(node?.hidden).toBe(false);
    return node!;
  });
  pick.click();
  const target = document.getElementById('profile-save')!;
  target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  const input = await vi.waitFor(() => document.querySelector<HTMLTextAreaElement>('#wp-q')!);
  expect(document.querySelector('#wp-send')?.textContent).toBe('보내기');
  input.value = '버튼을 키워 주세요';
  document.querySelector<HTMLElement>('#wp-send')!.click();

  await vi.waitFor(() => {
    expect(document.documentElement.textContent).toContain('보냈습니다');
  });
  expect(writeText).not.toHaveBeenCalled();
  expect(sendMessage.mock.calls.some((call) => call[0]?.type === 'web-picker:create-request')).toBe(true);
});

it('keeps the minimized chip to brand + connection + queue and locks the pick', async () => {
  const sendMessage = vi.fn().mockImplementation(async (message: { type: string }) => {
    if (message.type === 'web-picker:get-status') {
      return {
        ok: true,
        data: {
          activeSessionId: 'agent-1',
          queue: [{ status: 'pending' }, { status: 'pending' }, { status: 'resolved' }],
        },
      };
    }
    return { ok: true, data: { id: 'req-1' } };
  });
  stubChrome(sendMessage);

  document.body.innerHTML = '<main><button id="profile-save">저장</button></main>';
  await import('../../extension/content.js?minimized-chip');

  const fab = await vi.waitFor(() => {
    const node = document.querySelector<HTMLElement>('#wp-fab');
    expect(node?.classList.contains('ok')).toBe(true);
    return node!;
  });

  expect(fab.style.left).toBeTruthy();
  expect(fab.style.right).toBe('auto');
  expect(fab.textContent).toContain('webpicker');
  expect(fab.textContent).not.toContain('요소 선택');
  expect(document.querySelector('#wp-qbadge')?.textContent).toBe('2');
  expect(document.querySelector('#wp-panel')).toBeNull();

  fab.click();
  expect(document.documentElement.classList.contains('wp-picking')).toBe(false);
  const pick = document.querySelector<HTMLElement>('#wp-pick')!;
  pick.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  pick.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
  expect(document.documentElement.classList.contains('wp-picking')).toBe(true);

  const target = document.getElementById('profile-save')!;
  Object.defineProperty(target, 'getBoundingClientRect', {
    value: () => ({ top: 80, bottom: 120, left: 24, right: 140, width: 116, height: 40, x: 24, y: 80, toJSON() {} }),
  });
  target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  await vi.waitFor(() => {
    expect(document.querySelector('#wp-highlight')?.classList.contains('wp-locked')).toBe(true);
    expect(document.querySelector('#wp-q')).not.toBeNull();
  });
  await vi.waitFor(() => {
    const composer = document.querySelector<HTMLElement>('#wp-panel');
    expect(composer?.style.left).toBeTruthy();
    expect(composer?.style.top).toBeTruthy();
  });
  expect(document.documentElement.textContent).not.toContain('localhost 허용');
  expect(document.documentElement.textContent).not.toContain('텍스트·HTML 기본 마스킹');
});
