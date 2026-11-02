// Opt-in: mounted into the image; use only an isolated cold copy of an agent.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openRuntime, context, memoryFiles } from '../dist/src/runtime.js';
import { runtimeModels, defaultModel } from '../dist/src/model.js';
const paths = ['SOUL.md', 'AGENT.md', ...memoryFiles, 'mind-index.md'];
const hashes = async () => Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash('sha256').update(await readFile('/workspace/' + p)).digest('hex')])));
const before = await hashes();
const models = await runtimeModels(process.env.GENESIS_MODEL_URL, '/run/secrets/model');
const runtime = await openRuntime({ workspace: '/workspace', database: '/state/durable.sqlite', models, model: defaultModel,
  compaction: { enabled: false, reserveTokens: 8192, keepRecentTokens: 100, backgroundTokens: 0 } });
try {
  const original = await runtime.root.commit(tx => tx.scanEntries({ conversationId: runtime.root.id, order: 'ascending' }, 1000), context);
  assert.ok(original.items.length > 10);
  const compact = await runtime.root.compact('Preserve the agent role, garden project code and conversation tokens exactly where present. Do not invent memory.', context);
  const receipt = await runtime.harness.waitForTask(compact, context);
  assert.equal(receipt.state.status, 'terminal');
  assert.equal(receipt.state.outcome.status, 'completed');
  const result = receipt.state.outcome.result;
  if (result.submissionId) await (await runtime.harness.submission(result.submissionId, context)).wait(context);
  const entries = await runtime.root.commit(tx => tx.scanEntries({ conversationId: runtime.root.id, order: 'ascending' }, 1000), context);
  assert.ok(entries.items.some(e => e.kind === 'pi.compaction'));
  assert.ok(original.items.every(e => entries.items.some(n => n.id === e.id)), 'all original entries retained');
  const submission = await runtime.root.submit({ type: 'input', requestId: 'acceptance8-postcompact', content: 'Read SOUL.md and .working-memory/memory.md. Playing your configured role, introduce yourself, give the garden project code, and recall the earlier moss-lark conversation token if it is in your context. Do not modify files.' }, context);
  assert.equal((await submission.wait(context)).status, 'done');
  const latest = await runtime.root.commit(tx => tx.scanEntries({ conversationId: runtime.root.id }, 10), context);
  const answer = latest.items.find(e => e.kind === 'pi.assistant');
  const serialized = JSON.stringify(answer);
  assert.match(serialized, /iris-682/); assert.match(serialized, /Juniper/); assert.match(serialized, /moss-lark-413/);
  assert.deepEqual(await hashes(), before);
  await writeFile('/state/acceptance8.json', JSON.stringify({ originalEntries: original.items.length, compactedEntries: entries.items.length, conversationId: String(runtime.root.id), answer: answer.model }), { mode: 0o600 });
  console.log(JSON.stringify({ passed: 'real-model compaction on cold-restored copy', originalEntries: original.items.length, conversationId: String(runtime.root.id), mindUnchanged: true }));
} finally { await runtime.close(); }
