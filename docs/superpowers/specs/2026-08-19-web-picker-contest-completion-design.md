# Web Picker Contest Completion Design

Date: 2026-08-19
Status: Approved in chat, pending written-spec review
Owner: 박세은 (픽앤코드)

## 1. Goal

Complete Web Picker as a contest-ready, open-source developer tool before the
2026 Open Source Developer Contest submission deadline on 2026-08-27 18:00 KST.

Web Picker lets a developer select a UI element on a localhost page, describe a
change, and hand a privacy-minimized target description to an MCP-compatible
coding agent. The project does not call a model API. Codex or Claude Code owns
model authentication and usage, so users can keep using their existing product
subscription when their client supports subscription authentication.

Success means more than passing unit tests. A judge must be able to reproduce a
real Chrome-extension-to-MCP round trip, understand why the target is the exact
element, verify security defaults, and inspect complete submission artifacts.

## 2. Product Position

### Primary claim

Framework-neutral, local-first UI change intake for MCP coding agents.

### Differentiators

- Works from rendered DOM rather than requiring React-specific instrumentation.
- Keeps the extension, queue, and MCP bridge on the local machine.
- Masks sensitive values before a request leaves the page context.
- Coordinates multiple agent sessions through an explicit claim/release model.
- Produces reproducible target-identification evidence instead of relying only
  on a natural-language description.

### Explicit non-goals

- Browser automation, console/network inspection, or performance profiling.
- Automatic model calls or bundled model credentials.
- Automatic source-code edits inside Web Picker itself.
- Production-site support, cloud synchronization, or account management.
- Framework-specific React Fiber source mapping in this release.

## 3. Architecture

Keep the existing ports-and-adapters structure. Rename the user-facing concept
"shim" to "MCP adapter" or "MCP server process" in documentation.

```text
Localhost page DOM
  -> sanitized chrome.runtime message
Chrome extension service worker
  -> extension-origin-gated localhost HTTP
Local broker daemon
  -> token-authenticated local IPC
MCP stdio adapter
  -> Codex / Claude Code subscription-authenticated session
```

### Why both daemon and MCP adapter exist

The Chrome extension and coding-agent process have different lifetimes. The
daemon owns a shared durable queue and session occupancy. Each coding-agent
session launches a standard MCP stdio adapter. The adapter lazily starts or
reuses the singleton daemon. This preserves zero-manual-start installation and
allows multiple MCP clients to coordinate without placing model credentials in
Web Picker.

Replacing this with Streamable HTTP MCP would remove one adapter but require a
prestarted daemon and a larger authentication surface. Chrome Native Messaging
would remove the localhost port but add OS-specific host registration and a
fixed extension-ID installation flow. Both remain possible future transports.

## 4. Component Responsibilities

### Extension capture core

- Capture masked element context.
- Generate ordered locator candidates from stable evidence: safe ID,
  sensitivity-checked `data-testid`/`data-cy`, ARIA role/name, landmark, and a
  structural CSS path.
- Record each candidate's match count and stability score.
- Derive an overall `high`, `medium`, or `low` confidence without claiming a
  source-file location.
- Keep capture and scoring logic pure and DOM-testable.

### Extension content script

- Render selection UI and collect the user's change request.
- Reject non-localhost pages.
- Send sanitized payloads through `chrome.runtime.sendMessage` only.
- Never call the daemon directly.

### Extension service worker

- Revalidate sender tab URL and message shape.
- Use a manifest-pinned extension ID so daemon origin checks remain deterministic
  for unpacked development and judge installation. The manifest key is public
  identity material, not a credential.
- Make daemon requests from the privileged extension context.
- Return typed success and error results to the content script.
- Keep model, subscription, and API credentials out of the extension.

### Local broker daemon

- Validate origin, schema, and payload size at the boundary.
- Own request state, durable queue persistence, deduplication, and session
  occupancy.
- Bind only to `127.0.0.1`.
- Expose extension endpoints separately from token-authenticated adapter IPC.

### MCP adapter

- Speak standard MCP over stdio and keep stdout protocol-clean.
- Lazily start or reuse the daemon.
- Register, claim, heartbeat, release, list, watch, get, and resolve requests.
- Present locator candidates, match counts, confidence, and masking facts to the
  coding agent.

### Benchmark and submission tooling

