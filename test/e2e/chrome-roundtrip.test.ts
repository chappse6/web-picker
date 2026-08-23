import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { chromium, type BrowserContext } from 'playwright-core';
import { startDaemon, type RunningDaemon } from '../../src/daemon/daemon.js';
import { createClient, createHttpTransport, type WebPickerClient } from '../../src/shim/client.js';
import { createLauncher } from '../../src/shim/spawn.js';
import {
  CHROME_REQUIRED,
  composeChromeExtensionArguments,
  configuredChromeExecutable,
  isExecutableFile,
  normalizeChromeLaunchError,
} from './chrome-launch.js';
import { startTestPageServer, type RunningTestPageServer } from './server.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DAEMON_PORT = 8787;
const SENSITIVE_EMAIL = 'judge-sensitive@example.com';
const SENSITIVE_TOKEN = 'judge_sensitive_token_1234567890';

function requireChrome(): string | undefined {
  const configured = process.env.PLAYWRIGHT_CHROME_EXECUTABLE?.trim();
  if (configured) {
    return configuredChromeExecutable(configured);
  }

  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform === 'win32'
      ? [
          join(process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];

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

describe('real Chrome extension to MCP round trip', () => {
  let context: BrowserContext | undefined;
  let testServer: RunningTestPageServer | undefined;
  let daemon: RunningDaemon | undefined;
  let client: WebPickerClient | undefined;
  let profileDir: string | undefined;
  let runtimeHome: string | undefined;

  afterEach(async () => {
    const cleanupErrors: unknown[] = [];
    const close = async (operation: (() => Promise<unknown>) | undefined) => {
      if (!operation) return;
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(error);
      }
    };

    await close(context && (() => context!.close()));
    await close(testServer && (() => testServer!.close()));
    await close(client && (() => client!.release()));
    await close(daemon && (() => daemon!.close()));

    for (const generatedDir of [profileDir, runtimeHome]) {
      if (generatedDir) rmSync(generatedDir, { recursive: true, force: true });
    }

    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'E2E cleanup failed');
  });

  it('submits a real picked element and resolves its locator evidence through MCP', async () => {
    profileDir = mkdtempSync(join(tmpdir(), 'web-picker-chrome-profile-'));
    runtimeHome = mkdtempSync(join(tmpdir(), 'web-picker-runtime-'));
    testServer = await startTestPageServer(join(ROOT, 'test-page'));
    daemon = await startDaemon({ home: runtimeHome, port: DAEMON_PORT });
    context = await launchChrome(profileDir);

    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(testServer.url);
    await page.locator('#wp-fab').waitFor({ state: 'visible' });

    await page.locator('#email').fill(SENSITIVE_EMAIL);
    await page.locator('#bio').fill(SENSITIVE_TOKEN);
    await page.locator('#wp-fab').click();
    await page.locator('#profile-save').click();
    await page.locator('#wp-q').fill('이 버튼을 파란색으로');
    await page.locator('#wp-send').click();

    const success = page.locator('.wp-succ-title');
    await success.waitFor({ state: 'visible' });
    expect(await success.textContent()).toBe('요청을 큐에 보냈습니다');

    client = createClient({
      launcher: createLauncher({ home: runtimeHome, port: DAEMON_PORT }),
      createTransport: createHttpTransport,
      sessionId: randomUUID(),
      label: 'Chrome E2E MCP client',
    });
    const connected = await client.connect();
    expect(connected).toMatchObject({ claimed: true, pending: 1 });

    const requests = await client.list();
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.status).toBe('pending');
    expect(request.payload.userQuestion).toBe('이 버튼을 파란색으로');
    expect(request.payload.element.locatorEvidence.confidence).toBe('high');
    expect(request.payload.element.locatorEvidence.candidates).toContainEqual({
      kind: 'id',
      value: '#profile-save',
      matchCount: 1,
      stability: 100,
    });

    const serializedEvidence = JSON.stringify(request.payload);
    expect(serializedEvidence).not.toContain(SENSITIVE_EMAIL);
    expect(serializedEvidence).not.toContain(SENSITIVE_TOKEN);

    expect(await client.resolve(request.id)).toEqual({ ok: true });
    expect((await client.get(request.id))?.status).toBe('resolved');
  });
});
