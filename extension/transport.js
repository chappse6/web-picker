/**
 * Daemon communication owned exclusively by the background service worker.
 * Browser fetch therefore supplies the pinned chrome-extension:// origin for
 * protected endpoints. version.json remains origin-free for reload probing.
 */
import { daemonUrl } from './config.js';
import { normalizePublicError } from './public-errors.js';

export class DaemonError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'DaemonError';
    this.status = status;
    this.code = code;
  }
}

async function jsonOrThrow(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const normalized = normalizePublicError(res.status, body?.error);
    throw new DaemonError(normalized.status, normalized.code);
  }
  return body;
}

export async function postRequest(payload) {
  const res = await fetch(daemonUrl('/requests'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function getStatus() {
  const res = await fetch(daemonUrl('/status'));
  return jsonOrThrow(res);
}

export async function release() {
  const res = await fetch(daemonUrl('/release'), { method: 'POST' });
  return jsonOrThrow(res);
}

export async function getVersion() {
  const res = await fetch(daemonUrl('/version.json'));
  return jsonOrThrow(res);
}
