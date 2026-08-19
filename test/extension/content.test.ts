// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

afterEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
  delete window.__webPickerLoaded;
  vi.unstubAllGlobals();
});

it('initializes through manifest-accessible modules and renders safe guidance', async () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'extension/manifest.json'), 'utf8'),
  ) as { web_accessible_resources: Array<{ resources: string[] }> };
  const accessible = new Set(
    manifest.web_accessible_resources.flatMap((entry) => entry.resources),
  );
  const requested: string[] = [];
  const extensionRoot = pathToFileURL(`${join(process.cwd(), 'extension')}/`);
  const sendMessage = vi.fn().mockResolvedValue({
    ok: false,
    error: { status: 413, code: 'payload-too-large' },
  });
  vi.stubGlobal('chrome', {
    runtime: {
      getURL(path: string) {
        requested.push(path);
        return new URL(path, extensionRoot).href;
      },
      sendMessage,
    },
  });

  await import('../../extension/content.js?manifest-initialization');

  await vi.waitFor(() => {
    expect(document.querySelector('button[title="웹픽커"]')).not.toBeNull();
  });
  for (const modulePath of requested) {
    expect(accessible.has(modulePath), `${modulePath} must be web-accessible`).toBe(true);
  }

  document.querySelector<HTMLButtonElement>('button[title="웹픽커"]')!.click();
  await vi.waitFor(() => {
    expect(document.documentElement.textContent).toContain(
      '요청을 짧게 줄이거나 더 작은 요소를 다시 선택해 주세요.',
    );
  });
  expect(document.documentElement.textContent).not.toContain('SECRET_QUESTION');
});
