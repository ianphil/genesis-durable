import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { AgentCard } from '@a2a-js/sdk';
import { JsonRpcTransportHandler, ServerCallContext } from '@a2a-js/sdk/server';
import type { openA2A } from './a2a.js';

export function a2aHttp(bridge: Awaited<ReturnType<typeof openA2A>>, token: string) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('listener_token_invalid');
  let ready = true;
  const server = createServer(async (req, res) => {
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (req.method === 'GET' && req.url === '/health/live') return json(200, { status: 'alive' });
    if (req.method === 'GET' && req.url === '/health/ready') return json(ready ? 200 : 503, { status: ready ? 'ready' : 'unavailable' });
    const expected = Buffer.from(`Bearer ${token}`), supplied = Buffer.from(req.headers.authorization ?? '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) { req.resume(); return json(401, { error: 'Unauthorized' }); }
    if (req.method === 'GET' && req.url === '/.well-known/agent-card.json') return json(200, AgentCard.toJSON(bridge.card));
    if (!ready) { req.resume(); return json(503, { error: 'Unavailable' }); }
    if (req.method !== 'POST' || req.url !== '/a2a') { req.resume(); return json(404, { error: 'Not found' }); }
    if (!/^application\/(?:a2a\+)?json(?:;|$)/i.test(req.headers['content-type'] ?? '')) { req.resume(); return json(415, { error: 'Content type' }); }
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 32768) { req.resume(); return json(413, { error: 'Request too large' }); } chunks.push(Buffer.from(chunk)); }
      const result = await new JsonRpcTransportHandler(bridge.handler).handle(Buffer.concat(chunks).toString('utf8'), new ServerCallContext({ requestedVersion: typeof req.headers['a2a-version'] === 'string' ? req.headers['a2a-version'] : '' }));
      if (Symbol.asyncIterator in result) return json(400, { error: 'Streaming unsupported' });
      if (!res.destroyed) json(200, result);
    } catch { if (!res.destroyed) json(500, { error: 'Request failed' }); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 5000;
  return { server, async close() {
    ready = false; server.close(); server.closeAllConnections(); await bridge.close();
  } };
}
