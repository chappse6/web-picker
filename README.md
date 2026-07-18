# Web Picker

Pick a UI element on a **localhost** page in your browser, type a fix request, and
your MCP coding agent (Claude Code, Codex, ...) pulls it and edits the code.

Stop describing elements in words. Click the element. The capture carries the
minimum clues an agent needs to find that exact element in your codebase — while
never leaking sensitive values.

> v1 is **localhost-only** by design. No cloud, no accounts, no API keys.

## How it works

```
 Browser (localhost page)          Local machine                 Coding agent
 ┌─────────────────────┐     ┌───────────────────────┐     ┌──────────────────┐
 │ Chrome extension    │     │ Daemon (127.0.0.1)     │     │ MCP shim         │
 │  pick element ──────┼──►  │  POST /requests        │     │  connect / list  │
 │  mask + capture     │HTTP │  queue (pending)       │◄────┤  pull / resolve  │
 │  send fix request   │     │  IPC /ipc (token)      │ IPC │  (7 MCP tools)   │
 └─────────────────────┘     └───────────────────────┘     └──────────────────┘
```

- **Daemon** binds `127.0.0.1` only. Extension requests are accepted only from a
  localhost page **Origin**; the shim's IPC is guarded by a per-run **token**.
- **Agent-neutral**: the daemon never knows whether the agent is Claude Code or
  Codex. Only the register step differs.
- **Masking preserves identity**: input values, emails, tokens are never exported;
  short visible labels, selector, ancestors, and landmark are kept so the agent can
  locate the target.

## Requirements

- Node.js >= 18
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

## Judge reproduction guide (no keys, no accounts)

The whole round trip is reproducible from the demo page alone.

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
   - You should see `전송됨 (id: ...)`.

5. **Pull it from the agent**
   In a Claude Code / Codex session:
   - `connect_web_picker` → claims the picker, shows pending count.
   - `list_web_requests` → shows your request with its id and status.
   - `get_web_request` with that id → shows the target clues. Note that
     `landmark: main` (and the selector) distinguish it from the header/footer
     **저장** decoys, even though all three share the visible label **저장**.
   - `resolve_web_request` with the id → marks it resolved.

That decoy round trip is exactly what `test/integration.test.ts` automates.

### Reproduce without a browser (fully automated)

```bash
npm test
```

`test/integration.test.ts` posts three decoy captures, then drives the real MCP
tools through `connect → list → get → resolve`, asserting the picked element is
uniquely identified. It also cold-spawns the built daemon from `dist/`.

## Security defaults

- Daemon bound to `127.0.0.1` only.
- Extension activates only on `localhost` / `127.0.0.1` / `*.localhost` pages.
- Extension endpoints require a localhost **Origin**; IPC requires a **token**
  (compared in constant time), stored `0600` in `~/.web-picker/token`.
- Input values, emails, tokens, and sensitive `name` attributes are never
  exported. `dataset` sends keys only.

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
npm test          # vitest (unit + jsdom + integration)
npm run build     # tsc -> dist/
```

Architecture: pure core (`src/daemon/state.ts`) + application handlers
(`extension-api`, `ipc-api`, `tools`) + thin adapters (`server.ts`, `shim.ts`,
`spawn.ts`). Ports are injected, so everything unit-tests without sockets. See
`docs/specs/web-picker-mvp-design.md`.

## License

[MIT](./LICENSE). All dependencies are permissive (MIT / Apache-2.0 / BSD / ISC);
no GPL-family dependencies.
