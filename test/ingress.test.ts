import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ingress } from '../src/ingress.js';
test('ingress routes only known UUID targets, preserves auth/path without protocol rewriting', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const backend = createServer((req, res) => { res.end(JSON.stringify({ path: req.url, auth: req.headers.authorization })); });
  await new Promise<void>(r => backend.listen(0, '127.0.0.1', r));
  const proxy = ingress(value => { if (value !== id) throw Error(); return { host: '127.0.0.1', port: (backend.address() as { port: number }).port }; });
  await new Promise<void>(r => proxy.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  try {
    const result = await (await fetch(`${base}/agents/${id}/a2a`, { headers: { Authorization: 'Bearer fixture' } })).json();
    assert.deepEqual(result, { path: '/a2a', auth: 'Bearer fixture' });
    assert.equal((await fetch(`${base}/agents/not-an-id/a2a`)).status, 404);
  } finally { proxy.closeAllConnections(); backend.closeAllConnections(); await Promise.all([new Promise<void>(r => proxy.close(() => r())), new Promise<void>(r => backend.close(() => r()))]); }
});
