# Web Picker MVP — Build Plan (TDD)

Built test-first, one stage per commit. Each stage: confirm a failing test, make
it pass, record `npm test`, commit.

| Stage | Scope | Tests | Status |
|-------|-------|-------|--------|
| 1 | Scaffolding + daemon state machine | `state.test.ts` (22) | ✅ committed |
| 2 | Daemon HTTP/IPC server (hexagonal) | `server.test.ts` (19) | ✅ committed |
| 3 | Shim IPC client (ports/adapters) | `client.test.ts` (8) | ✅ committed |
| 4 | MCP tools 7 + watch long-poll | `tools.test.ts` (11) | ✅ committed |
| 5 | daemon/shim entrypoints, lazy spawn, integration | `paths` (7), `spawn` (3), `integration` (2) | ✅ committed |
| 6 | Element capture/masking + pick mode | `capture.test.ts` (13), `pick.test.ts` (4) | ✅ committed |
| 7 | Extension runtime + decoy test-page | `config.test.ts` (4) + CORS | ✅ committed |
| 8 | Scripts, README, docs | (manual smoke) | ✅ committed |

## Principles held

- MVP scope only. No production sites, no cloud, no persistence beyond runtime files.
- Daemon is agent-neutral; Claude Code vs Codex differ only in register scripts + docs.
- Security (no sensitive value leaves) and target accuracy (element identifiable)
  satisfied together — proven in the same masking tests.
- Design methodologies: hexagonal, SOLID + DI, testability-first.

## Key decisions

- **IPC over the same http server** (`/ipc`, token header) instead of a unix
  socket — fewer moving parts, better reproducibility.
- **Ephemeral port support** (`WEB_PICKER_PORT=0`) so tests never collide with a
  real daemon on 8787; the actual port is written to the runtime file.
- **run.cjs self-heals** (builds if needed) and keeps stdout clean for MCP.
- **Decoy test-page** makes target accuracy demonstrable, not just claimed.

## Verification

- `npm test`: full unit + jsdom + integration suite (incl. cold spawn from dist).
- `npm run build`: `tsc` → `dist/` clean.
- Manual: MCP stdio handshake lists 7 tools via `scripts/run.cjs`.

## Out of scope (future)

- Production-site support, cloud sync, request persistence/history.
- Richer selectors / DOM-path scoring, confidence hints.
- Firefox / other browsers.
