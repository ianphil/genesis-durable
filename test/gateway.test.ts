import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gateway, type Registration } from '../src/gateway.js';

test('gateway ownership, uncertain-create reconciliation, grants, outage and withdrawal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gd-gateway-'));
  await writeFile(join(dir, 'key'), 'private-sentinel');
  let records: any[] = [], creates = 0, outage = false, failGrant = false;
  let permissions = { agents: ['unrelated'], vector_stores: ['preserve-me'] };
  const server = createServer(async (req, res) => {
    if (outage) { res.writeHead(503); return res.end(); }
    let body = ''; for await (const chunk of req) body += chunk;
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/agents' && req.method === 'GET') return res.end(JSON.stringify(records));
    if (req.url === '/v1/agents' && req.method === 'POST') { creates++; const record = { ...JSON.parse(body), agent_id: 'owned-id' }; records.push(record); return res.end(JSON.stringify(record)); }
    if (req.url?.startsWith('/team/info')) return res.end(JSON.stringify({ team_info: { team_id: 'fleet', object_permission: permissions } }));
    if (req.url === '/team/update') { if (failGrant) { res.writeHead(503); return res.end(); } permissions = JSON.parse(body).object_permission; return res.end('{}'); }
    if (req.method === 'DELETE') { records = []; return res.end('{}'); }
    res.writeHead(404); res.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const api = gateway({ url: `http://127.0.0.1:${address.port}`, adminKeyFile: join(dir, 'key'), teamId: 'fleet', grantLockDirectory: join(dir, 'grant-lock') });
  const agent = { name: 'gd-test-juniper', listener: 'http://100.120.30.116:19900/a2a', token: 'private-runtime-token' };
  let saved: Registration | undefined;
  try {
    failGrant = true;
    await assert.rejects(api.publish(agent, undefined, value => { saved = value; }));
    assert.equal(saved?.id, 'owned-id');
    failGrant = false;
    await api.publish(agent, saved, value => { saved = value; });
    assert.equal(creates, 1);
    assert.deepEqual(permissions.agents, ['unrelated', 'owned-id']);
    assert.deepEqual(permissions.vector_stores, ['preserve-me']);
    // Crash between POST and local ownership commit: exact secret/endpoint match
    // recovers our registration, not an unrelated same-name record.
    await api.publish(agent, undefined, value => { saved = value; });
    assert.equal(creates, 1);
    await assert.rejects(api.publish({ ...agent, token: 'different' }, saved, () => {}), /gateway_name_conflict/);
    outage = true; await assert.rejects(api.publish(agent, saved, () => {})); outage = false;
    await api.withdraw(agent, saved);
    assert.equal(records.length, 0); assert.deepEqual(permissions.agents, ['unrelated']);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
