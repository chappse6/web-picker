# Web Picker

Pick a UI element on a **localhost** page in your browser, type a fix request, and
your MCP coding agent (Claude Code, Codex, ...) pulls it and edits the code.

Stop describing elements in words. Click the element. The capture carries the
minimum clues an agent needs to find that exact element in your codebase — while
never leaking sensitive values.

> v1 is **localhost-only** by design. No cloud, no accounts, no API keys.

## How it works

```
 Browser (localhost page)            Local machine                Coding agent
 ┌────────────────────────┐     ┌───────────────────────┐     ┌──────────────────┐
 │ content script         │     │ Daemon (127.0.0.1)    │     │ MCP adapter      │
 │  pick + mask + rank    │     │  durable queue        │     │  connect / list  │
 │          │ runtime msg │     │  extension HTTP       │     │  pull / resolve  │
 │ service worker ────────┼HTTP►│  token IPC /ipc      │◄────┤  (7 MCP tools)   │
 └────────────────────────┘     └───────────────────────┘ IPC └──────────────────┘
```

- **Daemon** binds `127.0.0.1` only. The extension worker accepts messages only
  from Chrome-verified localhost tabs, and daemon extension endpoints accept only
  the pinned `chrome-extension://mnglicpibnccgcifnndemfpidkcgboli` **Origin**.
  The MCP adapter's IPC is guarded by a per-run **token**.
- **Agent-neutral**: the daemon never knows whether the agent is Claude Code or
  Codex. Only the register step differs.
- **Masking preserves identity**: input values, emails, tokens are never exported;
  short visible labels, selector, ancestors, and landmark are kept so the agent can
  locate the target.

## Requirements

- Node.js >= 20.18.0 (tested with 20.20.2)
- Google Chrome (MV3, load unpacked)
- A coding agent that speaks MCP (Claude Code or Codex)

## Install

```bash
./bootstrap.sh          # macOS/Linux  (installs deps + builds)
# or
pwsh ./bootstrap.ps1    # Windows
```

Then:

1. **Load the Chrome extension**
   `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select the `extension/` folder.

2. **Register the MCP server** with your agent:
   ```bash
   ./scripts/register-claude-code.sh   # Claude Code
   ./scripts/register-codex.sh         # Codex
   ```
   Both point the agent at `scripts/run.cjs`, which lazily starts the daemon.

## Five-minute judge path (no keys, no accounts)

The whole round trip is reproducible from the demo page alone. Automated
verification normally finishes inside five minutes on a machine with installed
Chrome and a graphical desktop; no model API key or Playwright browser download
is needed.

1. **Setup**
   ```bash
   ./bootstrap.sh
   ```

2. **Serve the demo page on localhost**
   ```bash
   python3 -m http.server 3000 --directory test-page
   ```
   Open <http://localhost:3000>. It has three buttons all labelled **저장**
   (in the header, main, and footer) — a deliberate decoy set.

3. **Load the extension** (see Install step 1) and **register your agent**
   (Install step 2).

4. **Pick an element**
   - Click the **픽** button (bottom-right) → **요소 선택**.
   - Hover the **main area's 저장 button** (inside the profile card) and click it.
   - Type a request, e.g. `이 버튼을 파란색으로`, and click **보내기**.
   - You should see `요청을 큐에 보냈습니다`.

5. **Pull it from the agent**
   In a Claude Code / Codex session:
   - `connect_web_picker` → claims the picker, shows pending count.
   - `list_web_requests` → shows your request with its id and status.
   - `get_web_request` with that id → shows the target clues. Note that
     `landmark: section` (and the selector `#profile-save`) distinguish it from
     the header/footer **저장** decoys (`landmark: header` / `landmark: footer`),
     even though all three share the visible label **저장**.
   - `resolve_web_request` with the id → marks it resolved.

That decoy round trip is covered both by the browser-free integration suite and
by the real Chrome E2E below.

### Reproduce without a browser (fully automated)

```bash
npm test
```

`test/integration.test.ts` posts three decoy captures, then drives the real MCP
tools through `connect → list → get → resolve`, asserting the picked element is
uniquely identified. It also cold-spawns the built daemon from `dist/`.

