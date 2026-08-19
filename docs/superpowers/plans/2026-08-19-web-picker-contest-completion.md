# Web Picker Contest Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Web Picker as contest-ready software with ranked locator evidence, extension-origin isolation, durable queue recovery, reproducible browser/MCP verification, benchmark evidence, and submission artifacts.

**Architecture:** Preserve existing ports-and-adapters layout. Browser capture remains pure, content script sends only sanitized runtime messages, service worker owns daemon HTTP, daemon state commits queue mutations through a persistence port, and MCP stdio adapter exposes stored evidence. Verification climbs from pure unit tests through sockets, stdio MCP, and real Chrome.

**Tech Stack:** TypeScript 5.5, Node.js 18+, Chrome MV3, Vitest/jsdom, Model Context Protocol SDK, Zod, Playwright Core, CycloneDX npm tooling.

**Spec:** `docs/superpowers/specs/2026-08-19-web-picker-contest-completion-design.md`

## Global Constraints

- Bind daemon only to `127.0.0.1`.
- User question maximum: 2,000 characters.
- Serialized request maximum: 64 KiB.
- Locator candidates maximum: 8.
- Locator stability: integer from 0 through 100.
- Persist queue schema version 1 at `~/.web-picker/queue.json`.
- Retain every unresolved request and 50 most recent resolved requests.
- Never persist session occupancy or heartbeat state.
- Keep DOM text, questions, captured HTML, and tokens out of logs.
- Keep model, subscription, and API credentials out of Web Picker.
- Run each behavior change test-first and preserve all existing tests.
- Do not add React-specific source mapping, cloud sync, production-site access, accounts, or model calls.

---

### Task 1: Ranked Locator Evidence Contract and Capture Core

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/schema.ts`
- Modify: `extension/capture.js`
- Modify: `test/extension/capture.test.ts`
- Modify: `test/daemon/server.test.ts`
- Modify: `test/integration.test.ts`

**Interfaces:**
- Consumes: current `CapturedElement`, `CapturePayload`, DOM `Element`, and Zod boundary schemas.
- Produces: `LocatorKind`, `LocatorCandidate`, `LocatorEvidence`, `generateLocatorEvidence(el)`, and `CapturedElement.locatorEvidence`.

- [ ] **Step 1: Write failing locator-generation tests**

```ts
import { captureElement, generateLocatorEvidence } from '../../extension/capture.js';

it('ranks a unique safe id first and reports high confidence', () => {
  document.body.innerHTML = '<main><button id="profile-save">저장</button><button>저장</button></main>';
  const target = document.getElementById('profile-save')!;
  expect(generateLocatorEvidence(target)).toEqual(expect.objectContaining({
    confidence: 'high',
    candidates: expect.arrayContaining([
      expect.objectContaining({ kind: 'id', value: '#profile-save', matchCount: 1, stability: 100 }),
    ]),
  }));
  expect(captureElement(target).locatorEvidence.candidates.length).toBeGreaterThan(0);
});

it('keeps only sensitivity-checked data-testid and data-cy values', () => {
  document.body.innerHTML = '<button data-testid="save-button" data-cy="token_abcdefghijklmnopqrstuvwxyz" data-user-id="42">저장</button>';
  const json = JSON.stringify(generateLocatorEvidence(document.querySelector('button')!));
  expect(json).toContain('save-button');
  expect(json).not.toContain('token_abcdefghijklmnopqrstuvwxyz');
  expect(json).not.toContain('42');
});
```

- [ ] **Step 2: Run capture tests and confirm contract failure**

Run: `npx vitest run test/extension/capture.test.ts`

Expected: FAIL because `generateLocatorEvidence` and `locatorEvidence` do not exist.

- [ ] **Step 3: Add shared locator types and bounded schemas**

```ts
export type LocatorKind = 'id' | 'test-id' | 'aria' | 'landmark' | 'css-path';

export interface LocatorCandidate {
  kind: LocatorKind;
  value: string;
  matchCount: number;
  stability: number;
}

export interface LocatorEvidence {
  candidates: LocatorCandidate[];
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}
```

Add `locatorEvidence: LocatorEvidence` to `CapturedElement`. Mirror it in Zod with `z.enum`, `z.number().int().min(0).max(100)`, `z.number().int().min(0)`, `z.array(...).max(8)`, and enum-derived reason strings. Add `.max(2_000)` to `userQuestion`.

- [ ] **Step 4: Implement deterministic locator candidates**

```js
const LOCATOR_LIMIT = 8;
const SAFE_TEST_ATTRS = ['data-testid', 'data-cy'];

