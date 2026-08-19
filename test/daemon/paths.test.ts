import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePaths, ensureDir, generateToken, writeRuntime, readRuntime } from '../../src/daemon/paths.js';

describe('resolvePaths', () => {
  it('prefers WEB_PICKER_HOME from the env', () => {
    const p = resolvePaths({ env: { WEB_PICKER_HOME: '/custom/home' } });
    expect(p.dir).toBe('/custom/home');
    expect(p.tokenFile).toBe(join('/custom/home', 'token'));
    expect(p.portFile).toBe(join('/custom/home', 'port'));
    expect(p.pidFile).toBe(join('/custom/home', 'daemon.pid'));
    expect(p.queueFile).toBe(join('/custom/home', 'queue.json'));
  });

  it('uses an explicit runtime directory even when the environment has a default', () => {
    const p = resolvePaths({
      home: '/explicit',
      env: { WEB_PICKER_HOME: '/environment-default' },
    });
    expect(p.dir).toBe('/explicit');
  });

  it('defaults under the user home directory', () => {
    const p = resolvePaths({ env: {}, homedir: '/Users/tester' });
    expect(p.dir).toBe(join('/Users/tester', '.web-picker'));
  });
});

describe('generateToken', () => {
  it('returns a 64-char hex string, unique per call', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('runtime read/write', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'wp-paths-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('round-trips port, token and pid', () => {
    const p = resolvePaths({ home });
    ensureDir(p);
    writeRuntime(p, { port: 8787, token: 'deadbeef', pid: 4242 });
    expect(readRuntime(p)).toEqual({ port: 8787, token: 'deadbeef', pid: 4242 });
  });

  it('writes the token file with 0600 permissions', () => {
    const p = resolvePaths({ home });
    ensureDir(p);
    writeFileSync(p.tokenFile, 'old-secret', { mode: 0o644 });
    chmodSync(p.tokenFile, 0o644);
    writeRuntime(p, { port: 8787, token: 'secret', pid: 1 });
    const mode = statSync(p.tokenFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('tightens an existing runtime directory to 0700', () => {
    const p = resolvePaths({ home });
    chmodSync(home, 0o755);

    ensureDir(p);

    expect(statSync(home).mode & 0o777).toBe(0o700);
  });

  it('returns an empty object when nothing has been written', () => {
    const p = resolvePaths({ home });
    ensureDir(p);
    expect(readRuntime(p)).toEqual({});
  });
});
