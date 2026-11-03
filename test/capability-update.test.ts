import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import Docker from 'dockerode';
import { openProvisioner } from '../src/provisioner.js';

const id = '11111111-1111-4111-8111-111111111111';
test('updates reject legacy running images and unsupported targets without altering active policy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gd-update-'));
  const image = `sha256:${'a'.repeat(64)}`;
  let supported = false;
  const container = { inspect: async () => ({ Config: { Labels: { 'genesis.namespace': 'test', 'genesis.agent': id } }, State: { Running: true, Health: { Status: 'healthy' } } }) };
  const docker = { getContainer: () => container, getImage: () => ({ inspect: async () => ({ Config: { Labels: supported ? { 'io.genesis.capabilities': '1' } : {} } }) }) } as unknown as Docker;
  const config = { root, image, namespace: 'test', modelUrl: 'http://localhost/v1', modelKeyFile: '/missing' };
  let p = await openProvisioner(config, docker); await p.close();
  const db = new Database(join(root, 'provisioning.sqlite'));
  db.prepare('INSERT INTO agents (id,request,hash,name,character,purpose,state,stage,desired,image,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, id, 'hash', 'fixture', 'a', 'b', 'failed', 'failed', 'ready', image, '', '');
  db.close();
  try {
    p = await openProvisioner(config, docker);
    await assert.rejects(p.setCapabilities(id, { capabilities: ['coding'] }), /legacy_agent_must_be_stopped/);
    assert.deepEqual(p.inspect(id).capabilities, ['read']);
    await assert.rejects(p.setCapabilities(id, { capabilities: ['unknown'] }), /invalid_capabilities/);
    await assert.rejects(p.setCapabilities(id, { capabilities: [], image }), /invalid_input/);
    supported = true;
    // Drain cannot reach this synthetic container; desired changes but active does not.
    await p.setCapabilities(id, { capabilities: [] });
    assert.deepEqual(p.inspect(id).capabilities, []);
    assert.deepEqual(p.inspect(id).activeCapabilities, ['read']);
    await p.close();
    p = await openProvisioner(config, docker);
    assert.equal(p.inspect(id).state, 'failed');
    assert.deepEqual(p.inspect(id).activeCapabilities, ['read']);
  } finally { await p.close(); await rm(root, { recursive: true, force: true }); }
});
