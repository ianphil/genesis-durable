import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import Docker from 'dockerode';
import { openProvisioner } from '../src/provisioner.js';
const id = '11111111-1111-4111-8111-111111111111';
test('restart adopts only labeled owned container, preserves stop intent, retries failed start', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gd-reconcile-'));
  const config = { root, image: `sha256:${'a'.repeat(64)}`, namespace: 'test', modelUrl: 'http://localhost/v1', modelKeyFile: '/missing' };
  let running = false, foreign = false, starts = 0, stops = 0, fail = false;
  const container = {
    inspect: async () => ({ Config: { Labels: { 'genesis.namespace': foreign ? 'unrelated' : 'test', 'genesis.agent': id } }, State: { Running: running, Health: { Status: 'healthy' } } }),
    start: async () => { starts++; if (fail) throw Error('private-error'); running = true; },
    stop: async () => { stops++; running = false; },
  };
  const docker = { getContainer: () => container } as unknown as Docker;
  let p = await openProvisioner(config, docker); await p.close();
  const db = new Database(join(root, 'provisioning.sqlite'));
  const now = new Date().toISOString();
  db.prepare('INSERT INTO agents (id,request,hash,name,character,purpose,state,stage,desired,failure,image,revision,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, id, 'hash', 'fixture', 'private-character', 'private-purpose', 'creating', 'runtime', 'ready', null, config.image, 'a'.repeat(40), now, now);
  db.close();
  try {
    p = await openProvisioner(config, docker); await p.close();
    assert.equal(starts, 1); assert.equal(running, true);
    p = await openProvisioner(config, docker); await new Promise(resolve => setTimeout(resolve, 10));
    p.lifecycle(id, 'stopped'); await p.close(); assert.equal(stops, 1);
    p = await openProvisioner(config, docker); await p.close(); assert.equal(starts, 1);
    fail = true;
    p = await openProvisioner(config, docker); await new Promise(resolve => setTimeout(resolve, 10));
    p.lifecycle(id, 'ready'); await p.close();
    p = await openProvisioner(config, docker); assert.equal(p.inspect(id).state, 'failed');
    fail = false; p.lifecycle(id, 'ready'); await p.close(); assert.equal(running, true);
    foreign = true;
    p = await openProvisioner(config, docker); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(p.inspect(id).failure?.code, 'container_not_owned');
    assert.ok(!JSON.stringify(p.list()).includes('private-character'));
    await p.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
