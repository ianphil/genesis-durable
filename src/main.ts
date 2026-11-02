import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { openA2A } from './a2a.js';
import { a2aHttp } from './a2a-http.js';
import { runtimeModels, defaultModel } from './model.js';
import { openRuntime } from './runtime.js';

const log = (event: string, fields: Record<string, string> = {}) =>
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), severity: 'info', event, ...fields }));

async function main() {
  const workspace = process.env.GENESIS_WORKSPACE ?? '/workspace';
  const database = process.env.GENESIS_DATABASE ?? '/state/durable.sqlite';
  const endpoint = process.env.GENESIS_MODEL_URL;
  const keyFile = process.env.GENESIS_MODEL_KEY_FILE;
  if (!endpoint || !keyFile) throw new Error('model_configuration');
  const models = await runtimeModels(endpoint, keyFile);
  const agentId = process.env.GENESIS_AGENT_ID;
  const agentLog = (event: string, fields: Record<string, string> = {}) => log(event, { ...(agentId ? { agentId } : {}), ...fields });
  const runtime = await openRuntime({ workspace, database, models, model: defaultModel, agentId, log: agentLog });
  const tokenFile = process.env.GENESIS_LISTENER_KEY_FILE;
  if (!tokenFile) { await runtime.close(); throw new Error('listener_configuration'); }
  const bridge = await openA2A({ runtime, database: join(dirname(database), 'a2a.sqlite'),
    name: process.env.GENESIS_NAME ?? 'genesis', url: process.env.GENESIS_A2A_URL ?? 'http://127.0.0.1:8080/a2a', log: agentLog });
  const http = a2aHttp(bridge, (await readFile(tokenFile, 'utf8')).trim());
  http.server.listen(8080, '0.0.0.0', () => log('listener_ready'));
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    await http.close();
  };
  process.once('SIGTERM', () => { void stop().catch(() => { process.exitCode = 1; }); });
  process.once('SIGINT', () => { void stop().catch(() => { process.exitCode = 1; }); });
  void runtime.harness.closed.then((end) => {
    if (end.reason === 'failed') { log('storage_failed'); void http.close(); process.exitCode = 1; }
  });
}
void main().catch(() => { log('startup_failed'); process.exitCode = 1; });
