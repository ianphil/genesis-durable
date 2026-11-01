// Opt-in direct-container probe; credentials remain in private files, never printed.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { ClientFactory, DefaultAgentCardResolver, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { SendMessageRequest, GetTaskRequest, ListTasksRequest } from '@a2a-js/sdk';
const base = process.env.A2A_TEST_URL ?? 'http://127.0.0.1:19877';
const token = (await readFile(process.env.A2A_TEST_TOKEN_FILE, 'utf8')).trim();
const fetchImpl = (url, init) => fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Authorization: `Bearer ${token}` } });
const client = await new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl })], cardResolver: new DefaultAgentCardResolver({ fetchImpl }) }).createFromUrl(base);
const evidencePath = process.env.A2A_TEST_EVIDENCE_FILE;
if (process.argv[2] === 'first') {
  const request = SendMessageRequest.fromJSON({ message: { role: 'ROLE_USER', messageId: 'live-a2a-one', parts: [{ text: 'Read SOUL.md and .working-memory/memory.md. Playing the configured role, introduce yourself and give the garden project code. Remember conversation token violet-finch-619.' }] } });
  const task = await client.sendMessage(request);
  assert.ok('id' in task);
  assert.match(JSON.stringify(task), /marigold-739/);
  assert.match(JSON.stringify(task), /Juniper/i);
  await writeFile(evidencePath, JSON.stringify({ id: task.id, contextId: task.contextId }), { mode: 0o600 });
  console.log('PASS: live SDK send, generated identity and memory');
} else {
  const saved = JSON.parse(await readFile(evidencePath, 'utf8'));
  const task = await client.getTask(GetTaskRequest.fromJSON({ id: saved.id }));
  assert.equal(task.contextId, saved.contextId);
  assert.match(JSON.stringify(task), /marigold-739/);
  const page = await client.listTasks(ListTasksRequest.fromJSON({ pageSize: 1 }));
  assert.ok(page.tasks.some(t => t.id === saved.id));
  const answer = await client.sendMessage(SendMessageRequest.fromJSON({ message: { role: 'ROLE_USER', messageId: 'live-a2a-two', contextId: saved.contextId, parts: [{ text: 'What conversation token did I ask you to remember? Reply only with the token.' }] } }));
  assert.match(JSON.stringify(answer), /violet-finch-619/);
  console.log('PASS: replacement task/result/context lookup and conversation continuity');
}