- Run a deterministic target-disambiguation benchmark over at least 30 fixtures.
- Generate a machine-readable CycloneDX SBOM and a report-ready dependency table.
- Keep evidence scripts deterministic and runnable without model API keys.

## 5. Data Contract

Extend captured-element data with:

```ts
type LocatorKind = 'id' | 'test-id' | 'aria' | 'landmark' | 'css-path';

interface LocatorCandidate {
  kind: LocatorKind;
  value: string;
  matchCount: number;
  stability: number; // integer, 0..100
}

interface LocatorEvidence {
  candidates: LocatorCandidate[];
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}
```

The server recomputes no browser facts. It validates bounds and stores capture
evidence. Candidate values pass the same sensitive-value filter as other
attributes. Only `data-testid` and `data-cy` values are eligible among dataset
attributes; all other dataset values remain excluded.

Request limits:

- User question: at most 2,000 characters.
- Serialized request: at most 64 KiB.
- Locator candidates: at most 8.
- Locator reason strings: fixed enum-derived messages, not arbitrary page text.

## 6. Durable Queue

Persist queue data at `~/.web-picker/queue.json` with schema version 1.

- Create runtime directory and files with user-only permissions.
- Write a temporary file, flush it, then atomically rename it.
- Persist pending, claimed, and resolved request records.
- Do not persist active session occupancy or heartbeat state.
- Convert claimed requests back to pending during daemon startup.
- Retain all unresolved requests and the 50 most recent resolved requests.
- Apply persistence and in-memory state as one operation. If persistence fails,
  do not report the mutation as successful and restore the previous state.
- On invalid JSON or invalid persisted schema, rename the file with a
  `.corrupt-<timestamp>` suffix, start with an empty queue, and expose a warning
  through status without logging captured content.

The pure state machine remains independent of filesystem APIs. A persistence
port and filesystem adapter handle load/save behavior.

## 7. Security Model

### In scope

- Malicious or compromised web pages, including localhost pages.
- Cross-origin browser requests to the local daemon.
- Malformed or oversized capture payloads.
- Accidental leakage through captured values or logs.
- Unauthorized MCP IPC calls without the daemon token.

### Out of scope

- Malicious processes already running as the same OS user.
- Compromise of Codex, Claude Code, Chrome, Node.js, or the operating system.
- A malicious user intentionally approving harmful source changes.

### Controls

- The content script sends only sanitized runtime messages.
- The service worker verifies the sender is an allowed localhost tab.
- Browser-facing daemon endpoints require the expected extension origin and
  reject missing or invalid browser origins.
- Expected extension origin derives from the manifest-pinned ID, not from the
  first caller or an arbitrary configuration value.
- Adapter IPC requires a per-run token compared in constant time.
- Daemon binds to `127.0.0.1` only.
- Untrusted payloads are schema-validated and size-limited.
- Logs contain IDs, statuses, and error codes only. They exclude DOM text,
  questions, tokens, and captured HTML.
- Sensitive inputs, emails, long digit runs, token-shaped strings, and sensitive
  attribute names remain masked or removed.

## 8. State and Error Behavior

- Daemon unavailable: adapter starts it once and waits on a readiness probe.
- Port occupied by Web Picker: reuse it after version and token validation.
- Port occupied by another process: fail with a clear actionable error.
- Invalid extension payload: HTTP 400.
- Invalid browser origin: HTTP 403.
- Missing or incorrect IPC token: HTTP 401.
- Oversized request: HTTP 413.
- Queue persistence failure: fail mutation and restore previous memory state.
- MCP disconnect: retain requests and eventually release session occupancy.
- Heartbeat expiry: release occupancy and return claimed requests to pending.
- Duplicate resolve: idempotent success for an already-resolved request.
- UI distinguishes daemon unavailable, forbidden, oversized, and persistence
  failures instead of showing one generic message.

## 9. Verification Strategy

### Test layers

1. Pure unit tests
   - Masking and sensitive-value classification.
   - Locator generation, match counts, scoring, and confidence.
   - Queue state transitions and retention.
   - Persistence serialization and recovery decisions.
2. Adapter tests
   - Runtime-message sender validation.
   - Extension origin enforcement.
   - File permissions, atomic replacement, rollback, and corrupt-file recovery.
