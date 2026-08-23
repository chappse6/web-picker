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

it('initializes through manifest-accessible modules and renders safe guidance', async () => {
  const accessible = accessibleResources();
  const sendMessage = vi.fn().mockResolvedValue({
    ok: false,
    error: { status: 413, code: 'payload-too-large' },
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
  await vi.waitFor(() => {
    expect(document.documentElement.textContent).toContain(
      '요청을 짧게 줄이거나 더 작은 요소를 다시 선택해 주세요.',
    );
  });
  expect(document.documentElement.textContent).not.toContain('SECRET_QUESTION');
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

  expect(fab.textContent).toContain('webpicker');
  expect(fab.textContent).not.toContain('요소 선택');
  expect(document.querySelector('#wp-qbadge')?.textContent).toBe('2');
  expect(document.querySelector('#wp-panel')).toBeNull();

  fab.click();
  expect(document.documentElement.classList.contains('wp-picking')).toBe(false);
  document.querySelector<HTMLElement>('#wp-pick')!.click();
  expect(document.documentElement.classList.contains('wp-picking')).toBe(true);

  const target = document.getElementById('profile-save')!;
  target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  await vi.waitFor(() => {
    expect(document.querySelector('#wp-highlight')?.classList.contains('wp-locked')).toBe(true);
    expect(document.querySelector('#wp-q')).not.toBeNull();
  });
  expect(document.documentElement.textContent).not.toContain('localhost 허용');
  expect(document.documentElement.textContent).not.toContain('텍스트·HTML 기본 마스킹');
});
