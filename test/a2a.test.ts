import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { Message, TaskState, SendMessageRequest, ListTasksRequest, GetTaskRequest, CancelTaskRequest } from '@a2a-js/sdk';
import { ClientFactory, DefaultAgentCardResolver, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { openRuntime, memoryFiles } from '../src/runtime.js';
import { openA2A } from '../src/a2a.js';
import { a2aHttp } from '../src/a2a-http.js';

test('official SDK discovery/send/list/get, deduplication and restart lookup', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gd-a2a-'));
  const workspace = join(dir, 'mind');
  await mkdir(join(workspace, '.working-memory'), { recursive: true });
  for (const p of ['SOUL.md', 'AGENT.md', ...memoryFiles]) await writeFile(join(workspace, p), 'Synthetic fixture');
  execFileSync(process.execPath, ['node_modules/@a2a-js/sdk/dist/cli/a2a_db.js', 'upgrade', '--url', `sqlite:${dir}/a2a.sqlite`, '--store', 'tasks']);
  const faux = fauxProvider(); const models = createModels(); models.setProvider(faux.provider);
  const token = 'a'.repeat(40);
  const start = async () => {
    const runtime = await openRuntime({ workspace, database: join(dir, 'durable.sqlite'), models, model: { provider: faux.provider.id, modelId: faux.getModel().id } });
    const bridge = await openA2A({ runtime, database: join(dir, 'a2a.sqlite'), name: 'fixture', url: 'http://127.0.0.1:19876/a2a' });
    const http = a2aHttp(bridge, token);
    await new Promise<void>(resolve => http.server.listen(19876, '127.0.0.1', resolve));
    const fetchImpl: typeof fetch = (url, init) => fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Authorization: `Bearer ${token}` } });
    const client = await new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl })], cardResolver: new DefaultAgentCardResolver({ fetchImpl }) }).createFromUrl('http://127.0.0.1:19876');
    return { http, client };
  };
  let running: Awaited<ReturnType<typeof start>> | undefined;
  try {
    running = await start();
    assert.equal((await fetch('http://127.0.0.1:19876/.well-known/agent-card.json')).status, 401);
    faux.setResponses([fauxAssistantMessage('Persistent hello')]);
    const message = Message.fromJSON({ messageId: 'message-one', role: 'ROLE_USER', parts: [{ text: 'Hello' }] });
    const request = SendMessageRequest.fromJSON({ message: Message.toJSON(message) });
    const result = await running.client.sendMessage(request);
    assert.ok('id' in result); if (!('id' in result)) return;
    assert.equal(result.status?.state, TaskState.TASK_STATE_COMPLETED);
    const taskId = result.id;
    const duplicate = await running.client.sendMessage(request);
    assert.ok('id' in duplicate && duplicate.id === taskId);
    const page = await running.client.listTasks(ListTasksRequest.fromJSON({ pageSize: 1 }));
    assert.equal(page.tasks.length, 1);
    await assert.rejects(running.client.sendMessage(SendMessageRequest.fromJSON({ message: { ...Message.toJSON(message) as object, parts: [{ text: 'Changed' }] } })));
    await assert.rejects(running.client.getTask(GetTaskRequest.fromJSON({ id: taskId, tenant: 'foreign' })));
    await assert.rejects(running.client.getTask(GetTaskRequest.fromJSON({ id: 'missing' })));
    faux.setResponses([fauxAssistantMessage('Second answer')]);
    await running.client.sendMessage(SendMessageRequest.fromJSON({ message: { messageId: 'message-two', role: 'ROLE_USER', parts: [{ text: 'Second' }] } }));
    const firstPage = await running.client.listTasks(ListTasksRequest.fromJSON({ pageSize: 1 }));
    assert.ok(firstPage.nextPageToken);
    const secondPage = await running.client.listTasks(ListTasksRequest.fromJSON({ pageSize: 1, pageToken: firstPage.nextPageToken }));
    assert.equal(secondPage.tasks.length, 1);
    assert.notEqual(firstPage.tasks[0].id, secondPage.tasks[0].id);
    await running.http.close(); running = undefined;
    running = await start();
    const restored = await running.client.getTask(GetTaskRequest.fromJSON({ id: taskId }));
    assert.equal(restored.status?.state, TaskState.TASK_STATE_COMPLETED);
    assert.match(JSON.stringify(restored), /Persistent hello/);
    await assert.rejects(running.client.cancelTask(CancelTaskRequest.fromJSON({ id: taskId })));
    faux.setResponses([async () => { await new Promise(resolve => setTimeout(resolve, 300)); return fauxAssistantMessage('Late answer'); }]);
    const started = await running.client.sendMessage(SendMessageRequest.fromJSON({ message: { messageId: 'cancel-me', role: 'ROLE_USER', parts: [{ text: 'Slow work' }] }, configuration: { returnImmediately: true } }));
    assert.ok('id' in started);
    if ('id' in started) {
      const canceled = await running.client.cancelTask(CancelTaskRequest.fromJSON({ id: started.id }));
      assert.equal(canceled.status?.state, TaskState.TASK_STATE_CANCELED);
    }
    faux.setResponses([async () => { await new Promise(resolve => setTimeout(resolve, 500)); return fauxAssistantMessage('Interrupted'); }]);
    const pending = await running.client.sendMessage(SendMessageRequest.fromJSON({ message: { messageId: 'restart-pending', role: 'ROLE_USER', parts: [{ text: 'Work across restart' }] }, configuration: { returnImmediately: true } }));
    assert.ok('id' in pending);
    await running.http.close(); running = undefined;
    faux.setResponses([async () => { await new Promise(resolve => setTimeout(resolve, 300)); return fauxAssistantMessage('Recovered'); }]);
    running = await start();
    if ('id' in pending) {
      const canceled = await running.client.cancelTask(CancelTaskRequest.fromJSON({ id: pending.id }));
      assert.equal(canceled.status?.state, TaskState.TASK_STATE_CANCELED);
    }
    faux.setResponses([async () => { await new Promise(resolve => setTimeout(resolve, 200)); return fauxAssistantMessage('Survived disconnect'); }]);
    const disconnectMessage = { messageId: 'disconnect', role: 'ROLE_USER', parts: [{ text: 'Continue without caller' }] };
    const controller = new AbortController();
    const waiting = running.client.sendMessage(SendMessageRequest.fromJSON({ message: disconnectMessage }), { signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 50)); controller.abort();
    await assert.rejects(waiting);
    await new Promise(resolve => setTimeout(resolve, 350));
    const lookup = await running.client.sendMessage(SendMessageRequest.fromJSON({ message: disconnectMessage }));
    assert.ok('id' in lookup && lookup.status?.state === TaskState.TASK_STATE_COMPLETED);
    assert.match(JSON.stringify(lookup), /Survived disconnect/);
  } finally { await running?.http.close(); await rm(dir, { recursive: true, force: true }); }
});
