# Web Picker MVP — Design

## Purpose

Let a developer point at a UI element in the browser and hand a fix request to an
MCP coding agent, with a capture accurate enough that the agent finds the exact
element in the codebase — and safe enough that no sensitive value leaks.

v1 scope: localhost only. Out of scope: production sites, cloud sync, note-taking,
web clipping.

## Strategic direction

Decided in an office-hours session (see `~/.gstack/projects/pickPrompt/`):

- **All-in on target accuracy.** The moat is: given a capture, the agent locates
  the exact element. Budget goes to capture quality + identity-preserving masking.
- **Decoy test-page as proof.** The demo page has three same-label buttons under
  different landmarks; the integration test asserts the capture disambiguates.

## Architecture (hexagonal / ports & adapters)

Pure core at the center; IO in swappable adapters. Everything unit-tests without
sockets or a real browser.

```
shared/types, shared/schema        domain (pure)
        ▲
daemon/state.ts                     core state machine (pure): queue + session occupancy
        ▲
daemon/extension-api.ts             application handlers (pure): ApiRequest -> ApiResponse
daemon/ipc-api.ts
shim/tools.ts                       the 7 MCP tools over the client port
shim/client.ts                      IPC client over the transport/launcher ports
        ▲
daemon/server.ts                    driving adapter: Node http, binds 127.0.0.1
daemon/daemon.ts                    daemon entrypoint + runtime files (paths.ts)
shim/spawn.ts                       launcher adapter: probe -> spawn -> wait
shim/shim.ts                        driving adapter: MCP SDK over stdio
extension/capture.js, pick.js       pure DOM logic (jsdom-tested)
extension/content.js, background.js browser adapters
```

Design methodologies applied throughout: **hexagonal**, **SOLID + dependency
injection** (clock, logger, transport, launcher, spawn all injectable),
**testability-first** (every IO boundary has a port).

## Daemon contract

Extension HTTP (localhost Origin only; no token — a page can't hold a secret):
- `POST /requests` — enqueue a CapturePayload (zod-validated) → `{ id, status }`
- `GET /status` — `{ activeSessionId, queue: [{id,status,createdAt}] }`
- `POST /release` — clear the active session
- `GET /version.json` — `{ version }` (no Origin check; used by auto-reload)
- `OPTIONS *` — CORS preflight → 204

Shim IPC (`POST /ipc`, token header `x-web-picker-token`, constant-time compare):
- `register`, `heartbeat`, `claim`, `release`, `take_over`, `pull`, `resolve`,
  `list`, `get`, `watch` (long-poll)

## State machine

- `requestQueue` with per-request status `pending → claimed → resolved`.
  `resolve` only affects `pending`/`claimed`.
- Duplicate enqueue idempotency: same `selector + userQuestion` within a dedup
  window collapses to one request.
- `activeSessionId`: one at a time. `claim` succeeds only when empty; `take_over`
  transfers explicitly; `release` only for the owner; heartbeat timeout auto-releases.
- `subscribe` fires on genuine new enqueue (not dedup) to power `watch`.

## Capture payload & masking

Payload: `url, title, viewport, element, userQuestion, createdAt, source`.

Element carries: `selector, tagName, id, className, role, ariaLabel, dataset
(keys only), attributes (allowlist), ancestors, rect, maskedText, maskedOuterHTML,
landmark, visibleLabel`.

Masking rules (security ⟂ accuracy):
- Input/textarea/select values, emails, long digit runs, token-shaped strings:
  never exported.
- `maskedText` keeps only length/word shape; `visibleLabel` preserves a short
  non-sensitive label (button text, link text) for identification.
- `dataset`: keys only. `attributes`: allowlist `id/class/role/aria-label/name`,
  `name` dropped if it matches a sensitive keyword.
- `maskedOuterHTML`: open tag + allowlisted attributes + masked inner.
- When ambiguous, mask — but never so far that the element can't be identified.

## MCP tools (agent-neutral)

`connect_web_picker`, `list_web_requests` (auto-claim on first use),
`watch_web_requests` (long-poll), `get_web_request`, `resolve_web_request`,
`release_web_picker`, `take_over_web_picker`.

## Security model

- `127.0.0.1` bind + localhost Origin allowlist defends the daemon from public
  pages reaching the local port.
- Per-run token (0600) guards IPC; constant-time compare.
- Extension is localhost-only and never transmits sensitive values.

## Reproducibility

`scripts/run.cjs` lazily builds and execs the shim, which lazily spawns the
daemon — so a judge needs only `bootstrap.sh`, the unpacked extension, and the
demo page. `test/integration.test.ts` automates the full round trip including a
cold spawn from `dist/`.
