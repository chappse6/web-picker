/**
 * Shared type definitions for Web Picker.
 *
 * These types are agent-neutral: the daemon and shared layer must not know
 * whether the connected MCP client is Claude Code, Codex, or anything else.
 */

/** Lifecycle status of a captured web request. */
export type Status = 'pending' | 'claimed' | 'resolved';

/** Where a request originated. v1 only supports the Chrome extension. */
export type RequestSource = 'chrome-extension';

export interface Viewport {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A minimal, masked summary of an ancestor element (for target identification). */
export interface AncestorSummary {
  tagName: string;
  id: string | null;
  className: string | null;
  role: string | null;
}

export type LocatorKind = 'id' | 'test-id' | 'aria' | 'landmark' | 'css-path';

export type LocatorReason = 'unique-candidate' | 'no-unique-candidate';

export interface LocatorCandidate {
  kind: LocatorKind;
  value: string;
  matchCount: number;
  stability: number;
}

export interface LocatorEvidence {
  candidates: LocatorCandidate[];
  confidence: 'high' | 'medium' | 'low';
  reasons: LocatorReason[];
}

/**
 * The captured element. Carries the *minimum identifying clues* an agent needs
 * to locate the element in a codebase, while never leaking sensitive values.
 */
export interface CapturedElement {
  selector: string;
  tagName: string;
  id: string | null;
  className: string | null;
  role: string | null;
  ariaLabel: string | null;
  /** dataset keys only — values are never exported. */
  dataset: string[];
  /** allowlisted attributes only (id, class, role, aria-label, name). */
  attributes: Record<string, string>;
  ancestors: AncestorSummary[];
  rect: Rect;
  /** textContent reduced to shape/length, sensitive values masked. */
  maskedText: string;
  /** outerHTML reduced to structure, text values masked. */
  maskedOuterHTML: string;
  /** nearest landmark region, if any (e.g. "nav", "main"). */
  landmark: string | null;
  /** short visible label preserved for target identification (non-sensitive only). */
  visibleLabel: string | null;
  /** ranked, privacy-checked selectors that can help locate this element. */
  locatorEvidence: LocatorEvidence;
}

/** Payload sent by the extension to the daemon when the user submits a pick. */
export interface CapturePayload {
  url: string;
  title: string;
  viewport: Viewport;
  element: CapturedElement;
  userQuestion: string;
  createdAt: string;
  source: RequestSource;
}

/** A request as tracked by the daemon queue. */
export interface WebRequest {
  id: string;
  payload: CapturePayload;
  status: Status;
  /** server-side receipt time (epoch ms). */
  createdAt: number;
  claimedAt: number | null;
  resolvedAt: number | null;
}

/** A registered MCP session (agent-neutral). */
export interface SessionInfo {
  id: string;
  label: string;
  lastHeartbeat: number;
}

/** Result shape returned by MCP tools. */
export interface McpToolResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}