3. Socket integration tests
   - Extension HTTP and authenticated IPC over `127.0.0.1`.
   - Restart recovery and heartbeat release.
4. MCP protocol integration
   - Start `scripts/run.cjs` through an MCP stdio client.
   - List tools and complete connect/list/get/resolve.
5. Real Chrome E2E
   - Load the unpacked extension into a clean Chrome profile.
   - Serve the decoy page, select the intended element, submit, retrieve through
     MCP, and resolve.

### Benchmark

Use at least 30 fixtures across repeated labels, repeated classes, nested
landmarks, generated class names, ARIA-only labels, and safe test IDs.

Report:

- Text-only target-identification rate.
- Web Picker locator target-identification rate.
- Confidence calibration by fixture category.
- Mean and p95 serialized payload size.

Call this a target-disambiguation benchmark, not an agent productivity or
source-retrieval benchmark.

### Required commands

```bash
npm test
npm run build
npm run test:e2e
npm run benchmark
```

All commands must pass from a clean checkout using documented prerequisites.

## 10. Open-Source Quality Rules

- Keep pure domain logic free of Node and Chrome APIs.
- Use one shared TypeScript contract and matching boundary schemas.
- Prefer small focused modules and explicit dependency injection.
- Add a failing test before each behavior change.
- Comments explain constraints and reasons, not syntax.
- Avoid speculative abstractions and unrelated refactors.
- Preserve deterministic builds and keyless judge reproduction.
- Verify every dependency license and list it in the SBOM.

## 11. Submission Deliverables

Repository:

- Public GitHub repository with MIT license.
- Judge-focused README and five-minute setup path.
- Reproducible tests, benchmark, demo page, and architecture documentation.
- CycloneDX SBOM plus human-readable dependency/license table.
- Screenshots and diagrams referenced from the report.

Contest upload:

- Official result-report DOCX, with report body limited to five pages.
- PDF converted from the same report.
- Mandatory SBOM attachment inside the report file.
- AI-model attachment removed because Web Picker does not embed or apply an AI
  model. Coding-assistant use during development is disclosed transparently in
  project documentation, not represented as model integration.
- Public repository URL and YouTube demonstration URL.
- Duplicate-benefit confirmation only if applicable.

Video, at most three minutes:

1. Problem and value proposition.
2. Select one of several identical-looking decoy elements.
3. Show masking and locator confidence.
4. Pull the request through Codex or Claude Code using existing subscription
   authentication, change source, refresh, and show the result.
5. Restart the daemon and show pending-request recovery.
6. Close with benchmark, security defaults, license, and repository URL.

## 12. Acceptance Criteria

- Existing behavior remains covered and all old tests pass.
- New unit, integration, stdio protocol, persistence, and real-Chrome E2E tests
  pass.
- A daemon restart preserves unresolved work and clears stale session ownership.
- A normal localhost page cannot directly enqueue a request through browser
  fetch.
- Captures expose ranked locator evidence without leaking test-sensitive values.
- Benchmark is deterministic and its claims match measured scope.
- No model or subscription credentials enter Web Picker.
- Fresh judge setup completes in five minutes or less on documented macOS,
  Linux, or Windows prerequisites.
- Repository, SBOM, result report, PDF, and three-minute video plan are complete
  before submission.

## 13. Contest Fit and Risk

The 2026 contest rules explicitly permit and encourage MCP connectors, plugins,
and AI-agent development-support ecosystems. Web Picker therefore fits the open
task without embedding an open-weight model. Its strongest judging story is
local-first, framework-neutral, reproducible handoff rather than generic browser
automation.

Main risks:

- Similar element-to-agent tools already exist.
- Current evidence identifies rendered targets, not framework source files.
- Native browser E2E and cross-platform install paths may expose late defects.
- Submission quality can fail despite working code if SBOM, report, repository,
  or video is incomplete.

Mitigation: keep scope fixed, prove exact claims with benchmark and real Chrome
evidence, document limitations, and prioritize submission artifacts alongside
implementation.

## 14. References

- Contest submission guide: https://osscontest.kr/notice/39
- Contest overview and official files: https://osscontest.kr/overview
- MCP transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Codex MCP configuration: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- Codex authentication: https://learn.chatgpt.com/docs/auth
- Chrome extension messaging: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Chrome Native Messaging: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
