import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createPwaApiFixture } from './pwaApiFixture';

const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

/** Native HTTP is required: page.route cannot stand in for SW install/precache traffic. */
export async function startPwaReleaseServer(previous: string, current: string, options: { retryAfterSeconds?: number; unauthenticated?: boolean; familyPutDelayMs?: number; retryFamilyPutDelayMs?: number; conflictFirstFamilyPut?: boolean; stateUnavailable?: boolean; currentStateUnavailable?: boolean;
  cacheControl?: string;
  bfcacheProbePath?: string;
  profileGetGate?: { shouldHold: () => boolean; started: () => void; wait: Promise<void> } } = {}) {
  let directory = resolve(previous);
  const api = createPwaApiFixture(options);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (options.bfcacheProbePath && url.pathname === options.bfcacheProbePath && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': options.cacheControl ?? 'no-store' });
      response.end('<!doctype html><html><head><title>BFCache probe</title></head><body>BFCache probe</body></html>');
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      try { await api.respond(request, response, url); }
      catch {
        api.unexpectedApi.push(`HANDLER_ERROR:${url.pathname}`);
        if (!response.headersSent) response.writeHead(500);
        response.end();
      }
      return;
    }
    const path = resolve(directory, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(directory + sep)) { response.writeHead(403); response.end(); return; }
    try {
      if (!(await stat(path)).isFile()) throw new Error('not a file');
      response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': options.cacheControl ?? 'no-store', 'Service-Worker-Allowed': '/' });
      response.end(await readFile(path));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No PWA fixture address');
  return { origin: `http://127.0.0.1:${address.port}`, unexpectedApi: api.unexpectedApi, counts: api.counts,
    stateWriteKeys: api.stateWriteKeys, stateWriteItems: api.stateWriteItems,
    pushRequests: api.pushRequests, setActiveSessionId: api.setActiveSessionId,
    setStateWriteDisconnected: api.setStateWriteDisconnected,
    release: () => { directory = resolve(current); },
    rollback: () => { directory = resolve(previous); },
    recoverState: api.recoverState,
    recoverCurrentState: api.recoverCurrentState,
    recover: api.recover,
    close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }),
  };
}
