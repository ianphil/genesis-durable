import { randomUUID, createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { statfsSync } from 'node:fs';
import { Kysely, SqliteDialect } from 'kysely';
import { AgentCard, Task, Message, TaskStatusUpdateEvent, TaskState, Role, type SendMessageRequest } from '@a2a-js/sdk';
import { DatabaseTaskStore } from '@a2a-js/sdk/server/database';
import { DefaultRequestHandler, DefaultExecutionEventBusManager, AgentEvent, ResultManager, ServerCallContext, type AgentExecutor, type ExecutionEventBus } from '@a2a-js/sdk/server';
import { RequestMalformedError, UnsupportedOperationError, ContentTypeNotSupportedError } from '@a2a-js/sdk/errors';
import { AssistantEntry } from '@earendil-works/pi-durable';
import { context, type openRuntime } from './runtime.js';

type Runtime = Awaited<ReturnType<typeof openRuntime>>;
type Association = { task: string; message: string; hash: string; text: string; cancel: number };
const callContext = new ServerCallContext();
const terminal = new Set([TaskState.TASK_STATE_COMPLETED, TaskState.TASK_STATE_FAILED, TaskState.TASK_STATE_CANCELED]);

// SDK owns snapshots, pagination and protocol lifecycle. This table only maps
// external admission to Durable; it is not an execution queue.
export async function openA2A(options: { runtime: Runtime; database: string; name: string; url: string; log?: (event: string, fields: Record<string, string>) => void }) {
  const sqlite = new Database(options.database);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec('CREATE TABLE IF NOT EXISTS genesis_identity (id INTEGER PRIMARY KEY CHECK(id=1), context TEXT NOT NULL); CREATE TABLE IF NOT EXISTS genesis_admission (task TEXT PRIMARY KEY, message TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, text TEXT NOT NULL, cancel INTEGER NOT NULL DEFAULT 0)');
  sqlite.prepare('INSERT OR IGNORE INTO genesis_identity VALUES (1, ?)').run(randomUUID());
  const contextId = (sqlite.prepare('SELECT context FROM genesis_identity').get() as { context: string }).context;
  const db = new Kysely({ dialect: new SqliteDialect({ database: sqlite }) });
  const store = new DatabaseTaskStore(db, { ownerResolver: () => 'shared-agent' });
  const buses = new DefaultExecutionEventBusManager(() => 'shared-agent');
  const active = new Map<string, Promise<void>>();
  let stopping = false;
  let admitting = false;
  const card = AgentCard.fromJSON({ name: options.name, description: 'Persistent Genesis agent with one shared conversation', version: '0.1.0',
    supportedInterfaces: [{ url: options.url, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
    securitySchemes: { bearer: { httpAuthSecurityScheme: { scheme: 'Bearer' } } },
    securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    skills: [{ id: 'conversation', name: 'Conversation', description: 'Talk to the persistent agent', tags: ['genesis'] }],
  });
  const resultManager = () => new ResultManager(store, callContext);
  const publish = async (bus: ExecutionEventBus, id: string, state: TaskState, text: string) => {
    const event = AgentEvent.statusUpdate(TaskStatusUpdateEvent.fromJSON({ taskId: id, contextId,
      status: { state, timestamp: new Date().toISOString(), message: Message.toJSON(Message.fromJSON({ role: 'ROLE_AGENT', messageId: randomUUID(), taskId: id, contextId, parts: [{ text }] })) } }));
    await resultManager().processEvent(event);
    options.log?.('a2a_settled', { taskId: id, contextId, state: String(state), conversationId: String(options.runtime.root.id) });
    bus.publish(event);
  };
  const run = (row: Association, bus: ExecutionEventBus) => {
    const existing = active.get(row.task);
    if (existing) return existing;
    const work = (async () => {
      const task = await store.load(row.task, callContext) ?? Task.fromJSON({ id: row.task, contextId, status: { state: 'TASK_STATE_WORKING', timestamp: new Date().toISOString() } });
      await resultManager().processEvent(AgentEvent.task(task));
      bus.publish(AgentEvent.task(task));
      const submission = await options.runtime.root.submit({ type: 'input', content: row.text, requestId: `a2a:${row.message}`, whenBusy: 'reject' }, context);
      options.log?.('a2a_submission', { taskId: row.task, contextId, submissionId: String(submission.id), conversationId: String(options.runtime.root.id) });
      if (row.cancel) { const result = await submission.abort(context); if (result === 'already_placed') await options.runtime.root.abort(context); }
      const settled = await submission.wait(context);
      if (settled.status === 'done' && settled.type === 'input') {
        const answer = await options.runtime.root.commit(tx => tx.entry(AssistantEntry, settled.answer), context);
        const text = answer?.model?.flatMap(m => m.role === 'assistant' ? m.content.filter(p => p.type === 'text').map(p => p.text) : []).join('\n') ?? '';
        if (Buffer.byteLength(text) > 65536) await publish(bus, row.task, TaskState.TASK_STATE_FAILED, 'Answer exceeds result limit');
        else await publish(bus, row.task, TaskState.TASK_STATE_COMPLETED, text);
      } else {
        const canceled = (sqlite.prepare('SELECT cancel FROM genesis_admission WHERE task=?').get(row.task) as { cancel: number }).cancel;
        await publish(bus, row.task, canceled ? TaskState.TASK_STATE_CANCELED : TaskState.TASK_STATE_FAILED, canceled ? 'Canceled after execution settled' : 'Execution did not produce an answer');
      }
    })().catch(async () => {
      if (!stopping) await publish(bus, row.task, TaskState.TASK_STATE_FAILED, 'Execution unavailable');
    }).finally(() => { active.delete(row.task); if (!stopping) bus.finished(); });
    active.set(row.task, work);
    return work;
  };
  const executor: AgentExecutor = {
    async execute(ctx, bus) {
      const row = sqlite.prepare('SELECT * FROM genesis_admission WHERE task=?').get(ctx.taskId) as Association;
      if (!row) throw new Error('admission_missing');
      await run(row, bus);
    },
    async cancelTask(id) {
      sqlite.prepare('UPDATE genesis_admission SET cancel=1 WHERE task=?').run(id);
      const row = sqlite.prepare('SELECT * FROM genesis_admission WHERE task=?').get(id) as Association;
      const submission = await options.runtime.root.submit({ type: 'input', content: row.text, requestId: `a2a:${row.message}`, whenBusy: 'reject' }, context);
      const result = await submission.abort(context);
      if (result === 'already_placed') await options.runtime.root.abort(context);
      await active.get(id);
    },
  };
  const validateScope = (tenant: string, context?: string) => {
    if (tenant || (context && context !== contextId)) throw new RequestMalformedError('Unknown scope');
  };
  class Handler extends DefaultRequestHandler {
    override async *sendMessageStream(): AsyncGenerator<never, void, undefined> { throw new UnsupportedOperationError('Streaming unsupported'); }
    override async *resubscribe(): AsyncGenerator<never, void, undefined> { throw new UnsupportedOperationError('Streaming unsupported'); }
    override async getTask(params: Parameters<DefaultRequestHandler['getTask']>[0], ctx: ServerCallContext) {
      validateScope(params.tenant); return super.getTask(params, ctx);
    }
    override async listTasks(params: Parameters<DefaultRequestHandler['listTasks']>[0], ctx: ServerCallContext) {
      validateScope(params.tenant, params.contextId);
      if ((params.pageSize ?? 0) < 0 || (params.pageSize ?? 0) > 100) throw new RequestMalformedError('Invalid page size');
      return super.listTasks({ ...params, pageSize: params.pageSize || 50 }, ctx);
    }
    override async cancelTask(params: Parameters<DefaultRequestHandler['cancelTask']>[0], ctx: ServerCallContext) {
      validateScope(params.tenant);
      if (stopping) throw new UnsupportedOperationError('Agent stopping');
      return super.cancelTask(params, ctx);
    }
    override async sendMessage(params: SendMessageRequest, ctx: ServerCallContext) {
      validateScope(params.tenant);
      const modes = params.configuration?.acceptedOutputModes;
      if (modes?.length && !modes.some(mode => ['text/plain', 'text/*', '*/*'].includes(mode))) throw new ContentTypeNotSupportedError();
      const m = params.message;
      if (!m || m.role !== Role.ROLE_USER || !m.messageId || !m.parts.length || (m.contextId && m.contextId !== contextId)) throw new RequestMalformedError('Invalid message/context');
      if (m.parts.some(p => p.content?.$case !== 'text' || (p.mediaType && p.mediaType !== 'text/plain'))) throw new ContentTypeNotSupportedError();
      if (m.taskId || m.referenceTaskIds.length || params.configuration?.taskPushNotificationConfig) throw new UnsupportedOperationError();
      const text = m.parts.map(p => p.content?.value).join('\n');
      if (m.messageId.length > 128 || !text.trim() || Buffer.byteLength(text) > 16384) throw new RequestMalformedError('Input too large');
      const hash = createHash('sha256').update(text).digest('hex');
      const previous = sqlite.prepare('SELECT * FROM genesis_admission WHERE message=?').get(m.messageId) as Association | undefined;
      if (previous) {
        if (previous.hash !== hash) throw new RequestMalformedError('Message ID conflict');
        const snapshot = await store.load(previous.task, ctx);
        if (!snapshot) throw new UnsupportedOperationError('Task recovering');
        return snapshot;
      }
      if (stopping || admitting || active.size) throw new UnsupportedOperationError('Agent busy');
      if ((sqlite.prepare('SELECT count(*) AS n FROM genesis_admission').get() as { n: number }).n >= 10000) throw new UnsupportedOperationError('Task capacity reached');
      const disk = statfsSync(options.database);
      if (disk.bavail * disk.bsize < 64 * 1024 * 1024 || (sqlite.pragma('page_count', { simple: true }) as number) > 262144) throw new UnsupportedOperationError('Storage capacity reached');
      admitting = true;
      const id = randomUUID();
      try {
        sqlite.prepare('INSERT INTO genesis_admission(task,message,hash,text) VALUES(?,?,?,?)').run(id, m.messageId, hash, text);
        await store.save(Task.fromJSON({ id, contextId, status: { state: 'TASK_STATE_SUBMITTED', timestamp: new Date().toISOString() } }), ctx);
        return await super.sendMessage({ ...params, message: { ...m, taskId: id, contextId } }, ctx);
      } finally { admitting = false; }
    }
  }
  const handler = new Handler(card, store, executor, buses);
  // Recreate live buses before ingress: SDK's no-bus cancel path otherwise
  // marks canceled without asking the executor to stop the recovered work.
  for (const row of sqlite.prepare('SELECT * FROM genesis_admission').all() as Association[]) {
    const snapshot = await store.load(row.task, callContext);
    if (!snapshot || !terminal.has(snapshot.status!.state)) void run(row, buses.createOrGetByTaskId(row.task, callContext));
  }
  return { handler, card, contextId, async drain() { stopping = true; await Promise.all(active.values()); }, closed: options.runtime.harness.closed, async close() {
    stopping = true;
    await options.runtime.close();
    await Promise.all(active.values());
    await db.destroy();
  } };
}