function addCandidate(out, root, kind, value, stability) {
  if (!value || looksSensitive(value) || out.some((item) => item.kind === kind && item.value === value)) return;
  let matchCount = 0;
  try { matchCount = root.querySelectorAll(value).length; } catch { return; }
  out.push({ kind, value, matchCount, stability });
}

export function generateLocatorEvidence(el) {
  const root = el.ownerDocument;
  const candidates = [];
  if (el.id && !looksSensitive(el.id)) addCandidate(candidates, root, 'id', `#${cssEscape(el.id)}`, 100);
  for (const name of SAFE_TEST_ATTRS) {
    const value = collapse(el.getAttribute(name) || '');
    if (value) addCandidate(candidates, root, 'test-id', `[${name}="${cssEscape(value)}"]`, 95);
  }
  const role = collapse(el.getAttribute('role') || '');
  const aria = collapse(el.getAttribute('aria-label') || '');
  if (role && aria && !looksSensitive(aria)) addCandidate(candidates, root, 'aria', `[role="${cssEscape(role)}"][aria-label="${cssEscape(aria)}"]`, 85);
  const landmark = findLandmark(el);
  if (landmark) addCandidate(candidates, root, 'landmark', `${landmark} ${el.tagName.toLowerCase()}`, 65);
  addCandidate(candidates, root, 'css-path', buildSelector(el), 45);
  candidates.sort((a, b) => Number(a.matchCount !== 1) - Number(b.matchCount !== 1) || b.stability - a.stability);
  const ranked = candidates.slice(0, LOCATOR_LIMIT);
  const best = ranked[0];
  const confidence = best?.matchCount === 1 && best.stability >= 85 ? 'high' : best?.matchCount === 1 ? 'medium' : 'low';
  const reasons = best?.matchCount === 1 ? ['unique-candidate'] : ['no-unique-candidate'];
  return { candidates: ranked, confidence, reasons };
}
```

Call `generateLocatorEvidence(el)` from `captureElement`. Keep dataset output as keys only; locator generation may inspect only `data-testid` and `data-cy` values.

- [ ] **Step 5: Update boundary and fixture payloads**

Add valid `locatorEvidence` objects to payload builders in `test/daemon/server.test.ts` and `test/integration.test.ts`. Add rejection assertions for 9 candidates, stability 101, and a 2,001-character question.

- [ ] **Step 6: Run focused and full tests**

Run: `npx vitest run test/extension/capture.test.ts test/daemon/server.test.ts test/integration.test.ts`

Expected: PASS.

Run: `npm test && npm run build`

Expected: 0 failures and TypeScript build exit 0.

- [ ] **Step 7: Commit locator evidence**

```bash
git add src/shared/types.ts src/shared/schema.ts extension/capture.js test/extension/capture.test.ts test/daemon/server.test.ts test/integration.test.ts
git commit -m "feat: add ranked locator evidence"
```

---

### Task 2: Extension Service-Worker Security Boundary

**Files:**
- Create: `extension/runtime-api.js`
- Create: `test/extension/runtime-api.test.ts`
- Modify: `extension/background.js`
- Modify: `extension/content.js`
- Modify: `extension/transport.js`
- Modify: `extension/manifest.json`
- Modify: `test/extension/config.test.ts`
- Modify: `src/daemon/extension-api.ts`
- Modify: `src/daemon/server.ts`
- Modify: `src/daemon/daemon.ts`
- Modify: `test/daemon/server.test.ts`

**Interfaces:**
- Consumes: sanitized `CapturePayload`, `transport.postRequest/getStatus/release`, Chrome `runtime.onMessage`.
- Produces: `handleRuntimeMessage(message, sender, deps)`, exact `chrome-extension://mnglicpibnccgcifnndemfpidkcgboli` origin enforcement, and typed runtime responses.

- [ ] **Step 1: Write failing runtime sender-validation tests**

