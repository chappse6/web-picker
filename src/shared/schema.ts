/**
 * zod schemas mirroring the shared types. Used to validate untrusted input at
 * the daemon boundary (the extension POST /requests body). Validation lives at
 * the edge; the core state machine trusts its inputs.
 */
import { z } from 'zod';

export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const ancestorSummarySchema = z.object({
  tagName: z.string(),
  id: z.string().nullable(),
  className: z.string().nullable(),
  role: z.string().nullable(),
});

export const locatorKindSchema = z.enum(['id', 'test-id', 'aria', 'landmark', 'css-path']);
export const locatorReasonSchema = z.enum(['unique-candidate', 'no-unique-candidate']);

export const locatorCandidateSchema = z.object({
  kind: locatorKindSchema,
  value: z.string(),
  matchCount: z.number().int().min(0),
  stability: z.number().int().min(0).max(100),
});

export const locatorEvidenceSchema = z.object({
  candidates: z.array(locatorCandidateSchema).max(8),
  confidence: z.enum(['high', 'medium', 'low']),
  reasons: z.array(locatorReasonSchema),
});

export const capturedElementSchema = z.object({
  selector: z.string().min(1),
  tagName: z.string(),
  id: z.string().nullable(),
  className: z.string().nullable(),
  role: z.string().nullable(),
  ariaLabel: z.string().nullable(),
  dataset: z.array(z.string()),
  attributes: z.record(z.string()),
  ancestors: z.array(ancestorSummarySchema),
  rect: rectSchema,
  maskedText: z.string(),
  maskedOuterHTML: z.string(),
  landmark: z.string().nullable(),
  visibleLabel: z.string().nullable(),
  locatorEvidence: locatorEvidenceSchema,
});

export const capturePayloadSchema = z.object({
  url: z.string(),
  title: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  element: capturedElementSchema,
  userQuestion: z.string().max(2_000),
  createdAt: z.string(),
  source: z.literal('chrome-extension'),
});
