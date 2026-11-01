// Run inside the built image with synthetic mind, persistent state and private key mount.
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { openRuntime, context } from '../dist/src/runtime.js';
import { runtimeModels, defaultModel } from '../dist/src/model.js';
const mode = process.argv[2];
const models = await runtimeModels(process.env.GENESIS_MODEL_URL, '/run/secrets/model');
const runtime = await openRuntime({ workspace: '/workspace', database: '/state/durable.sqlite', models, model: defaultModel });
try {
  const id = String(runtime.root.id);
  if (mode === 'first') {
    const submission = await runtime.root.submit({ type: 'input', requestId: 'live-one', content: 'Read SOUL.md, .working-memory/memory.md, .working-memory/rules.md and .working-memory/log.md using read. Report the identity named in SOUL.md and the fixture word. Remember the conversation token: silver-kestrel-927. Keep your answer short.' }, context);
    assert.equal((await submission.wait(context)).status, 'done');
    const entries = await runtime.root.commit(tx => tx.scanEntries({ conversationId: runtime.root.id, order: 'ascending' }, 100), context);
    const serialized = JSON.stringify(entries);
    assert.match(serialized, /copper-orchid-814/);
    const reads = entries.items.filter(e => e.kind === 'pi.tool-result');
    assert.ok(reads.length >= 3, 'real model must read all three memory files');
    await writeFile('/state/evidence.json', JSON.stringify({ root: id, submission: String(submission.id), reads: reads.length }));
    console.log(JSON.stringify({ passed: mode, root: id, reads: reads.length }));
  } else if (mode === 'admit') {
    const submission = await runtime.root.submit({ type: 'input', requestId: 'kill-one', content: 'Read all memory files and write a short greeting.' }, context);
    await writeFile('/state/admitted.json', JSON.stringify({ id: String(submission.id) }));
    console.log('ADMITTED');
    await new Promise(() => {});
  } else {
    const evidence = JSON.parse(await readFile('/state/evidence.json', 'utf8'));
    assert.equal(id, evidence.root);
    const duplicate = await runtime.root.submit({ type: 'input', requestId: 'live-one', content: 'Read SOUL.md, .working-memory/memory.md, .working-memory/rules.md and .working-memory/log.md using read. Report the identity named in SOUL.md and the fixture word. Remember the conversation token: silver-kestrel-927. Keep your answer short.' }, context);
    assert.equal(String(duplicate.id), evidence.submission);
    assert.equal((await duplicate.wait(context)).status, 'done');
    if (mode === 'recover') {
      const submission = await runtime.root.submit({ type: 'input', requestId: 'kill-one', content: 'Read all memory files and write a short greeting.' }, context);
      assert.equal(String(submission.id), JSON.parse(await readFile('/state/admitted.json', 'utf8')).id);
      assert.equal((await submission.wait(context)).status, 'done');
    }
    const next = await runtime.root.submit({ type: 'input', content: 'What conversation token did I ask you to remember? Reply only with that token.' }, context);
    const settled = await next.wait(context);
    assert.equal(settled.status, 'done');
    const entries = await runtime.root.commit(tx => tx.scanEntries({ conversationId: runtime.root.id }, 10), context);
    assert.match(JSON.stringify(entries.items[0]), /silver-kestrel-927/);
    console.log(JSON.stringify({ passed: mode, root: id }));
  }
} finally { await runtime.close(); }
