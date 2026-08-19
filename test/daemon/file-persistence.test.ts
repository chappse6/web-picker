import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileQueueStore } from '../../src/daemon/file-persistence.js';
import { QUEUE_SCHEMA_VERSION } from '../../src/daemon/persistence.js';
import { resolvePaths } from '../../src/daemon/paths.js';
import type {
  CapturePayload,
  QueueSnapshot,
  WebRequest,
} from '../../src/shared/types.js';

function payload(): CapturePayload {
  return {
    url: 'http://localhost:3000/',
    title: 'Test Page',
    viewport: { width: 1024, height: 768 },
    element: {
      selector: '#save-btn',
      tagName: 'button',
      id: 'save-btn',
      className: 'btn primary',
      role: null,
      ariaLabel: null,
      dataset: [],
      attributes: {},
      ancestors: [],
      rect: { x: 0, y: 0, width: 100, height: 40 },
      maskedText: '••••',
      maskedOuterHTML: '<button class="btn primary">…</button>',
      landmark: null,
      visibleLabel: 'Save',
      locatorEvidence: {
        candidates: [
          { kind: 'id', value: '#save-btn', matchCount: 1, stability: 100 },
        ],
        confidence: 'high',
        reasons: ['unique-candidate'],
      },
    },
    userQuestion: 'Make this button blue',
    createdAt: '2026-07-18T00:00:00.000Z',
    source: 'chrome-extension',
  };
}

function row(): WebRequest {
  return {
    id: 'req-1',
    payload: payload(),
    status: 'pending',
    createdAt: 1,
    claimedAt: null,
    resolvedAt: null,
  };
}

function snapshot(requests: WebRequest[]): QueueSnapshot {
  return { schemaVersion: QUEUE_SCHEMA_VERSION, requests };
}

describe('filesystem queue persistence', () => {
  let root: string;
  let runtimeDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wp-file-persistence-'));
    runtimeDir = join(root, 'runtime');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('writes queue atomically with user-only permissions', () => {
    const paths = resolvePaths({ home: runtimeDir, env: {} });
    const store = createFileQueueStore(paths);

    store.save(snapshot([row()]));

    expect(statSync(runtimeDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(runtimeDir, 'queue.json')).mode & 0o777).toBe(0o600);
    expect(readdirSync(runtimeDir).filter((name) => name.includes('.tmp-'))).toEqual([]);
    expect(JSON.parse(readFileSync(paths.queueFile, 'utf8'))).toEqual(snapshot([row()]));
  });

  it('loads a valid snapshot and tightens an existing queue file', () => {
    mkdirSync(runtimeDir, { mode: 0o755 });
    const paths = resolvePaths({ home: runtimeDir, env: {} });
    writeFileSync(paths.queueFile, JSON.stringify(snapshot([row()])), { mode: 0o644 });
    chmodSync(paths.queueFile, 0o644);

    const result = createFileQueueStore(paths).load();

    expect(result).toEqual({ requests: [row()], warning: null });
    expect(statSync(runtimeDir).mode & 0o777).toBe(0o700);
    expect(statSync(paths.queueFile).mode & 0o777).toBe(0o600);
  });

  it.each([
    ['invalid JSON', '{broken SECRET_CAPTURE'],
    ['invalid schema', JSON.stringify({ schemaVersion: 2, requests: [], secret: 'SECRET_CAPTURE' })],
  ])('quarantines %s without exposing captured content', (_label, contents) => {
    mkdirSync(runtimeDir, { mode: 0o700 });
    const paths = resolvePaths({ home: runtimeDir, env: {} });
    writeFileSync(paths.queueFile, contents, { mode: 0o600 });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = createFileQueueStore(paths).load();

    expect(result).toEqual({ requests: [], warning: 'queue-corrupt' });
    expect(readdirSync(runtimeDir).some((name) => /^queue\.json\.corrupt-\d+$/.test(name))).toBe(true);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls.flat().join(' ')).toContain('queue-corrupt');
    expect(warning.mock.calls.flat().join(' ')).not.toContain('SECRET_CAPTURE');
  });

  it('returns an empty healthy queue when no snapshot exists', () => {
    const result = createFileQueueStore(
      resolvePaths({ home: runtimeDir, env: {} }),
    ).load();

    expect(result).toEqual({ requests: [], warning: null });
    expect(statSync(runtimeDir).mode & 0o777).toBe(0o700);
  });
});
