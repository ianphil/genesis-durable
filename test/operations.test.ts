import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import type { Storage } from '@earendil-works/pi-durable';
import { openRuntime, context, memoryFiles } from '../src/runtime.js';

test('bounded compaction retains transcript and mind; cold backup restores conversation', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gd-operations-'));
  const workspace = join(dir, 'mind');
  await mkdir(join(workspace, '.working-memory'), { recursive: true });
  for (const p of ['SOUL.md', 'AGENT.md', ...memoryFiles]) await writeFile(join(workspace, p), 'Canonical memory sentinel: moss-812');
  const faux = fauxProvider({ models: [{ id: 'ops', contextWindow: 8192, maxTokens: 512 }] });
  const models = createModels(); models.setProvider(faux.provider);
  const logs: unknown[] = [];
  const options = { workspace, database: join(dir, 'state.sqlite'), models, model: { provider: faux.provider.id, modelId: 'ops' }, compaction: { enabled: false, reserveTokens: 512, keepRecentTokens: 100, backgroundTokens: 0 }, log: (event: string, fields?: unknown) => logs.push({ event, fields }) };
  let runtime: Awaited<ReturnType<typeof openRuntime>> | undefined;
  try {
    runtime = await openRuntime(options);
    const rootId = runtime.root.id;
    for (let i = 0; i < 6; i++) {
      faux.setResponses([fauxAssistantMessage(`Historical answer ${i}: ` + 'synthetic context '.repeat(60))]);
      assert.equal((await(await runtime.root.submit({ type: 'input', content: `Private prompt ${i}: ` + 'fixture '.repeat(60), requestId: `ops-${i}` }, context)).wait(context)).status, 'done');
    }
    faux.setResponses([fauxAssistantMessage('Summary: synthetic historical discussion; canonical files remain authoritative.')]);
    const task = await runtime.root.compact(undefined, context);
    const receipt = await runtime.harness.waitForTask(task, context);
    assert.equal(receipt.state.status, 'terminal');
    if (receipt.state.status === 'terminal') assert.equal(receipt.state.outcome.status, 'completed');
    // Summary placement may be a write submission; wait through the supported receipt.
    if (receipt.state.status === 'terminal' && receipt.state.outcome.status === 'completed') {
      const result = receipt.state.outcome.result as { submissionId?: Parameters<typeof runtime.harness.submission>[0] };
      if (result.submissionId) await (await runtime.harness.submission(result.submissionId, context))!.wait(context);
    }
    const entries = await runtime.root.commit(tx => tx.scanEntries({ conversationId: runtime!.root.id, order: 'ascending' }, 100), context);
    assert.ok(entries.items.some(e => e.kind === 'pi.compaction'));
    assert.match(JSON.stringify(entries), /Historical answer 0/);
    await runtime.close(); runtime = undefined;
    await cp(dir, dir + '-backup', { recursive: true });
    runtime = await openRuntime({ ...options, workspace: join(dir + '-backup', 'mind'), database: join(dir + '-backup', 'state.sqlite') });
    assert.deepEqual(runtime.root.id, rootId);
    const previous = await runtime.root.submit({ type: 'input', content: 'ignored on dedupe', requestId: 'ops-0' }, context);
    assert.equal((await previous.wait(context)).status, 'done');
    for (const p of memoryFiles) assert.equal(await readFile(join(workspace, p), 'utf8'), 'Canonical memory sentinel: moss-812');
    faux.setResponses([fauxAssistantMessage(fauxToolCall('read', { path: memoryFiles[0] }), { stopReason: 'toolUse' }), fauxAssistantMessage('moss-812')]);
    assert.equal((await(await runtime.root.submit({ type: 'input', content: 'Read canonical memory after restore' }, context)).wait(context)).status, 'done');
    assert.ok(!JSON.stringify(logs).includes('Private prompt'));
    assert.ok(!JSON.stringify(logs).includes('moss-812'));
  } finally { await runtime?.close(); await rm(dir, { recursive: true, force: true }); await rm(dir + '-backup', { recursive: true, force: true }); }
});

test('mid-run storage commit failure closes harness and reports only safe category', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gd-iofail-'));
  const workspace = join(dir, 'mind');
  await mkdir(join(workspace, '.working-memory'), { recursive: true });
  for (const p of ['SOUL.md', 'AGENT.md', ...memoryFiles]) await writeFile(join(workspace, p), 'Synthetic fixture');
  const backend = await openNodeSqliteStorage(join(dir, 'state.sqlite'));
  let fail = false;
  const storage = new Proxy(backend, { get(target, key) {
    if (key === 'commit') return async (...args: Parameters<Storage['commit']>) => { if (fail) throw Error('SENTINEL_IO_PRIVATE'); return target.commit(...args); };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  const logs: unknown[] = [];
  const runtime = await openRuntime({ workspace, database: '', storage, models, model: { provider: faux.provider.id, modelId: faux.getModel().id }, log: (event, fields) => logs.push({ event, fields }) });
  try {
    fail = true;
    await assert.rejects(runtime.root.submit({ type: 'input', content: 'PRIVATE_INPUT' }, context));
    const end = await runtime.harness.closed;
    assert.equal(end.reason, 'failed');
    assert.match(JSON.stringify(logs), /session_failed/);
    assert.ok(!JSON.stringify(logs).includes('SENTINEL_IO_PRIVATE'));
    assert.ok(!JSON.stringify(logs).includes('PRIVATE_INPUT'));
  } finally { await runtime.close(); await rm(dir, { recursive: true, force: true }); }
});

test('storage open failure rejects; outside symlink cannot be read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gd-failure-'));
  const workspace = join(dir, 'mind'); await mkdir(join(workspace, '.working-memory'), { recursive: true });
  for (const p of ['SOUL.md', 'AGENT.md', ...memoryFiles]) await writeFile(join(workspace, p), 'Safe fixture');
  await writeFile(join(dir, 'private'), 'sentinel-secret'); await symlink(join(dir, 'private'), join(workspace, 'escape'));
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  const options = { workspace, database: workspace, models, model: { provider: faux.provider.id, modelId: faux.getModel().id } };
  try {
    await assert.rejects(openRuntime(options));
    const runtime = await openRuntime({ ...options, database: join(dir, 'valid.sqlite') });
    try {
      faux.setResponses([fauxAssistantMessage(fauxToolCall('read', { path: 'escape' }), { stopReason: 'toolUse' }), transcript => {
        assert.match(JSON.stringify(transcript), /read_denied/); assert.ok(!JSON.stringify(transcript).includes('sentinel-secret')); return fauxAssistantMessage('Denied');
      }]);
      await(await runtime.root.submit({ type: 'input', content: 'Read escape' }, context)).wait(context);
    } finally { await runtime.close(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
