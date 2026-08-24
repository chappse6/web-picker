import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { chromium, type BrowserContext } from 'playwright-core';
import {
  CHROME_REQUIRED,
  composeChromeExtensionArguments,
  configuredChromeExecutable,
  isExecutableFile,
  normalizeChromeLaunchError,
} from './chrome-launch.js';
import { startTestPageServer, type RunningTestPageServer } from './server.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SENSITIVE_EMAIL = 'owner@example.com';

function requireChrome(): string | undefined {
  const configured = process.env.PLAYWRIGHT_CHROME_EXECUTABLE?.trim();
  if (configured) {
    return configuredChromeExecutable(configured);
  }

  const candidates = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  if (!candidates.some((candidate) => candidate && isExecutableFile(candidate))) {
    throw new Error(CHROME_REQUIRED);
  }
  return undefined;
}

async function launchChrome(profileDir: string): Promise<BrowserContext> {
  const executablePath = requireChrome();
  const extensionArguments = composeChromeExtensionArguments(join(ROOT, 'extension'));
  try {
    return await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: false,
      ignoreDefaultArgs: extensionArguments.ignoreDefaultArgs,
      args: extensionArguments.args,
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (error) {
    const normalized = normalizeChromeLaunchError(error);
    if (normalized) throw normalized;
    throw error;
  }
}

describe('real Chrome extension offline clipboard copy', () => {
  let context: BrowserContext | undefined;
  let testServer: RunningTestPageServer | undefined;
  let profileDir: string | undefined;

  afterEach(async () => {
    await context?.close().catch(() => undefined);
    await testServer?.close().catch(() => undefined);
    if (profileDir) rmSync(profileDir, { recursive: true, force: true });
  });

  it('copies a masked prompt when MCP is not connected', async () => {
    profileDir = mkdtempSync(join(tmpdir(), 'web-picker-chrome-offline-'));
    testServer = await startTestPageServer(join(ROOT, 'test-page'));
    context = await launchChrome(profileDir);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: testServer.url });

    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(testServer.url);
    await page.locator('#wp-fab').waitFor({ state: 'visible' });
    expect(await page.locator('#wp-fab').getAttribute('class')).toContain('err');

    await page.locator('#wp-pick').click();
    await page.locator('html.wp-picking').waitFor();
    await page.locator('#profile-save').click();
    await page.locator('#wp-q').waitFor({ state: 'visible' });
    expect(await page.locator('#wp-send').textContent()).toBe('복사');
    expect(await page.locator('#wp-mode-hint').textContent()).toContain('클립보드');

    await page.locator('#wp-q').fill(`이 버튼을 파란색으로 바꾸고 ${SENSITIVE_EMAIL} 은 숨기세요`);
    await page.locator('#wp-send').click();

    const success = page.locator('.wp-succ-title');
    await success.waitFor({ state: 'visible' });
    expect(await success.textContent()).toBe('복사했습니다');

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('파란색');
    expect(copied).toContain('selector:');
    expect(copied).toContain('masking: text-shaped, values-removed');
    expect(copied).not.toContain(SENSITIVE_EMAIL);
  });
});
