/**
 * Node http adapter (driving adapter).
 *
 * The only file allowed to touch Node's http module. It parses raw requests
 * into transport-neutral ApiRequest DTOs, dispatches to the pure handlers, and
 * writes ApiResponse back. Binds 127.0.0.1 only — never a public interface.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { State } from './state.js';
import { DEFAULT_PORT } from './state.js';
import type { ApiHandler, ApiRequest, Logger } from './http.js';
import { silentLogger } from './http.js';
import { createExtensionApi } from './extension-api.js';
import { createIpcApi } from './ipc-api.js';

export interface ServerDeps {
  state: State;
  version: string;
  token: string;
  expectedExtensionOrigin: string;
  host?: string;
  logger?: Logger;
}

export interface RunningServer {
  listen(port?: number): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
}

const BIND_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1_000_000;

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve(undefined);
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw.length ? JSON.parse(raw) : undefined);
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', reject);
  });
}

function lowercaseHeaders(headers: http.IncomingHttpHeaders): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

export function createServer(deps: ServerDeps): RunningServer {
  const host = deps.host ?? BIND_HOST;
  const logger = deps.logger ?? silentLogger;
  const extensionApi = createExtensionApi(deps.state, {
    version: deps.version,
    expectedExtensionOrigin: deps.expectedExtensionOrigin,
  });
  const ipcApi = createIpcApi(deps.state, { token: deps.token });

  const server = http.createServer(async (rawReq, rawRes) => {
    try {
      const url = new URL(rawReq.url ?? '/', `http://${host}`);
      const corsHeaders = {
        'access-control-allow-origin': deps.expectedExtensionOrigin,
        'access-control-allow-headers': 'content-type, x-web-picker-token',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      };

      // Protected extension calls are made by the worker and preflight with its
      // pinned origin. Never reflect an arbitrary request origin.
      if (rawReq.method === 'OPTIONS') {
        const requestOrigin = Array.isArray(rawReq.headers.origin)
          ? rawReq.headers.origin[0]
          : rawReq.headers.origin;
        rawRes.writeHead(requestOrigin === deps.expectedExtensionOrigin ? 204 : 403, corsHeaders);
        rawRes.end();
        return;
      }

      const apiReq: ApiRequest = {
        method: rawReq.method ?? 'GET',
        path: url.pathname,
        headers: lowercaseHeaders(rawReq.headers),
        body: await readBody(rawReq),
      };
      const handler: ApiHandler = url.pathname.startsWith('/ipc') ? ipcApi : extensionApi;
      const res = await handler(apiReq);
      const payload = JSON.stringify(res.body ?? {});
      rawRes.writeHead(res.status, { 'content-type': 'application/json', ...corsHeaders });
      rawRes.end(payload);
    } catch (err) {
      logger.error('request handling failed', err);
      rawRes.writeHead(500, { 'content-type': 'application/json' });
      rawRes.end(JSON.stringify({ error: 'internal error' }));
    }
  });

  return {
    listen(port = DEFAULT_PORT) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const addr = server.address() as AddressInfo;
          logger.info('daemon listening', { host, port: addr.port });
          resolve({ host, port: addr.port });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
