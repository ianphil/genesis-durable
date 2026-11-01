import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { openRuntime, context, memoryFiles } from '../src/runtime.js';

test('SQLite reopen preserves root, answer and request deduplication; read is confined', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gd-runtime-'));
  const workspace = join(dir, 'mind');
  await mkdir(join(workspace, '.working-memory'), { recursive: true });
  for (const file of ['SOUL.md', 'AGENT.md', ...memoryFiles]) await writeFile(join(workspace, file), 'Synthetic mind: amber otter.');
  const faux = fauxProvider();
  const models = createModels(); models.setProvider(faux.provider);
  const options = { workspace, database: join(dir, 'state.sqlite'), models,
    model: { provider: faux.provider.id, modelId: faux.getModel().id } };
  let runtime: Awaited<ReturnType<typeof openRuntime>> | undefined;
  try {
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('read', { path: memoryFiles[0] }), { stopReason: 'toolUse' }),
      (transcript) => {
        assert.match(JSON.stringify(transcript), /amber otter/);
        return fauxAssistantMessage('amber otter');
      },
    ]);
    runtime = await openRuntime(options);
    const id = runtime.root.id;
    const first = await runtime.root.submit({ type: 'input', content: 'Read memory', requestId: 'one' }, context);
    const settled = await first.wait(context);
    assert.equal(settled.status, 'done');
    await runtime.close(); runtime = undefined;
    runtime = await openRuntime(options);
    assert.deepEqual(runtime.root.id, id);
    const duplicate = await runtime.root.submit({ type: 'input', content: 'Read memory', requestId: 'one' }, context);
    assert.deepEqual(duplicate.id, first.id);
    assert.deepEqual(await duplicate.wait(context), settled);
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('read', { path: '../state.sqlite' }), { stopReason: 'toolUse' }),
      (transcript) => {
        assert.match(JSON.stringify(transcript), /read_denied/);
        return fauxAssistantMessage('denied');
      },
    ]);
    assert.equal((await (await runtime.root.submit({ type: 'input', content: 'Try outside' }, context)).wait(context)).status, 'done');
  } finally { await runtime?.close(); await rm(dir, { recursive: true, force: true }); }
});
