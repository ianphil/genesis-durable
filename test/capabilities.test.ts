import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capabilities, capabilityTools } from '../src/capabilities.js';
import { validateCreate } from '../src/provisioner.js';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { openRuntime, context, memoryFiles } from '../src/runtime.js';

test('capability arrays normalize, compose and validate', () => {
  assert.deepEqual(capabilities(), ['read']);
  assert.deepEqual(capabilities(['workspace', 'read', 'workspace']), ['read', 'workspace']);
  assert.deepEqual(capabilityTools(['coding', 'read']), ['read', 'write', 'edit', 'bash']);
  assert.deepEqual(capabilityTools([]), []);
  for (const value of ['coding', null, ['fleet-a2a'], [false]]) assert.throws(() => capabilities(value));
  const input = { requestId: '11111111-1111-4111-8111-111111111111', name: 'test', character: 'a', purpose: 'b' };
  assert.deepEqual(validateCreate(input).capabilities, ['read']);
  assert.deepEqual(validateCreate({ ...input, capabilities: [] }).capabilities, []);
});

test('workspace tools write/edit with boundaries; reopen changes selection without changing conversation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gd-capabilities-'));
  const workspace = join(dir, 'mind');
  await mkdir(join(workspace, '.working-memory'), { recursive: true });
  for (const file of ['SOUL.md', 'AGENT.md', ...memoryFiles]) await writeFile(join(workspace, file), 'Synthetic mind.');
  await symlink(dir, join(workspace, 'escape'));
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  const options = { workspace, database: join(dir, 'state.sqlite'), models, model: { provider: faux.provider.id, modelId: faux.getModel().id } };
  let runtime: Awaited<ReturnType<typeof openRuntime>> | undefined;
  try {
    runtime = await openRuntime({ ...options, capabilities: ['workspace'] });
    const id = runtime.root.id;
    for (const [tool, args] of [
      ['write', { path: 'notes/new.md', content: 'first' }],
      ['edit', { path: 'notes/new.md', edits: [{ oldText: 'first', newText: 'second' }] }],
      ['write', { path: '../forbidden', content: 'bad' }],
      ['write', { path: 'escape/forbidden', content: 'bad' }],
    ] as const) {
      faux.setResponses([fauxAssistantMessage(fauxToolCall(tool, args), { stopReason: 'toolUse' }), fauxAssistantMessage('done')]);
      await (await runtime.root.submit({ type: 'input', content: 'test' }, context)).wait(context);
    }
    assert.equal(await readFile(join(workspace, 'notes/new.md'), 'utf8'), 'second');
    await assert.rejects(readFile(join(dir, 'forbidden')));
    await runtime.close(); runtime = await openRuntime({ ...options, capabilities: [] });
    assert.equal(runtime.root.id, id);
    assert.deepEqual((await runtime.root.agent(context)).tools, []);
    await runtime.close(); runtime = await openRuntime({ ...options, capabilities: ['coding'] });
    assert.deepEqual((await runtime.root.agent(context)).tools.map(t => t.name).sort(), ['bash', 'edit', 'read', 'write']);
    faux.setResponses([fauxAssistantMessage(fauxToolCall('bash', { command: "printf harmless > shell.txt" }), { stopReason: 'toolUse' }), fauxAssistantMessage('done')]);
    await (await runtime.root.submit({ type: 'input', content: 'shell test' }, context)).wait(context);
    assert.equal(await readFile(join(workspace, 'shell.txt'), 'utf8'), 'harmless');
  } finally { await runtime?.close(); await rm(dir, { recursive: true, force: true }); }
});
