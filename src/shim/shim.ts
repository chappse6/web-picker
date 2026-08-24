/**
 * MCP server entrypoint (driving adapter).
 *
 * Thin: it wires the tested tools (tools.ts) over a real client (client.ts +
 * spawn.ts) to the MCP SDK's stdio transport. All behavior lives in the tested
 * layers below; this file only translates MCP calls to tool calls.
 *
 * Agent-neutral: the label is configurable but nothing here branches on it.
 */
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createClient, createHttpTransport } from './client.js';
import { createLauncher } from './spawn.js';
import { createTools } from './tools.js';
import type { McpResult } from './tools.js';

const HEARTBEAT_INTERVAL_MS = 10_000;

const TOOL_DEFS = [
  {
    name: 'connect_web_picker',
    description: 'Connect to the local Web Picker daemon, register this session, claim the picker, and report any pending requests. This is a snapshot; call watch_web_requests to wait for new picks or list_web_requests to read the queue.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_web_requests',
    description: 'List queued element-pick requests (auto-claims the picker on first use). Each item shows id and status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'watch_web_requests',
    description: 'Long-poll for new element-pick requests. Returns as soon as a new request arrives or the timeout elapses.',
    inputSchema: {
      type: 'object',
      properties: { timeoutMs: { type: 'number', description: 'max wait in ms' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_web_request',
    description: 'Get full detail for one request by id, including the target-identifying clues (selector, ancestors, landmark, visible label).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'resolve_web_request',
    description: 'Mark a request as resolved once you have applied the change.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'release_web_picker',
    description: 'Release this session\'s hold on the picker so another agent can claim it.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'take_over_web_picker',
    description: 'Forcibly take over the picker session from whoever currently holds it.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const;

export async function main(): Promise<void> {
  const client = createClient({
    launcher: createLauncher(),
    createTransport: createHttpTransport,
    sessionId: randomUUID(),
    label: process.env.WEB_PICKER_LABEL ?? 'coding-agent',
  });
  const tools = createTools(client);

  const server = new Server(
    { name: 'web-picker', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

  async function dispatch(name: string, args: Record<string, unknown>): Promise<McpResult> {
    switch (name) {
      case 'connect_web_picker':
        return tools.connect_web_picker();
      case 'list_web_requests':
        return tools.list_web_requests();
      case 'watch_web_requests':
        return tools.watch_web_requests(args as { timeoutMs?: number });
      case 'get_web_request':
        return tools.get_web_request(args as { id: string });
      case 'resolve_web_request':
        return tools.resolve_web_request(args as { id: string });
      case 'release_web_picker':
        return tools.release_web_picker();
      case 'take_over_web_picker':
        return tools.take_over_web_picker();
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  }

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = request.params;
    const result = await dispatch(name, args);
    return result as CallToolResult;
  });

  // Keep the session alive on the daemon side. Best-effort; ignore failures.
  const heartbeat = setInterval(() => {
    client.heartbeat().catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  await server.connect(new StdioServerTransport());
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === new URL(`file://${invokedPath}`).href) {
  main().catch((err) => {
    console.error('web-picker shim failed:', err);
    process.exit(1);
  });
}
