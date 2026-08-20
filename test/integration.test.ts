import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const EXTENSION_ORIGIN = 'chrome-extension://mnglicpibnccgcifnndemfpidkcgboli';

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
    headers: { 'content-type': 'application/json', origin: EXTENSION_ORIGIN },
    body: JSON.stringify(payload),
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
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
    const healthyStatus = await fetch(`http://127.0.0.1:${daemon.port}/status`, {
      headers: { origin: EXTENSION_ORIGIN },
    });
    expect((await responseBody(healthyStatus)).warning).toBe(null);

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

  it('keeps repeated same-session connects usable and rejects a client after takeover', async () => {
    const response = await postCapture(
      daemon.port,
      capture('#owned', 'main', 'Owned', 'owned request'),
    );
    const requestId = String((await responseBody(response)).id);
    const launcher = createLauncher({ home, port: 0 });
    const owner = createClient({
      launcher,
      createTransport: createHttpTransport,
      sessionId: 'owner',
      label: 'Owner',
    });
    const other = createClient({
      launcher,
      createTransport: createHttpTransport,
      sessionId: 'other',
      label: 'Other',
    });

    await expect(owner.connect()).resolves.toMatchObject({ claimed: true });
    await expect(owner.connect()).resolves.toMatchObject({ claimed: true });
    await expect(owner.get(requestId)).resolves.toMatchObject({ id: requestId });
    await expect(other.connect()).resolves.toMatchObject({ claimed: false, activeSessionId: 'owner' });

    await expect(other.takeOver()).resolves.toEqual({ ok: true, activeSessionId: 'other' });
    await expect(owner.list()).rejects.toThrow('ipc list failed: 409');
    await expect(owner.get(requestId)).rejects.toThrow('ipc get failed: 409');
    await expect(owner.resolve(requestId)).rejects.toThrow('ipc resolve failed: 409');
    await expect(other.list()).resolves.toHaveLength(1);
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

describe('integration: durable queue recovery', () => {
  let home: string;
  let daemon: Awaited<ReturnType<typeof startDaemon>>;
  let daemonRunning: boolean;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'wp-restart-'));
    daemon = await startDaemon({ home, port: 0 });
    daemonRunning = true;
  });

  afterEach(async () => {
    if (daemonRunning) await daemon.close();
    rmSync(home, { recursive: true, force: true });
  });

  it('recovers claimed work as pending and preserves resolved work without sessions', async () => {
    const firstResponse = await postCapture(
      daemon.port,
      capture('#first', 'main', 'First', 'first request'),
    );
    const firstId = String((await responseBody(firstResponse)).id);
    const transport = createHttpTransport(daemon);
    await transport.send('register', { sessionId: 'session-secret', label: 'Agent' });
    await transport.send('claim', { sessionId: 'session-secret' });
    expect((await transport.send('pull', { sessionId: 'session-secret' })).requests).toHaveLength(1);

    const secondResponse = await postCapture(
      daemon.port,
      capture('#second', 'main', 'Second', 'second request'),
    );
    const secondId = String((await responseBody(secondResponse)).id);
    await daemon.close();
    daemonRunning = false;

    const paths = resolvePaths({ home, env: {} });
    expect(readFileSync(paths.queueFile, 'utf8')).not.toContain('session-secret');

    daemon = await startDaemon({ home, port: 0 });
    daemonRunning = true;
    const recoveredTransport = createHttpTransport(daemon);
    await recoveredTransport.send('register', { sessionId: 'recovery-a', label: 'Recovery A' });
    await recoveredTransport.send('claim', { sessionId: 'recovery-a' });
    const recovered = await recoveredTransport.send('list', { sessionId: 'recovery-a' });
    expect(recovered.requests.map((row: { id: string }) => row.id)).toEqual([firstId, secondId]);
    expect(recovered.requests.map((row: { status: string }) => row.status)).toEqual(['pending', 'pending']);

    await recoveredTransport.send('resolve', { sessionId: 'recovery-a', id: firstId });
    await daemon.close();
    daemonRunning = false;

    daemon = await startDaemon({ home, port: 0 });
    daemonRunning = true;
    const finalTransport = createHttpTransport(daemon);
    await finalTransport.send('register', { sessionId: 'recovery-b', label: 'Recovery B' });
    await finalTransport.send('claim', { sessionId: 'recovery-b' });
    const afterResolve = await finalTransport.send('list', { sessionId: 'recovery-b' });
    expect(afterResolve.requests.map((row: { id: string; status: string }) => [row.id, row.status]))
      .toEqual([[firstId, 'resolved'], [secondId, 'pending']]);
    expect(readFileSync(paths.queueFile, 'utf8')).not.toContain('session-secret');
  });
});

describe('integration: corrupt queue warning', () => {
  it('quarantines the queue and exposes only the warning code in status', async () => {
    const home = mkdtempSync(join(tmpdir(), 'wp-corrupt-'));
    const paths = resolvePaths({ home, env: {} });
    writeFileSync(paths.queueFile, '{broken SECRET_CAPTURE', { mode: 0o600 });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let daemon: Awaited<ReturnType<typeof startDaemon>> | undefined;

    try {
      daemon = await startDaemon({ home, port: 0 });
      const response = await fetch(`http://127.0.0.1:${daemon.port}/status`, {
        headers: { origin: EXTENSION_ORIGIN },
      });
      const body = await responseBody(response);

      expect(response.status).toBe(200);
      expect(body.warning).toBe('queue-corrupt');
      expect(JSON.stringify(body)).not.toContain('SECRET_CAPTURE');
      expect(warning.mock.calls.flat().join(' ')).not.toContain('SECRET_CAPTURE');
    } finally {
      if (daemon) await daemon.close();
      warning.mockRestore();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
