import { createServer, request } from 'node:http';

// Fixed DB-owned targets only: this is an HTTP proxy, not an A2A implementation.
// Listener authenticates all card/protocol requests. No credentials in proxy logs.
export function ingress(route: (id: string) => { host: string; port: number }) {
  const server = createServer((req, res) => {
    const match = /^\/agents\/([a-f0-9-]{36})(\/.*)?(?:\?.*)?$/.exec(req.url ?? '');
    if (!match) { req.resume(); res.writeHead(404); res.end(); return; }
    let target;
    try { target = route(match[1]); } catch { req.resume(); res.writeHead(404); res.end(); return; }
    const headers = { ...req.headers }; delete headers.host;
    const upstream = request({ hostname: target.host, port: target.port, method: req.method, path: (match[2] ?? '/') + (req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''), headers }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    // Disconnect ends the HTTP exchange, not accepted Durable work.
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  server.headersTimeout = 5000; server.requestTimeout = 10000;
  return server;
}
