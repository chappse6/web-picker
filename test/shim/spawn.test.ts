import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLauncher } from '../../src/shim/spawn.js';
import { startDaemon } from '../../src/daemon/daemon.js';
import { resolvePaths, writeRuntime } from '../../src/daemon/paths.js';
import { DEFAULT_PORT } from '../../src/daemon/state.js';

const PACKAGE_VERSION = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version as string;

async function listenServer(
  handler: http.RequestListener,
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, port: (server.address() as AddressInfo).port };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('daemon launcher', () => {
  let home: string;
  const originalWebPickerPort = process.env.WEB_PICKER_PORT;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'wp-spawn-'));
  });
  afterEach(() => {
    if (originalWebPickerPort === undefined) delete process.env.WEB_PICKER_PORT;
    else process.env.WEB_PICKER_PORT = originalWebPickerPort;
    rmSync(home, { recursive: true, force: true });
  });

  it('reuses an already-running daemon without spawning', async () => {
    const daemon = await startDaemon({ home, port: 0 });
    try {
      let spawned = 0;
      const launcher = createLauncher({ home, port: 0, spawnDaemon: () => { spawned += 1; } });
      const handle = await launcher.ensureRunning();
      expect(spawned).toBe(0);
      expect(handle.port).toBe(daemon.port);
      expect(handle.token).toBe(daemon.token);
    } finally {
      await daemon.close();
    }
  });

  it('reuses recorded runtime only after matching version and authenticated IPC', async () => {
    const token = 'recorded-secret';
    const requests: Array<{ url: string; token: string | undefined; body: string }> = [];
    const { server, port } = await listenServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        requests.push({
          url: request.url ?? '',
          token: request.headers['x-web-picker-token'] as string | undefined,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(
          request.url === '/version.json'
            ? { version: PACKAGE_VERSION }
            : { ok: true },
        ));
      });
    });
    writeRuntime(resolvePaths({ home, env: {} }), { port, token, pid: process.pid });
    let spawned = 0;

    try {
      const handle = await createLauncher({
        home,
        port,
        spawnDaemon: () => { spawned += 1; },
      }).ensureRunning();

      expect(handle).toEqual({ port, token });
      expect(spawned).toBe(0);
      expect(requests).toEqual([
        { url: '/version.json', token: undefined, body: '' },
        {
          url: '/ipc',
          token,
          body: JSON.stringify({ op: 'heartbeat', sessionId: '__launcher_probe__' }),
        },
      ]);
    } finally {
      await closeServer(server);
    }
  });

  it('spawns the daemon when none is running, then returns a working handle', async () => {
    let started: Awaited<ReturnType<typeof startDaemon>> | undefined;
    const launcher = createLauncher({
      home,
      port: 0,
      spawnDaemon: async ({ home: h, port }) => {
        started = await startDaemon({ home: h, port });
      },
    });
    try {
      const handle = await launcher.ensureRunning();
      expect(handle.token).toBeTruthy();
      const res = await fetch(`http://127.0.0.1:${handle.port}/version.json`);
      expect(res.status).toBe(200);
    } finally {
      await started?.close();
    }
  });

  it.each([
    ['uses WEB_PICKER_PORT=0 for an ephemeral daemon', '0', undefined, 0],
    ['falls back to the default port for an invalid WEB_PICKER_PORT', 'invalid', undefined, DEFAULT_PORT],
    ['prefers an explicit port over WEB_PICKER_PORT', '0', 0, 0],
  ])('%s', async (_label, envPort, explicitPort, expectedPort) => {
    process.env.WEB_PICKER_PORT = envPort;
    let started: Awaited<ReturnType<typeof startDaemon>> | undefined;
    let spawnPort: number | undefined;
    const launcher = createLauncher({
      home,
      ...(explicitPort === undefined ? {} : { port: explicitPort }),
      spawnDaemon: async ({ home: daemonHome, port }) => {
        spawnPort = port;
        started = await startDaemon({ home: daemonHome, port });
      },
    });

    try {
      await launcher.ensureRunning();
      expect(spawnPort).toBe(expectedPort);
    } finally {
      await started?.close();
    }
  });

  it('spawns on the configured port when that port refuses connections', async () => {
    const reservation = await listenServer((_request, response) => response.end());
    const port = reservation.port;
    await closeServer(reservation.server);
    let started: Awaited<ReturnType<typeof startDaemon>> | undefined;
    let spawnPort: number | undefined;
    const launcher = createLauncher({
      home,
      port,
      spawnDaemon: async ({ home: daemonHome, port: configuredPort }) => {
        spawnPort = configuredPort;
        started = await startDaemon({ home: daemonHome, port: configuredPort });
      },
    });

    try {
      const handle = await launcher.ensureRunning();
      expect(spawnPort).toBe(port);
      expect(handle.port).toBe(port);
    } finally {
      await started?.close();
    }
  });

  it('fails before spawn when the configured port is occupied by a non-Web Picker process', async () => {
    const { server, port } = await listenServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('not web picker');
    });
    let spawned = 0;

    try {
      const launcher = createLauncher({
        home,
        port,
        spawnDaemon: () => { spawned += 1; },
        readyTimeoutMs: 150,
        pollIntervalMs: 20,
      });

      await expect(launcher.ensureRunning()).rejects.toThrow(
        `Port ${port} is occupied by a non-Web Picker process.`,
      );
      expect(spawned).toBe(0);
    } finally {
      await closeServer(server);
    }
  });

  it.each([
    ['a mismatched version', '0.0.0', 200],
    ['rejected authenticated IPC', PACKAGE_VERSION, 401],
  ])('does not reuse recorded runtime with %s', async (_label, version, ipcStatus) => {
    const token = 'recorded-secret';
    const { server, port } = await listenServer((request, response) => {
      response.writeHead(request.url === '/ipc' ? ipcStatus : 200, {
        'content-type': 'application/json',
      });
      response.end(JSON.stringify(
        request.url === '/version.json' ? { version } : { error: 'unauthorized' },
      ));
    });
    writeRuntime(resolvePaths({ home, env: {} }), { port, token, pid: process.pid });

    try {
      const launcher = createLauncher({
        home,
        port,
        spawnDaemon: () => {},
        readyTimeoutMs: 150,
        pollIntervalMs: 20,
      });

      await expect(launcher.ensureRunning()).rejects.toThrow(
        `Port ${port} is occupied by a non-Web Picker process.`,
      );
    } finally {
      await closeServer(server);
    }
  });

  it('throws if the daemon never becomes reachable', async () => {
    const launcher = createLauncher({
      home,
      port: 0,
      spawnDaemon: () => { /* never starts anything */ },
      readyTimeoutMs: 150,
      pollIntervalMs: 20,
    });
    await expect(launcher.ensureRunning()).rejects.toThrow();
  });
});
