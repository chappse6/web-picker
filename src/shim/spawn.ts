/**
 * Daemon launcher (adapter implementing the DaemonLauncher port).
 *
 * The actual process spawn is injectable (spawnDaemon) so the launcher logic
 * — probe existing, spawn if absent, wait until reachable — unit-tests without
 * a real child process. The default spawnDaemon launches the built daemon.js.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { DaemonHandle, DaemonLauncher } from './client.js';
import { resolvePaths, readRuntime } from '../daemon/paths.js';
import { DEFAULT_PORT } from '../daemon/state.js';

export interface SpawnContext {
  home: string;
  port: number;
  daemonEntry: string;
}

export interface LauncherOptions {
  home?: string;
  /** WEB_PICKER_PORT for the spawned daemon; 0 = ephemeral. Default 8787. */
  port?: number;
  /** path to the compiled daemon entry (dist/daemon/daemon.js). */
  daemonEntry?: string;
  /** injectable process spawn; default launches node on daemonEntry. */
  spawnDaemon?: (ctx: SpawnContext) => void | Promise<void>;
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
}

const DEFAULT_READY_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const PROBE_TIMEOUT_MS = 500;

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function defaultDaemonEntry(): string {
  // dist/shim/spawn.js -> dist/daemon/daemon.js
  return fileURLToPath(new URL('../daemon/daemon.js', import.meta.url));
}

function defaultSpawn(ctx: SpawnContext): void {
  const child = spawn(process.execPath, [ctx.daemonEntry], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WEB_PICKER_HOME: ctx.home, WEB_PICKER_PORT: String(ctx.port) },
  });
  child.unref();
}

/** Probe recorded runtime and trust it only after version + token authentication. */
async function tryHandle(home: string, expectedVersion: string): Promise<DaemonHandle | null> {
  const rt = readRuntime(resolvePaths({ home }));
  if (!rt.port || !rt.token) return null;
  try {
    const versionResponse = await fetch(`http://127.0.0.1:${rt.port}/version.json`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!versionResponse.ok) return null;
    const versionBody = await versionResponse.json() as { version?: unknown };
    if (versionBody.version !== expectedVersion) return null;

    const ipcResponse = await fetch(`http://127.0.0.1:${rt.port}/ipc`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-web-picker-token': rt.token,
      },
      body: JSON.stringify({ op: 'heartbeat', sessionId: '__launcher_probe__' }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!ipcResponse.ok) return null;
    const ipcBody = await ipcResponse.json() as { ok?: unknown };
    if (ipcBody.ok !== true) return null;
    return { port: rt.port, token: rt.token };
  } catch {
    return null;
  }
}

function portIsOccupied(port: number): Promise<boolean> {
  if (port === 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (occupied: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(occupied);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(PROBE_TIMEOUT_MS, () => finish(false));
  });
}

function occupiedPortError(port: number): Error {
  return new Error(`Port ${port} is occupied by a non-Web Picker process.`);
}

export function createLauncher(opts: LauncherOptions = {}): DaemonLauncher {
  const home = opts.home ?? resolvePaths().dir;
  const port = opts.port ?? DEFAULT_PORT;
  const daemonEntry = opts.daemonEntry ?? defaultDaemonEntry();
  const spawnDaemon = opts.spawnDaemon ?? defaultSpawn;
  const readyTimeoutMs = opts.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const expectedVersion = readVersion();

  return {
    async ensureRunning(): Promise<DaemonHandle> {
      const existing = await tryHandle(home, expectedVersion);
      if (existing) return existing;

      if (await portIsOccupied(port)) {
        throw occupiedPortError(port);
      }

      try {
        await spawnDaemon({ home, port, daemonEntry });
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'EADDRINUSE') throw error;
        const racingDaemon = await tryHandle(home, expectedVersion);
        if (racingDaemon) return racingDaemon;
        throw occupiedPortError(port);
      }

      const deadline = Date.now() + readyTimeoutMs;
      while (Date.now() < deadline) {
        const handle = await tryHandle(home, expectedVersion);
        if (handle) return handle;
        await delay(pollIntervalMs);
      }
      if (await portIsOccupied(port)) throw occupiedPortError(port);
      throw new Error('daemon did not become reachable in time');
    },
  };
}