```ts
import { handleRuntimeMessage } from '../../extension/runtime-api.js';

const sender = { tab: { url: 'http://localhost:3000/' } };

it('forwards a valid sanitized request from a localhost tab', async () => {
  const postRequest = vi.fn().mockResolvedValue({ id: 'req_1', status: 'pending' });
  const result = await handleRuntimeMessage(
    { type: 'web-picker:create-request', payload: validPayload() },
    sender,
    { postRequest, getStatus: vi.fn(), release: vi.fn() },
  );
  expect(result).toEqual({ ok: true, data: { id: 'req_1', status: 'pending' } });
  expect(postRequest).toHaveBeenCalledWith(validPayload());
});

it('rejects a public sender before transport', async () => {
  const postRequest = vi.fn();
  const result = await handleRuntimeMessage(
    { type: 'web-picker:create-request', payload: validPayload() },
    { tab: { url: 'https://example.com/' } },
    { postRequest, getStatus: vi.fn(), release: vi.fn() },
  );
  expect(result).toEqual({ ok: false, error: { code: 'forbidden-sender', status: 403 } });
  expect(postRequest).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run runtime test and confirm missing module**

Run: `npx vitest run test/extension/runtime-api.test.ts`

Expected: FAIL because `extension/runtime-api.js` does not exist.

- [ ] **Step 3: Implement pure runtime handler and background adapter**

```js
export async function handleRuntimeMessage(message, sender, deps) {
  let senderUrl;
  try { senderUrl = new URL(sender?.tab?.url || ''); } catch { senderUrl = null; }
  const local = senderUrl && (senderUrl.hostname === 'localhost' || senderUrl.hostname === '127.0.0.1' || senderUrl.hostname.endsWith('.localhost'));
  if (!local) return { ok: false, error: { code: 'forbidden-sender', status: 403 } };
  try {
    if (message?.type === 'web-picker:create-request') return { ok: true, data: await deps.postRequest(message.payload) };
    if (message?.type === 'web-picker:get-status') return { ok: true, data: await deps.getStatus() };
    if (message?.type === 'web-picker:release') return { ok: true, data: await deps.release() };
    return { ok: false, error: { code: 'unknown-message', status: 400 } };
  } catch (error) {
    return { ok: false, error: { code: error.code || 'daemon-unavailable', status: error.status || 503 } };
  }
}
```

Register `chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { handleRuntimeMessage(message, sender, transport).then(sendResponse); return true; })` in `background.js`. Keep version polling in same service-worker adapter.

- [ ] **Step 4: Move content communication to runtime messages**

Replace dynamic import of `transport.js` in `content.js` with one helper:

```js
async function send(type, payload) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw Object.assign(new Error(response?.error?.code || 'runtime-error'), response?.error);
  return response.data;
}
```

Use `send('web-picker:get-status')`, `send('web-picker:create-request', payload)`, and `send('web-picker:release')`. Remove `transport.js` from `web_accessible_resources`.

- [ ] **Step 5: Pin extension identity and enforce exact origin**

Set `manifest.json` key to this generated RSA public key (public identity material only; no private key enters repository):

```json
"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA9Ede0BkAvJaqnOciwMhV/Xk66jSB1nXyUCSymJLGCLmZq3e+xYGswY0XgKQfLsLt8JEU7lvE/kA8yryT2n0DprGtWjvTMm8c6RjMWlO78/0I5p59FjLW83/V2Fi8tvnkctD4PpjuJnF56WNF44UDyogLCptMwU/8twKcw6xOok3wkFzc9QLQSFDCr4kx6sf8/f9/GBiL08vqDnciLxTre2ym57T00+GKD2RDxGSwQSkTZUFj38EFp8UvaiS3UF6y4tpVdclEjK54GOO0B/yqDHeomvAsGxJ/LnbrqiGOwnW/tUkhqIdgStZovu/X282qFEm0R7l92+iV7nvNd5HhCwIDAQAB"
```

Its deterministic Chrome extension ID is `mnglicpibnccgcifnndemfpidkcgboli`. Add `chrome-extension://mnglicpibnccgcifnndemfpidkcgboli` as `EXPECTED_EXTENSION_ORIGIN` in `src/daemon/daemon.ts` and pass it through `createServer` to `createExtensionApi`. Add a test that derives the ID from manifest key and prevents drift.

Change origin rule to:

```ts
function originAllowed(req: ApiRequest, expectedExtensionOrigin: string): boolean {
  return req.headers.origin === expectedExtensionOrigin;
}
```

Keep `GET /version.json` origin-free. Require exact extension origin for `/requests`, `/status`, `/release`, and preflight. Normal `http://localhost:3000` requests must return 403.

- [ ] **Step 6: Run extension and server security tests**

Run: `npx vitest run test/extension/runtime-api.test.ts test/extension/config.test.ts test/daemon/server.test.ts`

Expected: valid extension-origin calls PASS; absent, localhost-page, public, and wrong-extension origins return 403.

Run: `npm test && npm run build`

Expected: 0 failures and build exit 0.

- [ ] **Step 7: Commit service-worker boundary**

```bash
git add extension/runtime-api.js extension/background.js extension/content.js extension/transport.js extension/manifest.json test/extension/runtime-api.test.ts test/extension/config.test.ts src/daemon/extension-api.ts src/daemon/server.ts src/daemon/daemon.ts test/daemon/server.test.ts
git commit -m "security: isolate daemon behind extension worker"
```

---

### Task 3: Transactional Queue State and Persistence Port

