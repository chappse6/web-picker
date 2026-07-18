import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLauncher } from '../../src/shim/spawn.js';
import { startDaemon } from '../../src/daemon/daemon.js';

describe('daemon launcher', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'wp-spawn-'));
  });
  afterEach(() => {
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
