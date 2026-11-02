import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Docker from 'dockerode';
import { openProvisioner, validateCreate } from '../src/provisioner.js';
const input = { requestId: '11111111-1111-4111-8111-111111111111', name: 'juniper', character: 'Warm', purpose: 'Garden help' };
test('creation validates, durably deduplicates and rejects conflicts across reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gd-provisioner-'));
  const docker = { getContainer: () => ({ inspect: async () => { throw Error('sentinel-private-error'); } }) } as unknown as Docker;
  const config = { root, image: `sha256:${'a'.repeat(64)}`, namespace: 'test', modelUrl: 'http://localhost/v1', modelKeyFile: '/missing' };
  let p = await openProvisioner(config, docker);
  try {
    assert.throws(() => validateCreate({ ...input, name: '../escape' }));
    assert.throws(() => validateCreate({ ...input, model: 'arbitrary' }));
    const first = p.create(input);
    assert.equal(first.existing, false);
    assert.equal(p.create(input).agent.id, first.agent.id);
    assert.throws(() => p.create({ ...input, purpose: 'changed' }));
    assert.throws(() => p.create({ ...input, requestId: '22222222-2222-4222-8222-222222222222' }));
    await p.close();
    p = await openProvisioner(config, docker);
    assert.equal(p.create(input).agent.id, first.agent.id);
    assert.equal(p.inspect(first.agent.id).failure?.code, 'provisioning_failed');
    assert.ok(!JSON.stringify(p.list()).includes('sentinel'));
  } finally { await p.close(); await rm(root, { recursive: true, force: true }); }
});
