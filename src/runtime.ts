import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Models } from '@earendil-works/pi-ai/models';
import { Harness, createRegistry, defineExtension, section } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { createReadTool, type ReadToolInput } from '@earendil-works/pi-durable/tools';

export const context = BACKGROUND_CONTEXT;
export const memoryFiles = ['.working-memory/memory.md', '.working-memory/rules.md', '.working-memory/log.md'];
export type RuntimeOptions = {
  workspace: string; database: string; models: Models;
  model: { provider: string; modelId: string };
  log?: (event: string, fields?: Record<string, string>) => void;
};

export async function openRuntime(options: RuntimeOptions) {
  const workspace = await realpath(options.workspace);
  // SDK read has no path jail. Compose its exported tool with a realpath boundary;
  // remove this guard if the SDK supplies an equivalent constrained environment.
  const checkedPath = async (path: string) => {
    const actual = await realpath(resolve(workspace, path));
    const rel = relative(workspace, actual);
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error('read_denied');
    return actual;
  };
  const load = async (path: string) => {
    const actual = await checkedPath(path);
    if ((await stat(actual)).size > 65536) throw new Error('mind_file_too_large');
    const content = await readFile(actual, 'utf8');
    if (!content.trim()) throw new Error('mind_file_empty');
    return content;
  };
  const instructions = (await Promise.all(['SOUL.md', 'AGENT.md'].map(load))).join('\n\n');
  await Promise.all(memoryFiles.map(load));
  const read = createReadTool();
  const registry = createRegistry();
  registry.install(defineExtension({
    name: 'genesis.readonly.v1',
    sections: [section('genesis', () => instructions)],
    tools: [{ ...read, execute: async (args, api, ctx) => {
      const input = args as ReadToolInput;
      let path: string;
      try { path = await checkedPath(input.path); } catch { throw new Error('read_denied'); }
      return read.execute({ ...input, path }, api, ctx);
    } }],
  }));
  const harness = await Harness.open(await openNodeSqliteStorage(options.database), {
    models: options.models, registry,
    env: () => new NodeExecutionEnv({ cwd: workspace }),
    settings: { restartLimit: 3, stream: { timeoutMs: 120000, maxRetries: 0 },
      retry: { maxRetries: 2, maxAgentDelayMs: 10000 },
      compaction: { enabled: true, reserveTokens: 8192, keepRecentTokens: 16384, backgroundTokens: 8192 } },
    onReport: (_error, info) => options.log?.('durable_report', { category: info.type }),
  }, context);
  try {
    const root = await harness.root(context, { agent: {
      model: options.model, cwd: workspace,
      instructions: `Read ${memoryFiles.join(', ')} before answering questions about your memory. Only read tools are available.`,
    } });
    harness.resume();
    options.log?.('runtime_open', { conversationId: String(root.id) });
    return { harness, root, close: async () => {
      await harness.close(context);
      options.log?.('runtime_closed', { conversationId: String(root.id) });
    } };
  } catch (error) { await harness.close(context); throw error; }
}