**Files:**
- Create: `src/daemon/persistence.ts`
- Create: `test/daemon/persistence.test.ts`
- Modify: `src/daemon/state.ts`
- Modify: `test/daemon/state.test.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Consumes: `WebRequest[]`, injectable clock, existing queue transitions.
- Produces: `QueueSnapshot`, `QueuePersistence`, `createState({ initialRequests, persistence })`, rollback on save failure, startup normalization, retention.

- [ ] **Step 1: Write failing transaction and recovery tests**

```ts
it('rolls back enqueue when persistence fails', () => {
  const persistence = { save: vi.fn(() => { throw new Error('disk full'); }) };
  const state = createState({ persistence });
  expect(() => state.enqueue(payload())).toThrow('disk full');
  expect(state.list()).toEqual([]);
});

it('loads claimed requests as pending and keeps resolved history capped at 50', () => {
  const state = createState({ initialRequests: persistedRows({ unresolved: 2, claimed: 1, resolved: 55 }) });
  expect(state.list().filter((row) => row.status !== 'resolved')).toHaveLength(3);
  expect(state.list().filter((row) => row.status === 'resolved')).toHaveLength(50);
  expect(state.list().some((row) => row.status === 'claimed')).toBe(false);
});

it('returns claimed work to pending when heartbeat expires', () => {
  let now = 0;
  const state = createState({ now: () => now, heartbeatTimeoutMs: 10, persistence: memoryPersistence() });
  state.register('agent', 'Agent');
  state.claim('agent');
  state.enqueue(payload());
  state.pull();
  now = 11;
  state.sweep();
  expect(state.list()[0].status).toBe('pending');
});
```

- [ ] **Step 2: Run state tests and confirm missing options/behavior**

Run: `npx vitest run test/daemon/state.test.ts test/daemon/persistence.test.ts`

Expected: FAIL on missing persistence contracts and rollback/recovery behavior.

- [ ] **Step 3: Define persistence port and snapshot schema**

```ts
export const QUEUE_SCHEMA_VERSION = 1 as const;

export interface QueueSnapshot {
  schemaVersion: typeof QUEUE_SCHEMA_VERSION;
  requests: WebRequest[];
}

export interface QueuePersistence {
  save(snapshot: QueueSnapshot): void;
}

export function retainedRequests(rows: WebRequest[]): WebRequest[] {
  const unresolved = rows.filter((row) => row.status !== 'resolved');
  const resolved = rows.filter((row) => row.status === 'resolved').sort((a, b) => b.resolvedAt! - a.resolvedAt!).slice(0, 50);
  return [...unresolved, ...resolved].sort((a, b) => a.createdAt - b.createdAt);
}
```

Add a Zod persisted-request schema that reuses `capturePayloadSchema`, validates status and timestamps, and rejects unknown schema versions.

- [ ] **Step 4: Make mutations copy-save-commit**

For `enqueue`, `pull`, `resolve`, and heartbeat-expiry requeue, create next request arrays without mutating current rows. Call `persistence.save({ schemaVersion: 1, requests: retainedRequests(next) })` before replacing internal queue/map state. If save throws, keep old objects and state exactly unchanged. Notify subscribers only after successful enqueue commit.

Return `true` for resolving an already-resolved known request, preserving idempotent success; return `false` only for unknown IDs.

- [ ] **Step 5: Run state suite**

Run: `npx vitest run test/daemon/state.test.ts test/daemon/persistence.test.ts`

Expected: rollback, idempotent resolve, retention, startup reset, and heartbeat requeue PASS.

- [ ] **Step 6: Commit persistence port**

```bash
git add src/shared/types.ts src/daemon/persistence.ts src/daemon/state.ts test/daemon/persistence.test.ts test/daemon/state.test.ts
git commit -m "feat: make queue mutations durable"
```

---

### Task 4: Filesystem Queue Adapter and Daemon Recovery

**Files:**
- Create: `src/daemon/file-persistence.ts`
- Create: `test/daemon/file-persistence.test.ts`
- Modify: `src/daemon/paths.ts`
- Modify: `test/daemon/paths.test.ts`
- Modify: `src/daemon/daemon.ts`
- Modify: `src/daemon/extension-api.ts`
- Modify: `test/integration.test.ts`

**Interfaces:**
- Consumes: `QueueSnapshot`, `QueuePersistence`, runtime home directory.
- Produces: `createFileQueueStore(paths: Paths): FileQueueStore`, `FileQueueStore.load(): QueueLoadResult`, `FileQueueStore.save(snapshot): void`, queue warning in status, restart recovery.

- [ ] **Step 1: Write failing filesystem tests**

```ts
it('writes queue atomically with user-only permissions', () => {
  const paths = resolvePaths({ home });
  const store = createFileQueueStore(paths);
  store.save(snapshot([row()]));
  expect(statSync(home).mode & 0o777).toBe(0o700);
  expect(statSync(join(home, 'queue.json')).mode & 0o777).toBe(0o600);
  expect(readdirSync(home).filter((name) => name.includes('.tmp-'))).toEqual([]);
});

