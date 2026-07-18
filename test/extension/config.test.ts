import { describe, it, expect } from 'vitest';
import { isLocalhost, daemonUrl, DAEMON_HOST, DAEMON_PORT } from '../../extension/config.js';

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
