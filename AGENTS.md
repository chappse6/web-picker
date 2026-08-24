## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## Cursor Cloud specific instructions

Single Node.js/TypeScript product ("Web Picker"): a Chrome extension (`extension/`) +
a local daemon (`src/daemon`, `127.0.0.1:8787`) + an MCP stdio adapter (`src/shim`).
There is no cloud backend. Standard commands live in `package.json` scripts and
`README.md` (`npm run build`, `npm test`, `npm run test:e2e`, `npm run benchmark`,
`npm run sbom`); use those rather than duplicating them.

- No dedicated lint script. `npm run build` (`tsc` in `strict` mode) is the
  type-check / lint gate.
- `npm test` (vitest) excludes `test/e2e/**`; the real headed-Chrome round trip
  runs only via `npm run test:e2e`.
- The VM has a graphical desktop on `DISPLAY=:1` and Google Chrome at
  `/usr/local/bin/google-chrome`, so `npm run test:e2e` works. If a manual GUI
  session needs a specific browser, set `PLAYWRIGHT_CHROME_EXECUTABLE`.
- Non-obvious, for a MANUAL browser demo (not needed for `npm run test:e2e`,
  which Playwright handles): current Chrome ignores `--load-extension` unless you
  also pass `--disable-features=DisableDisableExtensionsExceptCommandLineSwitch`
  (see the feature list in `test/e2e/chrome-launch.ts`). Without it the content
  script never injects and no "요소 선택" floating button appears.
- Non-obvious: the browser extension POSTs picks to the daemon on
  `127.0.0.1:8787`, so the daemon must already be running before you pick. In
  normal use the MCP adapter (`scripts/run.cjs`) lazily starts it; for a manual
  browser-only demo start it yourself with `node dist/daemon/daemon.js` (run
  `npm run build` first). The MCP session is single-holder — reclaim it with the
  `take_over_web_picker` tool if a previous adapter process still holds it.
- `artifacts/` is committed and `npm run sbom` / `npm run benchmark` rewrite files
  there; revert incidental regenerated changes (e.g. `artifacts/sbom.cdx.json`)
  unless updating them is the point of your change.
