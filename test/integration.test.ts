import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDaemon } from '../src/daemon/daemon.js';
import { createLauncher } from '../src/shim/spawn.js';
import { createClient, createHttpTransport } from '../src/shim/client.js';
import { createTools } from '../src/shim/tools.js';
import { resolvePaths, readRuntime } from '../src/daemon/paths.js';
import type { CapturePayload } from '../src/shared/types.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function capture(selector: string, landmark: string, visibleLabel: string, question: string): CapturePayload {
  return {
    url: 'http://localhost:3000/',
    title: 'Demo',
    viewport: { width: 1024, height: 768 },
    element: {
      selector,
      tagName: 'button',
      id: null,
      className: 'btn',
      role: null,
      ariaLabel: null,
      dataset: [],
      attributes: {},
      ancestors: [{ tagName: landmark, id: null, className: null, role: null }],
      rect: { x: 0, y: 0, width: 80, height: 32 },
      maskedText: '••',
      maskedOuterHTML: '<button class="btn">…</button>',
      landmark,
      visibleLabel,
      locatorEvidence: {
        candidates: [{ kind: 'css-path', value: selector, matchCount: 1, stability: 45 }],
        confidence: 'medium',
        reasons: ['unique-candidate'],
      },
    },
    userQuestion: question,
    createdAt: '2026-07-18T00:00:00.000Z',
    source: 'chrome-extension',
  };
}

async function postCapture(port: number, payload: CapturePayload) {
  return fetch(`http://127.0.0.1:${port}/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(payload),
  });
}

describe('integration: pick -> queue -> MCP list/get -> resolve (in-process)', () => {
  let home: string;
  let daemon: Awaited<ReturnType<typeof startDaemon>>;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'wp-int-'));
    daemon = await startDaemon({ home, port: 0 });
  });
  afterEach(async () => {
    await daemon.close();
    rmSync(home, { recursive: true, force: true });
  });

  it('reproduces the full round trip and disambiguates a decoy element', async () => {
    // Three lookalike "저장" buttons under different landmarks — the decoy proof.
    await postCapture(daemon.port, capture('button.btn', 'header', '저장', 'ignore'));
    const target = capture('main section button.btn', 'main', '저장', 'make the main save button blue');
    const res = await postCapture(daemon.port, target);
    expect(res.status).toBe(200);
    await postCapture(daemon.port, capture('button.btn', 'footer', '저장', 'ignore'));

    // shim side: launcher finds the already-running daemon (no spawn)
    const launcher = createLauncher({ home, port: 0 });
    const client = createClient({
      launcher,
      createTransport: createHttpTransport,
      sessionId: 'agent-1',
      label: 'Claude Code',
    });
    const tools = createTools(client);

    const connect = await tools.connect_web_picker();
    expect(connect.content[0].text).toMatch(/hold the web picker/i);

    const list = await tools.list_web_requests();
    expect(list.content[0].text).toContain('make the main save button blue');

    // find the target request id and confirm its capture uniquely identifies it
    const rows = await client.list();
    const mainRow = rows.find((r) => r.payload.userQuestion.includes('main save'));
    expect(mainRow).toBeTruthy();
    const others = rows.filter((r) => r.id !== mainRow!.id);
    // same visibleLabel across decoys, but landmark + selector disambiguate
    expect(others.every((r) => r.payload.element.visibleLabel === '저장')).toBe(true);
    expect(others.every((r) => r.payload.element.landmark !== 'main')).toBe(true);

    const detail = await tools.get_web_request({ id: mainRow!.id });
    expect(detail.content[0].text).toContain('landmark: main');
    expect(detail.content[0].text).toContain('selector: main section button.btn');

    const resolved = await tools.resolve_web_request({ id: mainRow!.id });
    expect(resolved.content[0].text).toMatch(/Resolved/);
    expect((await client.get(mainRow!.id))?.status).toBe('resolved');
  });
});

describe('integration: cold spawn from built dist', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
  }, 180_000);

  it('launcher spawns the built daemon when none is running', async () => {
    const home = mkdtempSync(join(tmpdir(), 'wp-cold-'));
    const launcher = createLauncher({
      home,
      port: 0,
      daemonEntry: join(ROOT, 'dist/daemon/daemon.js'),
      readyTimeoutMs: 15_000,
    });
    try {
      const handle = await launcher.ensureRunning();
      const res = await fetch(`http://127.0.0.1:${handle.port}/version.json`);
      expect(res.status).toBe(200);
      expect((await res.json()).version).toBeTruthy();
    } finally {
      const rt = readRuntime(resolvePaths({ home }));
      if (rt.pid) {
        try {
          process.kill(rt.pid);
        } catch {
          /* already gone */
        }
      }
      rmSync(home, { recursive: true, force: true });
    }
  }, 30_000);
});