### Reproduce with the real Chrome extension

`npm run test:e2e` opens an installed Google Chrome in a fresh headed profile,
loads `extension/` unpacked, performs the profile-button pick through the real
content UI, and verifies and resolves the queued request through the MCP client.
It requires a graphical desktop session and normally finishes in about 10 seconds.
It does not download a browser.

macOS or Linux:

```bash
npm run test:e2e

# For a non-standard Chrome install:
PLAYWRIGHT_CHROME_EXECUTABLE=/path/to/google-chrome npm run test:e2e
```

Windows PowerShell:

```powershell
npm run test:e2e

# For a non-standard Chrome install:
$env:PLAYWRIGHT_CHROME_EXECUTABLE = 'C:\Path\To\chrome.exe'
npm run test:e2e
```

If Chrome is absent or the override does not point to an installed executable,
the test fails with:

```text
Google Chrome is required for npm run test:e2e; install Chrome or set PLAYWRIGHT_CHROME_EXECUTABLE
```

## Security defaults

- Daemon bound to `127.0.0.1` only.
- Extension activates only on `localhost` / `127.0.0.1` / `*.localhost` pages.
- The extension worker accepts only Chrome-verified localhost-tab senders;
  extension HTTP endpoints require the exact pinned extension **Origin**. IPC
  requires a **token** (compared in constant time), stored `0600` in
  `~/.web-picker/token`.
- Input values and email-, long-digit-, or token-shaped strings are never
  exported. The same filter covers selector, `id`, `class`, `role`,
  `aria-label`, `name`, ancestor summaries, and masked HTML while retaining
  safe class tokens for target identity. `dataset` sends only non-sensitive key
  names after DOM normalization; values never leave the page.

## MCP tools

| Tool | Purpose |
|------|---------|
| `connect_web_picker` | Connect, register session, claim, report pending |
| `list_web_requests` | List queued requests (auto-claims on first use) |
| `watch_web_requests` | Long-poll for new requests |
| `get_web_request` | Full detail for one request (target clues) |
| `resolve_web_request` | Mark a request resolved |
| `release_web_picker` | Release the picker session |
| `take_over_web_picker` | Take over the session from another agent |

## Develop

```bash
npm test          # vitest (unit + jsdom + integration; excludes real Chrome)
npm run test:e2e  # headed installed-Chrome round trip
npm run build     # tsc -> dist/
npm run benchmark # deterministic target-disambiguation benchmark -> artifacts/
npm run sbom      # CycloneDX 1.5 inventory -> artifacts/sbom.cdx.json
```

`npm run sbom` rejects Node versions below the documented engine floor, restores
lockfile-derived integrity/development/optional metadata, validates the final
CycloneDX JSON, and writes canonical bytes independent of npm's hidden-lock cache.

`npm run benchmark` measures target disambiguation only on 30 static HTML
fixtures. It includes balanced ambiguous-label and unique-label controls,
along with both successful and unsuccessful locator resolutions. It is not a
measure of coding-agent productivity or source retrieval. Results record
text-only resolution, Web Picker locator resolution, global and category ×
confidence calibration, label strata, and serialized capture-payload byte sizes in
`artifacts/benchmark-results.json` and `artifacts/benchmark-results.md`.

Architecture: pure core (`src/daemon/state.ts`) + application handlers
(`extension-api`, `ipc-api`, `tools`) + thin adapters (`server.ts`, MCP adapter
source under `src/shim/`, `spawn.ts`). Ports are injected, so everything unit-tests
without sockets. See [`docs/architecture.md`](docs/architecture.md).

Submission evidence: [`docs/dependencies.md`](docs/dependencies.md),
[`docs/video-script.md`](docs/video-script.md), and
[`docs/submission-checklist.md`](docs/submission-checklist.md). Public repository
and YouTube URLs remain explicit checklist blockers until the owner publishes and
verifies them.

## License

[MIT](./LICENSE). Locked dependency licenses are recorded from installed package
metadata in [`docs/dependencies.md`](docs/dependencies.md). No GPL-family runtime
dependency is present.
