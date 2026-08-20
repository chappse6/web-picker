import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePaths, readRuntime } from '../src/daemon/paths.js';
import type { QueueSnapshot } from '../src/shared/types.js';

const homes: string[] = [];

function seedPendingRequest(home: string): void {
  const paths = resolvePaths({ home, env: {} });
  mkdirSync(paths.dir, { recursive: true });
  const snapshot: QueueSnapshot = {
    schemaVersion: 1,
    requests: [{
      id: 'req_stdio',
      status: 'pending',
      createdAt: 0,
      claimedAt: null,
      resolvedAt: null,
      payload: {
        url: 'http://localhost:3000/profile',
        title: 'Profile',
        viewport: { width: 1024, height: 768 },
        element: {
          selector: '#profile-save',
          tagName: 'button',
          id: 'profile-save',
          className: 'button',
          role: null,
          ariaLabel: null,
          dataset: [],
          attributes: {},
          ancestors: [],
          rect: { x: 0, y: 0, width: 100, height: 40 },
          maskedText: '••••',
          maskedOuterHTML: '<button>…</button>',
          landmark: 'main',
          visibleLabel: 'Save',
          locatorEvidence: {
            candidates: [{ kind: 'id', value: '#profile-save', matchCount: 1, stability: 100 }],
            confidence: 'high',
            reasons: ['unique-candidate'],
          },
        },
        userQuestion: 'Update the save button style',
        createdAt: '2026-08-19T00:00:00.000Z',
        source: 'chrome-extension',
      },
    }],
  };
  writeFileSync(paths.queueFile, JSON.stringify(snapshot));
}

async function stopDaemon(home: string): Promise<void> {
  const runtime = readRuntime(resolvePaths({ home, env: {} }));
  if (!runtime.pid) return;
  try {
    process.kill(runtime.pid, 'SIGTERM');
  } catch {
    // The explicitly recorded process may already have exited.
  }
}

afterEach(async () => {
  for (const home of homes.splice(0)) {
    await stopDaemon(home);
    rmSync(home, { recursive: true, force: true });
  }
});

describe('MCP stdio server', () => {
  it('completes the SDK initialize, list, get, and resolve round trip', async () => {
    const home = mkdtempSync(join(tmpdir(), 'wp-mcp-'));
    homes.push(home);
    seedPendingRequest(home);

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['scripts/run.cjs'],
      cwd: process.cwd(),
      env: { ...process.env, WEB_PICKER_HOME: home, WEB_PICKER_PORT: '0' },
    });
    const client = new Client({ name: 'web-picker-stdio-test', version: '1.0.0' });

    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        'connect_web_picker',
        'list_web_requests',
        'watch_web_requests',
        'get_web_request',
        'resolve_web_request',
        'release_web_picker',
        'take_over_web_picker',
      ]);

      expect((await client.callTool({ name: 'connect_web_picker', arguments: {} })).content[0]).toMatchObject({ type: 'text' });
      expect((await client.callTool({ name: 'list_web_requests', arguments: {} })).content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('req_stdio') });
      const detail = (await client.callTool({ name: 'get_web_request', arguments: { id: 'req_stdio' } })).content[0];
      expect(detail).toMatchObject({ type: 'text', text: expect.stringContaining('locator confidence: high') });
      expect(detail).toMatchObject({ type: 'text', text: expect.stringContaining('reason codes: unique-candidate') });
      expect(detail).toMatchObject({ type: 'text', text: expect.stringContaining('1. id #profile-save — 1 match — stability 100') });
      expect((await client.callTool({ name: 'resolve_web_request', arguments: { id: 'req_stdio' } })).content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Resolved req_stdio') });
    } finally {
      await transport.close();
    }

    const persisted = JSON.parse(readFileSync(resolvePaths({ home, env: {} }).queueFile, 'utf8')) as QueueSnapshot;
    expect(persisted.requests[0].status).toBe('resolved');
  }, 30_000);
});
