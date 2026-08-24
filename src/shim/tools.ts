/**
 * The 7 MCP tools' behavior (application layer), defined over the WebPickerClient
 * port so they unit-test with a fake client — no MCP server, no sockets.
 *
 * shim.ts is the thin adapter that registers these with the MCP SDK.
 *
 * Agent-neutral: tool names and text never mention a specific agent.
 */
import type { WebPickerClient } from './client.js';
import type { WebRequest } from '../shared/types.js';

export interface McpResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function text(s: string, isError = false): McpResult {
  return { content: [{ type: 'text', text: s }], isError };
}

function summarizeRow(r: WebRequest): string {
  const el = r.payload.element;
  const label = el.visibleLabel ? ` "${el.visibleLabel}"` : '';
  return `- ${r.id} [${r.status}] ${el.tagName}${label} — ${r.payload.userQuestion}`;
}

function detail(r: WebRequest): string {
  const el = r.payload.element;
  const evidence = el.locatorEvidence;
  const lines = [
    `id: ${r.id}`,
    `status: ${r.status}`,
    `url: ${r.payload.url}`,
    `userQuestion: ${r.payload.userQuestion}`,
    '',
    'target element:',
    `  selector: ${el.selector}`,
    `  tag: ${el.tagName}`,
    `  id: ${el.id ?? '(none)'}`,
    `  class: ${el.className ?? '(none)'}`,
    `  role: ${el.role ?? '(none)'}`,
    `  ariaLabel: ${el.ariaLabel ?? '(none)'}`,
    `  visibleLabel: ${el.visibleLabel ?? '(none)'}`,
    `  landmark: ${el.landmark ?? '(none)'}`,
    `  ancestors: ${el.ancestors.map((a) => a.tagName + (a.id ? '#' + a.id : '')).join(' > ') || '(none)'}`,
    `  rect: ${el.rect.width}x${el.rect.height} @ (${el.rect.x},${el.rect.y})`,
    `  maskedText: ${el.maskedText}`,
    `  maskedOuterHTML: ${el.maskedOuterHTML}`,
    '',
    'locator evidence:',
    `  locator confidence: ${evidence.confidence}`,
    `  reason codes: ${evidence.reasons.join(', ') || '(none)'}`,
    `  dataset keys: ${el.dataset.join(', ') || '(none)'}`,
    '  masking: text-shaped, values-removed',
    ...evidence.candidates.map((candidate, index) =>
      `  ${index + 1}. ${candidate.kind} ${candidate.value} — ${candidate.matchCount} ${candidate.matchCount === 1 ? 'match' : 'matches'} — stability ${candidate.stability}`,
    ),
  ];
  return lines.join('\n');
}

const OCCUPIED_HINT = 'Another agent holds the web picker session. Use take_over_web_picker to claim it.';

export interface WebPickerTools {
  connect_web_picker(): Promise<McpResult>;
  list_web_requests(): Promise<McpResult>;
  watch_web_requests(args?: { timeoutMs?: number }): Promise<McpResult>;
  get_web_request(args: { id: string }): Promise<McpResult>;
  resolve_web_request(args: { id: string }): Promise<McpResult>;
  release_web_picker(): Promise<McpResult>;
  take_over_web_picker(): Promise<McpResult>;
}

export function createTools(client: WebPickerClient): WebPickerTools {
  // Revalidate ownership before every queue operation. A different adapter may
  // have taken over since this short-lived MCP process last touched the daemon.
  async function ensureClaimed(): Promise<boolean> {
    const r = await client.connect();
    return r.claimed;
  }

  function listText(rows: WebRequest[], header: string): McpResult {
    if (rows.length === 0) return text(`${header}\n(no requests)`);
    return text([header, ...rows.map(summarizeRow)].join('\n'));
  }

  return {
    async connect_web_picker() {
      const r = await client.connect();
      if (!r.claimed) {
        return text(`Could not claim the picker (held by session ${r.activeSessionId}). ${OCCUPIED_HINT}`);
      }
      return text(`Connected. You hold the web picker session. ${r.pending} pending request(s). Call list_web_requests to read the queue, or watch_web_requests to wait for the next pick from the extension.`);
    },

    async list_web_requests() {
      if (!(await ensureClaimed())) return text(OCCUPIED_HINT, true);
      const rows = await client.list();
      return listText(rows, 'Web picker requests:');
    },

    async watch_web_requests(args = {}) {
      if (!(await ensureClaimed())) return text(OCCUPIED_HINT, true);
      const rows = await client.watch(args.timeoutMs);
      return listText(rows, 'New web picker requests:');
    },

    async get_web_request(args) {
      if (!(await ensureClaimed())) return text(OCCUPIED_HINT, true);
      const r = await client.get(args.id);
      if (!r) return text(`No request found with id ${args.id}`, true);
      return text(detail(r));
    },

    async resolve_web_request(args) {
      if (!(await ensureClaimed())) return text(OCCUPIED_HINT, true);
      const r = await client.resolve(args.id);
      if (!r.ok) return text(`Could not resolve ${args.id} (already resolved or unknown).`, true);
      return text(`Resolved ${args.id}.`);
    },

    async release_web_picker() {
      const r = await client.release();
      if (!r.ok) return text('Could not release the web picker session because this client no longer owns it.', true);
      return text('Released the web picker session.');
    },

    async take_over_web_picker() {
      const r = await client.takeOver();
      return r.ok ? text('Took over the web picker session.') : text('Take over failed.', true);
    },
  };
}
