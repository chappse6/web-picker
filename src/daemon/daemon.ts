/**
 * Daemon entrypoint.
 *
 * `startDaemon` is the programmatic API (used by tests and the launcher's
 * in-process path); the CLI main at the bottom runs it and keeps the process
 * alive. Binds 127.0.0.1 only and writes runtime files (token 0600).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createState } from './state.js';
import { DEFAULT_PORT } from './state.js';
import { createServer } from './server.js';
import { createFileQueueStore } from './file-persistence.js';
import { resolvePaths, ensureDir, generateToken, writeRuntime } from './paths.js';

export const EXPECTED_EXTENSION_ORIGIN = 'chrome-extension://mnglicpibnccgcifnndemfpidkcgboli';

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface StartDaemonOptions {
  home?: string;
  port?: number;
}

export interface RunningDaemon {
  port: number;
  token: string;
  close(): Promise<void>;
}

export async function startDaemon(opts: StartDaemonOptions = {}): Promise<RunningDaemon> {
  const paths = resolvePaths({ home: opts.home });
  ensureDir(paths);

  const token = generateToken();
  const version = readVersion();
  const queueStore = createFileQueueStore(paths);
  const recovered = queueStore.load();
  const state = createState({
    initialRequests: recovered.requests,
    persistence: queueStore,
  });
  const server = createServer({
    state,
    version,
    token,
    expectedExtensionOrigin: EXPECTED_EXTENSION_ORIGIN,
    queueWarning: recovered.warning,
  });

  const requestedPort = opts.port ?? Number.parseInt(process.env.WEB_PICKER_PORT ?? '', 10);
  const port = Number.isFinite(requestedPort) ? requestedPort : DEFAULT_PORT;

  const addr = await server.listen(port);
  writeRuntime(paths, { port: addr.port, token, pid: process.pid });

  return {
    port: addr.port,
    token,
    close: () => server.close(),
  };
}

// CLI main: `node dist/daemon/daemon.js`
const invokedPath = process.argv[1];
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  startDaemon().catch((err) => {
    // EADDRINUSE means another daemon already owns the port — that's fine.
    if ((err as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
      process.exit(0);
    }
    console.error('daemon failed to start:', err);
    process.exit(1);
  });
}
