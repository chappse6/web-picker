/**
 * Extension-facing HTTP API (application layer, pure).
 *
 * Security model for browser-originated requests: the daemon binds 127.0.0.1
 * only (network isolation) AND this handler requires the exact pinned Chrome
 * extension Origin. Localhost page scripts cannot call these routes directly.
 */
import type { State } from './state.js';
import type { ApiHandler, ApiRequest, ApiResponse } from './http.js';
import { capturePayloadSchema } from '../shared/schema.js';

export interface ExtensionApiConfig {
  version: string;
  expectedExtensionOrigin: string;
  queueWarning?: 'queue-corrupt' | null;
}

function json(status: number, body: unknown): ApiResponse {
  return { status, body };
}

function originAllowed(req: ApiRequest, expectedExtensionOrigin: string): boolean {
  return req.headers.origin === expectedExtensionOrigin;
}

export function createExtensionApi(state: State, config: ExtensionApiConfig): ApiHandler {
  return (req) => {
    // version.json is safe to serve without an origin check (used by the
    // extension's auto-reload probe; contains no sensitive data).
    if (req.method === 'GET' && req.path === '/version.json') {
      return json(200, { version: config.version });
    }

    if (!originAllowed(req, config.expectedExtensionOrigin)) {
      return json(403, { error: 'forbidden-origin' });
    }

    if (req.method === 'POST' && req.path === '/requests') {
      const parsed = capturePayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return json(400, { error: 'invalid-payload' });
      }
      try {
        const request = state.enqueue(parsed.data);
        return json(200, { id: request.id, status: request.status });
      } catch {
        return json(507, { error: 'persistence-failed' });
      }
    }

    if (req.method === 'GET' && req.path === '/status') {
      return json(200, {
        activeSessionId: state.activeSessionId,
        queue: state.list().map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt })),
        warning: config.queueWarning ?? null,
      });
    }

    if (req.method === 'POST' && req.path === '/release') {
      const prev = state.activeSessionId;
      if (prev) state.release(prev);
      return json(200, { ok: true, released: prev });
    }

    return json(404, { error: 'not found' });
  };
}
