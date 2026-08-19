/**
 * Background service worker (module).
 *
 * Two jobs:
 *  1. Auto-reload the extension when the daemon reports a newer version, so a
 *     `load unpacked` install picks up daemon-side changes without a manual
 *     reload (dev convenience; version.json needs no origin check).
 *  2. Own all daemon HTTP for content scripts after validating the sender tab.
 */
import { VERSION } from './config.js';
import * as transport from './transport.js';
import { handleRuntimeMessage } from './runtime-api.js';

const POLL_INTERVAL_MS = 15_000;

async function checkVersionAndMaybeReload() {
  try {
    const { version } = await transport.getVersion();
    if (version && version !== VERSION) {
      // daemon moved ahead of this unpacked build; reload to stay in sync
      chrome.runtime.reload();
    }
  } catch {
    // daemon not running — ignore quietly
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message, sender, transport).then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(checkVersionAndMaybeReload);
chrome.runtime.onStartup?.addListener(checkVersionAndMaybeReload);

// MV3 service workers can be evicted; a periodic alarm re-checks.
chrome.alarms?.create('wp-version-poll', { periodInMinutes: 0.5 });
chrome.alarms?.onAlarm.addListener((a) => {
  if (a.name === 'wp-version-poll') checkVersionAndMaybeReload();
});

// also run once when the worker spins up
checkVersionAndMaybeReload();
void POLL_INTERVAL_MS;
