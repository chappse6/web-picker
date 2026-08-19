/**
 * Runtime file locations + token generation for the daemon.
 *
 * Path computation is pure and injectable (env/home) so it unit-tests without
 * touching the real user home. IO helpers are thin wrappers on top.
 */
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Paths {
  dir: string;
  pidFile: string;
  tokenFile: string;
  portFile: string;
  configFile: string;
  queueFile: string;
}

export interface ResolveOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
  /** injectable for tests; defaults to os.homedir(). */
  homedir?: string;
}

export function resolvePaths(opts: ResolveOptions = {}): Paths {
  const env = opts.env ?? process.env;
  const base =
    opts.home ??
    env.WEB_PICKER_HOME ??
    join(opts.homedir ?? homedir(), '.web-picker');
  return {
    dir: base,
    pidFile: join(base, 'daemon.pid'),
    tokenFile: join(base, 'token'),
    portFile: join(base, 'port'),
    configFile: join(base, 'config.json'),
    queueFile: join(base, 'queue.json'),
  };
}

export function ensureDir(paths: Paths): void {
  mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  chmodSync(paths.dir, 0o700);
}

/** 32 random bytes as hex — the shared secret guarding the IPC endpoint. */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export interface Runtime {
  port: number;
  token: string;
  pid: number;
}

export function writeRuntime(paths: Paths, runtime: Runtime): void {
  ensureDir(paths);
  // token is user-only readable; port/pid are not secret
  writeFileSync(paths.tokenFile, runtime.token, { mode: 0o600 });
  chmodSync(paths.tokenFile, 0o600);
  writeFileSync(paths.portFile, String(runtime.port));
  writeFileSync(paths.pidFile, String(runtime.pid));
}

export function readRuntime(paths: Paths): Partial<Runtime> {
  const out: Partial<Runtime> = {};
  if (existsSync(paths.tokenFile)) out.token = readFileSync(paths.tokenFile, 'utf8').trim();
  if (existsSync(paths.portFile)) {
    const port = Number.parseInt(readFileSync(paths.portFile, 'utf8').trim(), 10);
    if (Number.isFinite(port)) out.port = port;
  }
  if (existsSync(paths.pidFile)) {
    const pid = Number.parseInt(readFileSync(paths.pidFile, 'utf8').trim(), 10);
    if (Number.isFinite(pid)) out.pid = pid;
  }
  return out;
}