it('quarantines invalid JSON without exposing captured content', () => {
  writeFileSync(join(runtimeDir, 'queue.json'), '{broken', { mode: 0o600 });
  const result = createFileQueueStore(resolvePaths({ home })).load();
  expect(result).toEqual({ requests: [], warning: 'queue-corrupt' });
  expect(readdirSync(runtimeDir).some((name) => /^queue\.json\.corrupt-\d+$/.test(name))).toBe(true);
});
```

- [ ] **Step 2: Run filesystem tests and confirm missing adapter**

Run: `npx vitest run test/daemon/file-persistence.test.ts`

Expected: FAIL because `createFileQueueStore` does not exist.

- [ ] **Step 3: Extend runtime paths**

Add `queueFile: join(base, 'queue.json')` to existing `Paths`. Preserve current token/runtime paths. Ensure `paths.dir` mode `0o700` and existing files are tightened when too broad. Default `base` remains `~/.web-picker`; injected test homes remain exact isolated runtime directories.

- [ ] **Step 4: Implement atomic filesystem adapter**

```ts
save(snapshot) {
  mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  chmodSync(paths.dir, 0o700);
  const temp = `${paths.queueFile}.tmp-${process.pid}-${Date.now()}`;
  const fd = openSync(temp, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(snapshot));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(temp, 0o600);
  renameSync(temp, paths.queueFile);
}
```

On load, validate JSON with persisted schema. For invalid JSON/schema, atomically rename using `` `queue.json.corrupt-${Date.now()}` ``, return empty requests and warning `queue-corrupt`, and log only warning code/path—not file content.

- [ ] **Step 5: Wire load/save and warning through daemon**

In `startDaemon`, load store before `createState`, pass `initialRequests` and persistence port, and retain warning in server dependencies. Include `{ warning: 'queue-corrupt' | null }` in `/status`. Do not persist active session ID or registry.

- [ ] **Step 6: Add restart integration proof**

Start daemon with temporary home, enqueue two requests, claim one, close daemon, restart with same home, then assert both requests remain and both are pending. Resolve one, restart, and assert resolved status survives. Inspect `queue.json` and assert no session ID appears.

- [ ] **Step 7: Run persistence and integration tests**

Run: `npx vitest run test/daemon/paths.test.ts test/daemon/file-persistence.test.ts test/integration.test.ts`

Expected: permissions, quarantine, restart, and session non-persistence PASS.

Run: `npm test && npm run build`

Expected: 0 failures and build exit 0.

- [ ] **Step 8: Commit filesystem persistence**

```bash
git add src/daemon/file-persistence.ts src/daemon/paths.ts src/daemon/daemon.ts src/daemon/extension-api.ts test/daemon/file-persistence.test.ts test/daemon/paths.test.ts test/integration.test.ts
git commit -m "feat: recover queue across daemon restarts"
```

---

### Task 5: Boundary Size Limits and Actionable UI Errors

**Files:**
- Modify: `src/daemon/server.ts`
- Modify: `src/daemon/http.ts`
- Modify: `src/daemon/extension-api.ts`
- Modify: `test/daemon/server.test.ts`
- Modify: `extension/transport.js`
- Modify: `extension/runtime-api.js`
- Modify: `extension/content.js`
- Modify: `test/extension/runtime-api.test.ts`
- Modify: `src/shim/spawn.ts`
- Modify: `test/shim/spawn.test.ts`

**Interfaces:**
- Consumes: raw HTTP request stream and typed runtime response.
- Produces: stable errors `invalid-payload`, `forbidden-origin`, `payload-too-large`, `persistence-failed`, `daemon-unavailable` with HTTP status.

- [ ] **Step 1: Write failing HTTP and runtime error tests**

```ts
it('returns 413 before enqueue when serialized body exceeds 64 KiB', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/requests`, {
    method: 'POST',
    headers: { origin: expectedOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload(), title: 'x'.repeat(65_536) }),
  });
  expect(res.status).toBe(413);
  expect(await res.json()).toEqual({ error: 'payload-too-large' });
  expect(state.list()).toHaveLength(0);
});

it.each([
  [400, 'invalid-payload'], [403, 'forbidden-origin'], [413, 'payload-too-large'],
  [507, 'persistence-failed'], [503, 'daemon-unavailable'],
])('preserves %s/%s across runtime relay', async (status, code) => {
  const result = await handleRuntimeMessage(message(), sender, throwingDeps(status, code));
  expect(result).toEqual({ ok: false, error: { status, code } });
});
```

- [ ] **Step 2: Run focused tests and confirm generic errors**

Run: `npx vitest run test/daemon/server.test.ts test/extension/runtime-api.test.ts`

Expected: FAIL because oversize currently becomes 500 and runtime errors collapse.

- [ ] **Step 3: Introduce transport-safe error classes**

```ts
export class HttpInputError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
```

Set `MAX_BODY_BYTES = 64 * 1024`. Stop accumulating chunks once exceeded and reject with `new HttpInputError(413, 'payload-too-large')`. Map Zod failure to 400 `invalid-payload`, exact-origin failure to 403 `forbidden-origin`, and persistence exception to 507 `persistence-failed`. Log only code, method, and path.

- [ ] **Step 4: Preserve daemon error status through transport and relay**

```js
export class DaemonError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

async function jsonOrThrow(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new DaemonError(res.status, body.error || 'daemon-error');
  return body;
}
```

Use `jsonOrThrow` for all daemon fetches and preserve `{ status, code }` in `runtime-api.js`.

- [ ] **Step 5: Render distinct Korean guidance**

Map codes in `content.js`: `forbidden-origin` → extension reload/reinstall guidance; `payload-too-large` → shorten request/reselect element; `persistence-failed` → disk permission/free-space guidance; `daemon-unavailable` → start/register daemon guidance; `invalid-payload` → recapture element. Do not print captured content.

- [ ] **Step 6: Validate daemon reuse and report occupied ports**

Add launcher tests for three cases: recorded runtime answers with matching package version and accepts authenticated IPC, configured port refuses connections and is spawned, configured port answers but is not Web Picker and fails immediately with `Port 8787 is occupied by a non-Web Picker process.`. Change `tryHandle` to verify `/version.json` body version and one token-authenticated `/ipc` operation before reuse. Never treat `EADDRINUSE` as success unless validation passes.

- [ ] **Step 7: Run tests and commit boundary errors**

Run: `npm test && npm run build`

Expected: 0 failures and build exit 0.

```bash
git add src/daemon/server.ts src/daemon/http.ts src/daemon/extension-api.ts test/daemon/server.test.ts extension/transport.js extension/runtime-api.js extension/content.js test/extension/runtime-api.test.ts src/shim/spawn.ts test/shim/spawn.test.ts
git commit -m "fix: expose safe actionable boundary errors"
```

---

### Task 6: MCP Evidence Output and Stdio Protocol Integration

**Files:**
- Modify: `src/shim/tools.ts`
- Modify: `test/shim/tools.test.ts`
- Create: `test/mcp-stdio.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: stored `LocatorEvidence`, `scripts/run.cjs`, MCP SDK client transport.
- Produces: locator candidate detail text and real stdio `initialize → tools/list → tools/call` proof.

- [ ] **Step 1: Write failing tool-detail and stdio tests**

```ts
it('shows ranked locator evidence and masking facts', async () => {
  const result = await createTools(fakeClient(rowWithEvidence())).get_web_request({ id: 'req_1' });
  const output = result.content[0].text;
  expect(output).toContain('locator confidence: high');
  expect(output).toContain('1. id #profile-save — 1 match — stability 100');
  expect(output).toContain('masking: text-shaped, values-removed');
});
```

In `test/mcp-stdio.test.ts`, create MCP `Client`, connect with `StdioClientTransport({ command: process.execPath, args: ['scripts/run.cjs'], env: { ...process.env, WEB_PICKER_HOME: home, WEB_PICKER_PORT: '0' } })`, assert seven tool names, call connect/list/get/resolve, then close transport and daemon.

- [ ] **Step 2: Run focused tests and confirm missing evidence/protocol proof**

Run: `npx vitest run test/shim/tools.test.ts test/mcp-stdio.test.ts`

Expected: tool output assertion fails; stdio test initially fails until deterministic runtime-home cleanup is wired.

- [ ] **Step 3: Format evidence without page secrets**

Append candidate lines from `locatorEvidence.candidates` in stored order. Include kind, selector value, match count, stability, confidence, reason codes, dataset keys, and constant masking facts. Never add raw DOM text, attribute values outside approved candidate values, or token data.

- [ ] **Step 4: Finish stdio lifecycle cleanup**

Use temporary `WEB_PICKER_HOME`, read runtime PID after client close, terminate only that explicit child PID, and remove only that temporary directory. Assert no stdout outside MCP protocol by completing SDK handshake without parse errors.

- [ ] **Step 5: Add script and run suite**

Add `"test:mcp": "vitest run test/mcp-stdio.test.ts"` to `package.json`.

Run: `npm run test:mcp && npm test && npm run build`

Expected: seven tools listed, round trip completes, full suite and build pass.

- [ ] **Step 6: Commit MCP verification**

```bash
git add src/shim/tools.ts test/shim/tools.test.ts test/mcp-stdio.test.ts package.json package-lock.json
git commit -m "test: verify MCP stdio round trip"
```

---

### Task 7: Real Chrome Extension-to-MCP E2E

**Files:**
- Create: `test/e2e/chrome-roundtrip.test.ts`
- Create: `test/e2e/server.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: unpacked MV3 extension, `test-page`, daemon port 8787, MCP client.
- Produces: `npm run test:e2e` real-Chrome judge-flow proof.

- [ ] **Step 1: Add Playwright Core and failing E2E skeleton**

Run: `npm install --save-dev playwright-core`

Add script: `"test:e2e": "vitest run test/e2e/chrome-roundtrip.test.ts --testTimeout=60000"`.

Write test setup that serves `test-page` on a free localhost port, starts daemon on 8787 with temporary home, and launches a persistent Chrome profile with:

```ts
const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chrome',
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});
```

- [ ] **Step 2: Drive real pick and submission**

Open demo URL, click `#wp-fab`, click `#wp-pick`, click `#profile-save`, fill `#wp-q` with `이 버튼을 파란색으로`, click `#wp-send`, and assert success title `요청을 큐에 보냈습니다`.

Create existing `WebPickerClient` against daemon runtime, list pending requests, and assert target evidence has `confidence: 'high'`, a unique candidate, and no sensitive decoy values. Resolve request and verify status.

- [ ] **Step 3: Add cleanup and prerequisite diagnostics**

Close Chrome context, HTTP test server, MCP client, and daemon in `afterEach`. Remove only generated temporary profile/home. When Chrome is absent, fail with exact message: `Google Chrome is required for npm run test:e2e; install Chrome or set PLAYWRIGHT_CHROME_EXECUTABLE`.

- [ ] **Step 4: Run real browser test twice**

Run: `npm run test:e2e && npm run test:e2e`

Expected: both runs PASS without stale profile, port, daemon, or extension state.

- [ ] **Step 5: Document platform commands and commit**

Document Chrome prerequisite, headed-session requirement, macOS/Linux/Windows command, expected duration, and failure diagnostic in README.

```bash
git add test/e2e/chrome-roundtrip.test.ts test/e2e/server.ts package.json package-lock.json README.md
git commit -m "test: add real Chrome extension round trip"
```

---

### Task 8: Deterministic Target-Disambiguation Benchmark

**Files:**
- Create: `benchmark/fixtures.ts`
- Create: `benchmark/run.ts`
- Create: `test/benchmark.test.ts`
- Create: `artifacts/benchmark-results.json`
- Create: `artifacts/benchmark-results.md`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: 30+ static HTML fixtures and `generateLocatorEvidence`.
- Produces: deterministic text-only rate, Web Picker locator rate, confidence calibration, mean payload bytes, p95 payload bytes.

- [ ] **Step 1: Define fixture contract and 30 cases**

```ts
export interface BenchmarkFixture {
  id: string;
  category: 'repeated-label' | 'repeated-class' | 'nested-landmark' | 'generated-class' | 'aria-only' | 'safe-test-id';
  html: string;
  target: string;
}
```

Create five deterministic fixtures per category. Every target uses only static HTML; at least half have ambiguous visible text. Include expected target selector only as benchmark ground truth, never as capture input.

- [ ] **Step 2: Write failing benchmark invariants**

```ts
it('covers at least 30 fixtures and six categories', () => {
  expect(fixtures.length).toBeGreaterThanOrEqual(30);
  expect(new Set(fixtures.map((item) => item.category))).toHaveLength(6);
});

it('is deterministic across repeated runs', () => {
  expect(runBenchmark(fixtures)).toEqual(runBenchmark(fixtures));
});
```

- [ ] **Step 3: Implement scoped metrics**

Text-only succeeds only when target visible label is non-null and unique among document elements. Locator succeeds when highest-ranked unique candidate resolves exactly to target. Calibration groups success counts by returned confidence. Payload bytes use `Buffer.byteLength(JSON.stringify(capturePayload))`; p95 uses sorted index `Math.ceil(n * 0.95) - 1`.

- [ ] **Step 4: Add deterministic artifact writer**

Add `"benchmark": "npm run build && node dist/benchmark/run.js"`. Sort fixture and category output, omit wall-clock timestamps, write stable JSON plus Markdown table. Label result `target-disambiguation benchmark`; do not claim agent productivity or source retrieval.

- [ ] **Step 5: Run benchmark reproducibility checks**

Run: `npm run benchmark && cp artifacts/benchmark-results.json /tmp/web-picker-benchmark.json && npm run benchmark && diff -u /tmp/web-picker-benchmark.json artifacts/benchmark-results.json`

Expected: diff exit 0; fixture count at least 30; all four required metrics present.

- [ ] **Step 6: Run tests and commit benchmark**

Run: `npx vitest run test/benchmark.test.ts && npm test && npm run build`

Expected: deterministic benchmark tests, full suite, and build PASS.

```bash
git add benchmark/fixtures.ts benchmark/run.ts test/benchmark.test.ts artifacts/benchmark-results.json artifacts/benchmark-results.md package.json README.md
git commit -m "feat: add target disambiguation benchmark"
```

---

### Task 9: SBOM, Judge Documentation, and Submission Package

**Files:**
- Create: `artifacts/sbom.cdx.json`
- Create: `docs/dependencies.md`
- Create: `docs/architecture.md`
- Create: `docs/video-script.md`
- Create: `docs/submission-checklist.md`
- Create: `artifacts/web-picker-result-report.docx`
- Create: `artifacts/web-picker-result-report.pdf`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: locked dependency graph, benchmark artifacts, verified setup flow, architecture and security decisions.
- Produces: CycloneDX SBOM, human-readable license table, five-page report body, matching PDF, three-minute video script, checked submission list.

- [ ] **Step 1: Generate and validate CycloneDX SBOM**

Run: `npm install --save-dev @cyclonedx/cyclonedx-npm`

Add `"sbom": "cyclonedx-npm --output-file artifacts/sbom.cdx.json --output-format JSON --spec-version 1.5"`.

Run: `npm run sbom && node -e "const x=require('./artifacts/sbom.cdx.json'); if(x.bomFormat!=='CycloneDX'||!x.components?.length) process.exit(1)"`

Expected: valid CycloneDX JSON with root metadata and complete npm components.

- [ ] **Step 2: Produce dependency/license table**

Read direct and transitive packages from lockfile/SBOM, verify each license from installed package metadata, and write package, version, license, role, and source URL columns to `docs/dependencies.md`. Explicitly call out no GPL-family runtime dependency.

- [ ] **Step 3: Write judge-facing architecture and README flow**

Document extension → service worker → daemon → MCP adapter data flow, exact security boundaries, persistence recovery, locator scoring, limitations, and all four required commands:

```bash
npm test
npm run build
npm run test:e2e
npm run benchmark
```

Time fresh setup and keep five-minute judge path. Replace user-facing `shim` with `MCP adapter` while retaining source-directory names only where commands require them.

- [ ] **Step 4: Create result report DOCX and matching PDF**

Use official contest template. Keep report body at five pages maximum. Include problem, architecture, differentiation, security, benchmark results, reproducibility, open-source license, development-assistant disclosure, public repository URL field, YouTube URL field, and mandatory SBOM attachment. Remove AI-model attachment because product embeds no model. Convert same document to PDF and visually verify every page, table, link, and attachment reference.

- [ ] **Step 5: Write timed three-minute video script**

Use segments: 0:00–0:20 problem/value; 0:20–0:55 decoy pick; 0:55–1:20 masking/locator confidence; 1:20–1:55 MCP pull and source change; 1:55–2:15 refresh/result; 2:15–2:35 daemon restart recovery; 2:35–3:00 benchmark, security, license, repository.

- [ ] **Step 6: Run clean-checkout acceptance rehearsal**

From fresh temporary clone, run bootstrap, `npm test`, `npm run build`, `npm run test:e2e`, `npm run benchmark`, and `npm run sbom`. Follow README without undocumented commands. Verify repository URL and video URL resolve before checking submission items complete.

- [ ] **Step 7: Commit submission artifacts**

```bash
git add artifacts docs/dependencies.md docs/architecture.md docs/video-script.md docs/submission-checklist.md README.md package.json package-lock.json
git commit -m "docs: complete contest submission package"
```

---

## Final Verification Gate

- [ ] Run `npm test` and record exact passing file/test counts.
- [ ] Run `npm run build` and confirm exit 0.
- [ ] Run `npm run test:e2e` from clean Chrome profile.
- [ ] Run `npm run benchmark` twice and diff JSON outputs.
- [ ] Run `npm run sbom` and validate CycloneDX metadata/components.
- [ ] Inspect `git status --short`; preserve unrelated `.gitignore` change.
- [ ] Compare every acceptance criterion in design spec against test, artifact, or documented evidence.
- [ ] Perform pre-landing code review before push/PR workflow.
