import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModels } from '@earendil-works/pi-ai/models';
import { bootstrap, mindPaths, validateMind } from '../src/bootstrap.js';

const input = { name: 'juniper', character: 'Warm and concise', purpose: 'Help plan projects' };
const files = Object.fromEntries(mindPaths.map(p => [p, p === 'mind-index.md' ? mindPaths.slice(0, 5).join('\n') : '# Synthetic mind']));
const template = { revision: 'a'.repeat(40), files: {} };
test('fixed-path validation rejects traversal, incomplete output and unavailable capabilities', () => {
  assert.deepEqual(validateMind(files), files);
  assert.throws(() => validateMind({ ...files, '../escape': 'bad' }));
  assert.throws(() => validateMind({}));
  assert.throws(() => validateMind({ ...files, 'AGENT.md': 'Run git push' }));
  assert.throws(() => validateMind({ ...files, 'SOUL.md': 'Each session you wake fresh.' }), /mind_persistence_invalid/);
  assert.throws(() => validateMind({ ...files, 'mind-index.md': 'missing links' }));
});
test('bootstrap publishes no Git, preserves evolved mind on retry and rejects conflicts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gd-bootstrap-'));
  const options = { agentDirectory: dir, input, models: createModels(), fetch: async () => template, generate: async () => files };
  try {
    const result = await bootstrap(options);
    assert.equal(result.reused, false);
    assert.ok(!(await readdir(result.workspace)).includes('.git'));
    await writeFile(join(result.workspace, 'SOUL.md'), 'Evolved mind');
    const retry = await bootstrap({ ...options, generate: async () => { throw Error('must not run'); } });
    assert.equal(retry.reused, true);
    assert.equal(await readFile(join(result.workspace, 'SOUL.md'), 'utf8'), 'Evolved mind');
    await assert.rejects(bootstrap({ ...options, input: { ...input, purpose: 'changed' } }), /bootstrap_conflict/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('failed or interrupted generation stays inspectable, safe and unpublished', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gd-bootstrap-'));
  const options = { agentDirectory: dir, input, models: createModels(), fetch: async () => template, generate: async () => { throw Error('sentinel-private-provider-content'); } };
  try {
    await assert.rejects(bootstrap(options), /^Error: bootstrap_failed$/);
    const status = await readFile(join(dir, 'bootstrap-staging/status.json'), 'utf8');
    assert.ok(!status.includes('sentinel'));
    assert.ok(!(await readdir(dir)).includes('workspace'));
    await assert.rejects(bootstrap(options), /bootstrap_incomplete_or_busy/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
