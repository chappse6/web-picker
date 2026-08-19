/**
 * Daemon communication owned exclusively by the background service worker.
 * Browser fetch therefore supplies the pinned chrome-extension:// origin for
 * protected endpoints. version.json remains origin-free for reload probing.
 */
import { daemonUrl } from './config.js';

export async function postRequest(payload) {
  const res = await fetch(daemonUrl('/requests'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`daemon responded ${res.status}`);
  return res.json();
}

export async function getStatus() {
  const res = await fetch(daemonUrl('/status'));
  if (!res.ok) throw new Error(`daemon responded ${res.status}`);
  return res.json();
}

export async function release() {
  const res = await fetch(daemonUrl('/release'), { method: 'POST' });
  if (!res.ok) throw new Error(`daemon responded ${res.status}`);
  return res.json();
}

export async function getVersion() {
  const res = await fetch(daemonUrl('/version.json'));
  if (!res.ok) throw new Error(`daemon responded ${res.status}`);
  return res.json();
}
