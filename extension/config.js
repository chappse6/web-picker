/**
 * Extension config + the localhost activation guard.
 *
 * v1 is localhost-only by design. isLocalhost is the single source of truth for
 * "should Web Picker activate on this page" and is unit-tested against
 * lookalike hosts (localhost.evil.com must NOT pass).
 */

export const DAEMON_HOST = '127.0.0.1';
export const DAEMON_PORT = 8787;
export const VERSION = '0.1.0';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

export function isLocalhost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (LOCAL_HOSTS.has(h)) return true;
  // allow *.localhost (e.g. app.localhost) but not localhost.evil.com
  if (h.endsWith('.localhost')) return true;
  return false;
}

export function daemonUrl(path) {
  return `http://${DAEMON_HOST}:${DAEMON_PORT}${path}`;
}
