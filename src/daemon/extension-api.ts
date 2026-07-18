/**
 * Extension-facing HTTP API (application layer, pure).
 *
 * Security model for browser-originated requests: the daemon binds 127.0.0.1
 * only (network isolation) AND this handler allowlists the request Origin to
 * localhost / 127.0.0.1. No token — a browser page cannot hold a secret safely.
 */
import type { State } from './state.js';
import type { ApiHandler, ApiRequest, ApiResponse } from './http.js';
import { capturePayloadSchema } from '../shared/schema.js';

export interface ExtensionApiConfig {
  version: string;
  /** allowlisted hostnames for the request Origin. */
  allowedHosts?: string[];
}

const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function json(status: number, body: unknown): ApiResponse {
  return { status, body };
}

/** True when the Origin header is absent (non-browser) or points at an allowlisted host. */
function originAllowed(req: ApiRequest, allowedHosts: string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser local tools; bind is already 127.0.0.1-only
  try {
    return allowedHosts.includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function createExtensionApi(state: State, config: ExtensionApiConfig): ApiHandler {
  const allowedHosts = config.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;

  return (req) => {
    // version.json is safe to serve without an origin check (used by the
    // extension's auto-reload probe; contains no sensitive data).
    if (req.method === 'GET' && req.path === '/version.json') {
      return json(200, { version: config.version });
    }

    if (!originAllowed(req, allowedHosts)) {
      return json(403, { error: 'forbidden origin' });
    }

    if (req.method === 'POST' && req.path === '/requests') {
      const parsed = capturePayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return json(400, { error: 'invalid capture payload', issues: parsed.error.issues });
      }
      const request = state.enqueue(parsed.data);
      return json(200, { id: request.id, status: request.status });
    }

    if (req.method === 'GET' && req.path === '/status') {
      return json(200, {
        activeSessionId: state.activeSessionId,
        queue: state.list().map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt })),
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
