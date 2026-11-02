import { createServer } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ApiError, openProvisioner } from './provisioner.js';

async function main() {
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error('configuration'); return value; };
  const token = (await readFile(required('GENESIS_ADMIN_KEY_FILE'), 'utf8')).trim();
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('configuration');
  const provisioner = await openProvisioner({ root: required('GENESIS_DATA_ROOT'), image: required('GENESIS_AGENT_IMAGE'), namespace: required('GENESIS_NAMESPACE'), modelUrl: required('GENESIS_MODEL_URL'), modelKeyFile: required('GENESIS_MODEL_KEY_FILE'), templateKeyFile: process.env.GENESIS_TEMPLATE_KEY_FILE, log: (event, fields) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), severity: 'info', event, ...fields })) });
  const server = createServer(async (req, res) => {
    const correlationId = randomUUID();
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      if (req.method === 'GET' && req.url === '/health/ready') return json(200, { status: 'ready' });
      const expected = Buffer.from(`Bearer ${token}`), supplied = Buffer.from(req.headers.authorization ?? '');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new ApiError(401, 'unauthorized');
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/v1/agents') return json(200, provisioner.list(Number(url.searchParams.get('limit') ?? 50), url.searchParams.get('cursor') ?? ''));
      const route = /^\/v1\/agents\/([a-f0-9-]{36})(?:\/(start|stop))?$/.exec(url.pathname);
      if (req.method === 'GET' && route && !route[2]) return json(200, provisioner.inspect(route[1]));
      if (req.method !== 'POST' || (url.pathname !== '/v1/agents' && !route?.[2])) throw new ApiError(404, 'not_found');
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw new ApiError(400, 'invalid_content_type');
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 32768) throw new ApiError(413, 'body_limit'); chunks.push(Buffer.from(chunk)); }
      let body; try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw new ApiError(400, 'invalid_json'); }
      if (route?.[2]) {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new ApiError(400, 'invalid_input');
        return json(202, provisioner.lifecycle(route[1], route[2] === 'start' ? 'ready' : 'stopped'));
      }
      const result = provisioner.create(body); return json(result.existing ? 200 : 202, result.agent);
    } catch (error) { req.resume(); json(error instanceof ApiError ? error.status : 503, { error: { code: error instanceof ApiError ? error.code : 'unavailable', correlationId } }); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 5000;
  server.listen(8081, '0.0.0.0', () => console.log(JSON.stringify({ event: 'provisioner_listening' })));
  let closing = false;
  const close = async () => { if (closing) return; closing = true; server.close(); server.closeAllConnections(); await provisioner.close(); };
  process.once('SIGTERM', () => { void close(); }); process.once('SIGINT', () => { void close(); });
}
void main().catch(() => { console.error(JSON.stringify({ event: 'provisioner_startup_failed' })); process.exitCode = 1; });
