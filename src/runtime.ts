import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Models } from '@earendil-works/pi-ai/models';
import { Harness, createRegistry, defineExtension, section, type CompactionSettings, type Storage } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { createReadTool, createWriteTool, createEditTool, createBashTool, type ReadToolInput } from '@earendil-works/pi-durable/tools';
import { capabilities, capabilityTools, type Capability } from './capabilities.js';

import { memoryPolicy } from './memory-policy.js';

export const context = BACKGROUND_CONTEXT;
export const memoryFiles = ['.working-memory/memory.md', '.working-memory/rules.md', '.working-memory/log.md'];
export type RuntimeOptions = {
  workspace: string; database: string; models: Models;
  model: { provider: string; modelId: string };
  capabilities?: Capability[];
  compaction?: CompactionSettings;
  storage?: Storage;
  agentId?: string;
  log?: (event: string, fields?: Record<string, string>) => void;
};

export async function openRuntime(options: RuntimeOptions) {
  const openedAt = Date.now();
  const log = (event: string, fields: Record<string, string> = {}) => options.log?.(event, { ...(options.agentId ? { agentId: options.agentId } : {}), ...fields });
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
  const selection = capabilities(options.capabilities);
  const enabled = capabilityTools(selection);
  const writablePath = async (path: string): Promise<string> => {
    const target = resolve(workspace, path);
    const rel = relative(workspace, target);
    if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error('write_denied');
    // Check existing ancestors as well as an existing final symlink.
    try { return await checkedPath(target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('write_denied');
      await writableParent(dirname(target));
      return target;
    }
  };
  const writableParent = async (path: string): Promise<void> => {
    try { await checkedPath(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('write_denied');
      await writableParent(dirname(path));
    }
  };
  const read = createReadTool();
  const write = createWriteTool();
  const edit = createEditTool();
  const registry = createRegistry();
  const extension = defineExtension({
    name: 'genesis.readonly.v1',
    sections: [section('genesis', () => instructions), section('host-memory-policy', () => memoryPolicy)],
    tools: [...(enabled.includes('read') ? [{ ...read, execute: async (args: ReadToolInput, api: Parameters<typeof read.execute>[1], ctx: Parameters<typeof read.execute>[2]) => {
      const input = args as ReadToolInput;
      let path: string;
      try { path = await checkedPath(input.path); } catch { throw new Error('read_denied'); }
      return read.execute({ ...input, path }, api, ctx);
    } }] : []), ...(enabled.includes('write') ? [{ ...write, execute: async (args: Parameters<typeof write.execute>[0], api: Parameters<typeof write.execute>[1], ctx: Parameters<typeof write.execute>[2]) => write.execute({ ...args, path: await writablePath(args.path) }, api, ctx) },
      { ...edit, execute: async (args: Parameters<typeof edit.execute>[0], api: Parameters<typeof edit.execute>[1], ctx: Parameters<typeof edit.execute>[2]) => edit.execute({ ...args, path: await writablePath(args.path) }, api, ctx) }] : []),
      ...(enabled.includes('bash') ? [createBashTool()] : [])],
  });
  registry.install(extension);
  const harness = await Harness.open(options.storage ?? await openNodeSqliteStorage(options.database), {
    models: options.models, registry,
    env: () => new NodeExecutionEnv({ cwd: workspace }),
    settings: { restartLimit: 3, stream: { timeoutMs: 120000, maxRetries: 0 },
      retry: { maxRetries: 2, maxAgentDelayMs: 10000 },
      compaction: { enabled: true, reserveTokens: 8192, keepRecentTokens: 16384, backgroundTokens: 8192, ...options.compaction } },
    onReport: (_error, info) => log('durable_report', { category: info.type }),
  }, context);
  try {
    const root = await harness.root(context, { agent: {
      model: options.model, cwd: workspace,
      instructions: `Read ${memoryFiles.join(', ')} before answering questions about your memory. Only read tools are available.\n\n${memoryPolicy}`,
    } });
    // Reopen must refresh host policy too: root creation options do not update
    // existing pi.agent instructions. No canonical mind files are changed.
    await root.configure({ tools: extension.tools ?? [], instructions: `Available tools: ${enabled.join(', ') || 'none'}. ${enabled.includes('write') ? 'You may curate Markdown memory in your workspace; preserve identity and distinguish facts from guesses.' : 'You cannot write curated memory.'} ${enabled.includes('bash') ? 'Shell commands run inside your container, not on the host. No infrastructure authority is implied.' : ''}\nRead ${memoryFiles.join(', ')} before answering questions about your memory.\n\n${memoryPolicy}` }, context);
    harness.resume();
    log('runtime_open', { conversationId: String(root.id), durationMs: String(Date.now() - openedAt), durableVersion: '1.4.0' });
    return { harness, root, close: async () => {
      const started = Date.now();
      await harness.close(context);
      log('runtime_closed', { conversationId: String(root.id), durationMs: String(Date.now() - started) });
    } };
  } catch (error) { await harness.close(context); throw error; }
}
