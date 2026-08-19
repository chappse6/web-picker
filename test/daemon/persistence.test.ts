import { describe, expect, it } from 'vitest';
import {
  QUEUE_SCHEMA_VERSION,
  persistedRequestSchema,
  queueSnapshotSchema,
  retainedRequests,
} from '../../src/daemon/persistence.js';
import type {
  CapturePayload,
  QueueSnapshot,
  Status,
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

function row(
  id: string,
  status: Status,
  createdAt: number,
  resolvedAt: number | null = status === 'resolved' ? createdAt : null,
): WebRequest {
  return {
    id,
    payload: payload(),
    status,
    createdAt,
    claimedAt: status === 'claimed' ? createdAt : null,
    resolvedAt,
  };
}

describe('queue persistence schema', () => {
  it('accepts a version 1 snapshot containing complete capture payloads', () => {
    const snapshot: QueueSnapshot = {
      schemaVersion: QUEUE_SCHEMA_VERSION,
      requests: [row('pending', 'pending', 1)],
    };

    expect(queueSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('rejects unknown schema versions', () => {
    const parsed = queueSnapshotSchema.safeParse({
      schemaVersion: 2,
      requests: [],
    });

    expect(parsed.success).toBe(false);
  });

  it.each([
    ['unknown status', { ...row('row', 'pending', 1), status: 'queued' }],
    ['non-numeric created timestamp', { ...row('row', 'pending', 1), createdAt: '1' }],
    ['claimed row without claimed timestamp', { ...row('row', 'claimed', 1), claimedAt: null }],
    ['resolved row without resolved timestamp', { ...row('row', 'resolved', 1), resolvedAt: null }],
  ])('rejects %s', (_name, candidate) => {
    expect(persistedRequestSchema.safeParse(candidate).success).toBe(false);
  });
});

describe('resolved request retention', () => {
  it('keeps every unresolved row and only the 50 latest resolved rows', () => {
    const rows = [
      row('pending', 'pending', 2),
      row('claimed', 'claimed', 1),
      ...Array.from({ length: 55 }, (_, index) =>
        row(`resolved-${index}`, 'resolved', 100 + index, 1_000 + index),
      ),
    ];

    const retained = retainedRequests(rows);

    expect(retained.filter((candidate) => candidate.status !== 'resolved').map((candidate) => candidate.id))
      .toEqual(['claimed', 'pending']);
    expect(retained.filter((candidate) => candidate.status === 'resolved').map((candidate) => candidate.id))
      .toEqual(Array.from({ length: 50 }, (_, index) => `resolved-${index + 5}`));
  });
});
