# Web Picker architecture and trust boundaries

Web Picker is a local-first intake path from one rendered localhost element to an MCP coding-agent session. It captures browser evidence; it does not call a model, inspect source maps, or edit code itself.

## Data flow

```text
localhost page DOM
  -> content script: select, mask, rank locator candidates
  -> chrome.runtime message
  -> MV3 service worker: validate message and sender tab
  -> HTTP with pinned chrome-extension Origin
  -> daemon on 127.0.0.1: validate, persist, coordinate
  -> token-authenticated local IPC
  -> MCP stdio adapter
  -> MCP-compatible coding agent
```

The extension and coding agent have different lifetimes. A singleton daemon owns the durable queue and session occupancy; each agent launches a short-lived MCP stdio adapter through `scripts/run.cjs`. The adapter starts or reuses the daemon, keeping MCP stdout protocol-clean and requiring no model key in Web Picker.

## Component responsibilities

| Component | Owns | Does not own |
| --- | --- | --- |
| Capture core | DOM masking, safe attributes, ancestor/landmark context, locator candidates | Chrome APIs, network, source-file claims |
| Content script | Picker UI and sanitized runtime message | Direct daemon access |
| Service worker | Sender-tab validation and browser HTTP | Queue state or model credentials |
| Daemon | Boundary validation, durable queue, claim/release coordination | Public network binding or model calls |
| MCP adapter | Standard MCP tools and authenticated local IPC | Queue persistence or browser access |

## Security boundaries

- Browser activation is limited to `localhost`, `127.0.0.1`, and `*.localhost` pages.
- The service worker accepts messages only from Chrome-verified allowed tabs. Daemon browser endpoints require the manifest-pinned `chrome-extension://mnglicpibnccgcifnndemfpidkcgboli` origin; the value is public identity, not a secret.
- The daemon binds only to `127.0.0.1`. MCP-side IPC requires a per-run token stored with mode `0600` and compared in constant time.
- Request bodies are capped at 64 KiB. Shared Zod schemas cap the user question at 2,000 characters and locator candidates at eight.
- Input values, email-like text, long digit runs, token-shaped strings, sensitive `name` attributes, and non-allowlisted dataset values are excluded or masked before relay.
- Logs contain request method/path, safe error code, IDs, and statuses; they exclude questions, DOM content, captured HTML, and tokens.

Processes running as the same OS user, compromised Chrome/Node/OS installations, and user-approved harmful source edits are outside this boundary.

## Locator evidence

The capture core ranks safe ID (stability 100), `data-testid`/`data-cy` (95), ARIA role plus label (85), landmark plus tag (65), and structural CSS path (45). Each candidate includes browser-observed match count. A unique candidate scoring at least 85 yields `high` confidence, any other unique candidate yields `medium`, and no unique candidate yields `low`. The server validates and stores this evidence; it does not recompute browser facts or claim a source-file location.

The deterministic 30-fixture target-disambiguation benchmark reports 50% text-only resolution and 80% Web Picker locator resolution. On 15 ambiguous-label fixtures, text-only resolved 0% and locator evidence resolved 86.67%. Scope is static target identification, not coding-agent productivity or source retrieval.

## Durable queue and recovery

Queue schema version 1 is stored at `~/.web-picker/queue.json`. Save is copy-save-commit: write an exclusive mode-`0600` temporary file, flush, then atomically rename. State mutations roll back in memory if persistence fails. Startup reloads unresolved and the 50 newest resolved requests, converts stale claimed work to pending, and never restores ephemeral session occupancy. Invalid JSON or schema is renamed to `.corrupt-<timestamp>`; the daemon starts empty and exposes only a `queue-corrupt` status warning.

## Reproduction path

Prerequisites: Node.js 20.18.0+ (tested with 20.20.2), npm 9+, installed Google Chrome, and a graphical desktop for the E2E command. Node 20.18.0 is required by the locked CycloneDX generator used in the judge flow.

```bash
./bootstrap.sh
npm test
npm run build
npm run test:e2e
npm run benchmark
```

`npm run sbom` regenerates the CycloneDX 1.5 inventory. No model API key, cloud account, or downloaded Playwright browser is required.

## Known limitations

- Localhost development pages only; no production-site or cloud sync support.
- Rendered DOM locator evidence, not React Fiber or framework source mapping.
- Chrome E2E is headed and needs an installed Chrome executable.
- Same-user malicious processes are outside the token boundary.
- Benchmark measures deterministic locator resolution on static fixtures only.
