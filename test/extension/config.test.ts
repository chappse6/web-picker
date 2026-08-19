import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isLocalhost, daemonUrl, DAEMON_HOST, DAEMON_PORT } from '../../extension/config.js';

const EXPECTED_EXTENSION_ID = 'mnglicpibnccgcifnndemfpidkcgboli';

describe('isLocalhost — activation guard', () => {
  it('allows localhost and 127.0.0.1 and ::1', () => {
    expect(isLocalhost('localhost')).toBe(true);
    expect(isLocalhost('127.0.0.1')).toBe(true);
    expect(isLocalhost('::1')).toBe(true);
    expect(isLocalhost('[::1]')).toBe(true);
  });

  it('allows *.localhost subdomains', () => {
    expect(isLocalhost('app.localhost')).toBe(true);
  });

  it('blocks public hosts and lookalikes', () => {
    expect(isLocalhost('example.com')).toBe(false);
    expect(isLocalhost('notlocalhost.com')).toBe(false);
    expect(isLocalhost('localhost.evil.com')).toBe(false);
    expect(isLocalhost('127.0.0.1.evil.com')).toBe(false);
  });
});

describe('daemonUrl', () => {
  it('builds a 127.0.0.1 daemon url', () => {
    expect(daemonUrl('/requests')).toBe(`http://${DAEMON_HOST}:${DAEMON_PORT}/requests`);
    expect(DAEMON_HOST).toBe('127.0.0.1');
    expect(DAEMON_PORT).toBe(8787);
  });
});

describe('extension identity', () => {
  it('derives the pinned extension ID from the manifest public key', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../extension/manifest.json', import.meta.url), 'utf8'),
    ) as { key?: string };
    const digest = createHash('sha256').update(Buffer.from(manifest.key ?? '', 'base64')).digest('hex');
    const extensionId = digest
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (digit) => String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(digit, 16)));

    expect(extensionId).toBe(EXPECTED_EXTENSION_ID);
  });
});
