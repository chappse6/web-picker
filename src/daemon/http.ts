/**
 * Transport-neutral request/response DTOs — the "port" that both the pure API
 * handlers (application layer) and the Node http adapter (server.ts) speak.
 *
 * Keeping these free of any Node http types is what lets the handlers be unit
 * tested with plain objects, no sockets.
 */

export interface ApiRequest {
  method: string;
  path: string;
  /** header names are lowercased by the adapter. */
  headers: Record<string, string | undefined>;
  /** parsed JSON body, or undefined. */
  body: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export type ApiHandler = (req: ApiRequest) => ApiResponse | Promise<ApiResponse>;

/** Minimal logging port; inject a no-op in tests. */
export interface Logger {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};
