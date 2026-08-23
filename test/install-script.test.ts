import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('one-command installer', () => {
  it('is a valid bash script that documents the public curl entry', () => {
    const script = join(ROOT, 'install.sh');
    execFileSync('bash', ['-n', script], { stdio: 'pipe' });
    const text = readFileSync(script, 'utf8');
    expect(text).toContain('https://raw.githubusercontent.com/chappse6/web-picker/master/install.sh');
    expect(text).toContain('npm run build');
    expect(text).toContain('register-codex.sh');
    expect(text).toContain('launch-chrome.sh');
  });

  it('can locate the launch-chrome helper', () => {
    const script = join(ROOT, 'scripts/launch-chrome.sh');
    execFileSync('bash', ['-n', script], { stdio: 'pipe' });
    const text = readFileSync(script, 'utf8');
    expect(text).toContain('--load-extension=');
  });
});
