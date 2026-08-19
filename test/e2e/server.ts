import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

export interface RunningTestPageServer {
  url: string;
  close(): Promise<void>;
}

export async function startTestPageServer(rootDir: string): Promise<RunningTestPageServer> {
  const index = readFileSync(join(rootDir, 'index.html'));
  const server = http.createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path !== '/' && path !== '/index.html') {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': index.byteLength,
      'cache-control': 'no-store',
    });
    if (request.method === 'HEAD') response.end();
    else response.end(index);
  });

  const address = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address() as AddressInfo));
  });

  return {
    url: `http://localhost:${address.port}/`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
