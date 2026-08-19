import { z } from 'zod';
import { capturePayloadSchema } from '../shared/schema.js';
import type {
  QueuePersistence,
  QueueSnapshot,
  WebRequest,
} from '../shared/types.js';

export type { QueuePersistence, QueueSnapshot } from '../shared/types.js';

export const QUEUE_SCHEMA_VERSION = 1 as const;

const timestampSchema = z.number().finite().nonnegative();

const persistedRequestBaseSchema = z.object({
  id: z.string().min(1),
  payload: capturePayloadSchema,
  createdAt: timestampSchema,
});

export const persistedRequestSchema = z.discriminatedUnion('status', [
  persistedRequestBaseSchema.extend({
    status: z.literal('pending'),
    claimedAt: z.null(),
    resolvedAt: z.null(),
  }),
  persistedRequestBaseSchema.extend({
    status: z.literal('claimed'),
    claimedAt: timestampSchema,
    resolvedAt: z.null(),
  }),
  persistedRequestBaseSchema.extend({
    status: z.literal('resolved'),
    claimedAt: timestampSchema.nullable(),
    resolvedAt: timestampSchema,
  }),
]);

export const queueSnapshotSchema = z.object({
  schemaVersion: z.literal(QUEUE_SCHEMA_VERSION),
  requests: z.array(persistedRequestSchema),
});

export const noOpQueuePersistence: QueuePersistence = {
  save(_snapshot: QueueSnapshot) {},
};

/** Keep all active work plus the 50 most recently resolved requests. */
export function retainedRequests(rows: WebRequest[]): WebRequest[] {
  const unresolved = rows.filter((row) => row.status !== 'resolved');
  const resolved = rows
    .filter((row) => row.status === 'resolved')
    .sort((a, b) => b.resolvedAt! - a.resolvedAt!)
    .slice(0, 50);

  return [...unresolved, ...resolved].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}
