/**
 * Daemon launcher (adapter implementing the DaemonLauncher port).
 *
 * The actual process spawn is injectable (spawnDaemon) so the launcher logic
 * — probe existing, spawn if absent, wait until reachable — unit-tests without
 * a real child process. The default spawnDaemon launches the built daemon.js.
 */
import { spawn } from 'node:child_process';
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

/** Probe the daemon at the recorded port; returns a handle only if it answers. */
async function tryHandle(home: string): Promise<DaemonHandle | null> {
  const rt = readRuntime(resolvePaths({ home }));
  if (!rt.port || !rt.token) return null;
  try {
    const res = await fetch(`http://127.0.0.1:${rt.port}/version.json`);
    if (!res.ok) return null;
    return { port: rt.port, token: rt.token };
  } catch {
    return null;
  }
}

export function createLauncher(opts: LauncherOptions = {}): DaemonLauncher {
  const home = opts.home ?? resolvePaths().dir;
  const port = opts.port ?? DEFAULT_PORT;
  const daemonEntry = opts.daemonEntry ?? defaultDaemonEntry();
  const spawnDaemon = opts.spawnDaemon ?? defaultSpawn;
  const readyTimeoutMs = opts.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  return {
    async ensureRunning(): Promise<DaemonHandle> {
      const existing = await tryHandle(home);
      if (existing) return existing;

      await spawnDaemon({ home, port, daemonEntry });

      const deadline = Date.now() + readyTimeoutMs;
      while (Date.now() < deadline) {
        const handle = await tryHandle(home);
        if (handle) return handle;
        await delay(pollIntervalMs);
      }
      throw new Error('daemon did not become reachable in time');
    },
  };
}
