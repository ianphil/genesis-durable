import { createServer } from 'node:http';
import { runtimeModels, defaultModel } from './model.js';
import { openRuntime } from './runtime.js';

const log = (event: string, fields: Record<string, string> = {}) =>
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), severity: 'info', event, ...fields }));
let ready = false;
const server = createServer((request, response) => {
  const live = request.url === '/health/live';
  const readiness = request.url === '/health/ready';
  response.writeHead(live || (readiness && ready) ? 200 : readiness ? 503 : 404,
    { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status: live ? 'alive' : readiness && ready ? 'ready' : 'unavailable' }));
});
async function main() {
  const workspace = process.env.GENESIS_WORKSPACE ?? '/workspace';
  const database = process.env.GENESIS_DATABASE ?? '/state/durable.sqlite';
  const endpoint = process.env.GENESIS_MODEL_URL;
  const keyFile = process.env.GENESIS_MODEL_KEY_FILE;
  if (!endpoint || !keyFile) throw new Error('model_configuration');
  const models = await runtimeModels(endpoint, keyFile);
  const runtime = await openRuntime({ workspace, database, models, model: defaultModel, log });
  server.listen(8080, '0.0.0.0', () => { ready = true; log('listener_ready'); });
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true; ready = false;
    server.close();
    await runtime.close();
  };
  process.once('SIGTERM', () => { void stop().catch(() => { process.exitCode = 1; }); });
  process.once('SIGINT', () => { void stop().catch(() => { process.exitCode = 1; }); });
  void runtime.harness.closed.then((end) => {
    ready = false;
    if (end.reason === 'failed') { log('storage_failed'); server.close(); process.exitCode = 1; }
  });
}
void main().catch(() => { log('startup_failed'); server.close(); process.exitCode = 1; });
