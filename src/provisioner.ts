import Database from 'better-sqlite3';
import Docker from 'dockerode';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, lstat } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { bootstrap, type Character } from './bootstrap.js';
import { runtimeModels, defaultModel } from './model.js';

type Agent = { id: string; request: string; hash: string; name: string; character: string; purpose: string; state: string; stage: string; desired: string; failure: string | null; image: string; revision: string | null; created: string; updated: string };
export type ProvisionerConfig = { root: string; image: string; modelUrl: string; modelKeyFile: string; templateKeyFile?: string; namespace: string };
export class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
export function validateCreate(value: unknown): Character & { requestId: string; model: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'invalid_input');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['requestId', 'name', 'character', 'purpose', 'model'].includes(k)) || typeof v.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(v.requestId) || typeof v.name !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(v.name) || [v.character, v.purpose].some(x => typeof x !== 'string' || !x.trim() || Buffer.byteLength(x) > 8192) || (v.model !== undefined && v.model !== defaultModel.modelId)) throw new ApiError(400, 'invalid_input');
  return { requestId: v.requestId, name: v.name, character: v.character as string, purpose: v.purpose as string, model: defaultModel.modelId };
}

export async function openProvisioner(config: ProvisionerConfig, docker = new Docker({ socketPath: '/var/run/docker.sock' })) {
  if (!isAbsolute(config.root) || resolve(config.root) !== config.root || !/^[a-z][a-z0-9-]{0,23}$/.test(config.namespace) || !/^sha256:[a-f0-9]{64}$/.test(config.image)) throw new Error('provisioner_configuration');
  await mkdir(config.root, { recursive: true, mode: 0o700 });
  const db = new Database(join(config.root, 'provisioning.sqlite'));
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, request TEXT UNIQUE, hash TEXT, name TEXT UNIQUE, character TEXT, purpose TEXT, state TEXT, stage TEXT, desired TEXT, failure TEXT, image TEXT, revision TEXT, created TEXT, updated TEXT)');
  const active = new Map<string, Promise<void>>();
  let closing = false;
  const get = (id: string) => db.prepare('SELECT * FROM agents WHERE id=?').get(id) as Agent | undefined;
  const update = (id: string, state: string, stage: string, failure: string | null = null) => db.prepare('UPDATE agents SET state=?, stage=?, failure=?, updated=? WHERE id=?').run(state, stage, failure, new Date().toISOString(), id);
  const summary = (row: Agent) => ({ id: row.id, name: row.name, model: defaultModel.modelId, state: row.state, stage: row.stage, desiredState: row.desired, operationId: row.id, failure: row.failure ? { code: row.failure, correlationId: row.id } : null, provenance: { imageDigest: row.image, templateRevision: row.revision }, createdAt: row.created, updatedAt: row.updated });
  const name = (id: string) => `gd-${config.namespace}-${id}`;
  const owned = async (id: string) => {
    const container = docker.getContainer(name(id));
    try {
      const info = await container.inspect();
      if (info.Config.Labels?.['genesis.namespace'] !== config.namespace || info.Config.Labels?.['genesis.agent'] !== id) throw new Error('container_not_owned');
      return { container, info };
    } catch (e) { if ((e as { statusCode?: number }).statusCode === 404) return undefined; throw e; }
  };
  const reconcile = (id: string) => {
    if (active.has(id) || closing) return;
    const work = (async () => {
      const row = get(id)!;
      try {
        let current = await owned(id);
        if (row.desired === 'stopped') {
          if (current?.info.State.Running) await current.container.stop({ t: 10 });
          update(id, 'stopped', 'stopped'); return;
        }
        if (!current) {
          update(id, 'creating', 'bootstrap');
          const agentDirectory = join(config.root, 'agents', id);
          const models = await runtimeModels(config.modelUrl, config.modelKeyFile);
          const token = config.templateKeyFile ? (await readFile(config.templateKeyFile, 'utf8')).trim() : undefined;
          const mind = await bootstrap({ agentDirectory, input: { name: row.name, character: row.character, purpose: row.purpose }, models, templateToken: token });
          db.prepare('UPDATE agents SET revision=? WHERE id=?').run(mind.revision, id);
          const state = join(agentDirectory, 'state');
          await mkdir(state, { recursive: true, mode: 0o700 });
          const listener = join(agentDirectory, 'listener-key');
          try { await writeFile(listener, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
          if (!(await lstat(listener)).isFile()) throw new Error('credential_invalid');
          // Paths are Docker HOST paths. Provisioner must mount data/key paths at
          // their identical absolute locations; callers never supply paths.
          const mounts = [
            { Type: 'bind' as const, Source: mind.workspace, Target: '/workspace', ReadOnly: true },
            { Type: 'bind' as const, Source: state, Target: '/state' },
            { Type: 'bind' as const, Source: config.modelKeyFile, Target: '/run/secrets/model', ReadOnly: true },
            { Type: 'bind' as const, Source: listener, Target: '/run/secrets/listener', ReadOnly: true },
          ];
          const base = { Image: row.image, User: `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`, Labels: { 'genesis.namespace': config.namespace, 'genesis.agent': id }, HostConfig: { Mounts: mounts, ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'], Memory: 1073741824, NanoCpus: 1000000000, PidsLimit: 128, Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=64m' }, LogConfig: { Type: 'local', Config: { 'max-size': '10m', 'max-file': '3' } } } };
          update(id, 'creating', 'storage');
          const migrationName = `${name(id)}-migration`;
          let migration = docker.getContainer(migrationName);
          try {
            const old = await migration.inspect();
            if (old.Config.Labels?.['genesis.agent'] !== id || old.Config.Labels?.['genesis.namespace'] !== config.namespace) throw new Error('migration_not_owned');
            if (old.State.Running) await migration.wait();
            await migration.remove();
          } catch (e) { if ((e as { statusCode?: number }).statusCode !== 404) throw e; }
          migration = await docker.createContainer({ ...base, name: migrationName, Cmd: ['node', 'node_modules/@a2a-js/sdk/dist/cli/a2a_db.js', 'upgrade', '--url', 'sqlite:/state/a2a.sqlite', '--store', 'tasks'] });
          await migration.start();
          const receipt = await migration.wait();
          if (receipt.StatusCode !== 0) throw new Error('migration_failed');
          await migration.remove();
          const container = await docker.createContainer({ ...base, name: name(id), Env: [`GENESIS_MODEL_URL=${config.modelUrl}`, 'GENESIS_MODEL_KEY_FILE=/run/secrets/model', 'GENESIS_LISTENER_KEY_FILE=/run/secrets/listener', `GENESIS_NAME=${row.name}`, `GENESIS_A2A_URL=http://${name(id)}:8080/a2a`] });
          current = { container, info: await container.inspect() };
        }
        update(id, 'creating', 'runtime');
        if (!current.info.State.Running) await current.container.start();
        for (let attempt = 0; attempt < 60; attempt++) {
          const info = await current.container.inspect();
          if (!info.State.Running || info.State.Health?.Status === 'unhealthy') throw new Error('runtime_not_ready');
          if (info.State.Health?.Status === 'healthy') { update(id, 'ready', 'runtime'); return; }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw new Error('readiness_timeout');
      } catch { update(id, 'failed', 'failed', 'provisioning_failed'); }
    })().finally(() => active.delete(id));
    active.set(id, work);
  };
  for (const row of db.prepare('SELECT * FROM agents WHERE state != ?').all('failed') as Agent[]) reconcile(row.id);
  return {
    create(value: unknown) {
      if (closing) throw new ApiError(503, 'stopping');
      const input = validateCreate(value);
      const hash = createHash('sha256').update(JSON.stringify([input.name, input.character, input.purpose, input.model])).digest('hex');
      const previous = db.prepare('SELECT * FROM agents WHERE request=?').get(input.requestId) as Agent | undefined;
      if (previous) { if (previous.hash !== hash) throw new ApiError(409, 'request_conflict'); return { existing: true, agent: summary(previous) }; }
      if (db.prepare('SELECT id FROM agents WHERE name=?').get(input.name)) throw new ApiError(409, 'name_conflict');
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare('INSERT INTO agents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, input.requestId, hash, input.name, input.character, input.purpose, 'creating', 'accepted', 'ready', null, config.image, null, now, now);
      reconcile(id); return { existing: false, agent: summary(get(id)!) };
    },
    list(limit = 50, cursor = '') { if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, 'invalid_limit'); const rows = db.prepare('SELECT * FROM agents WHERE id > ? ORDER BY id LIMIT ?').all(cursor, limit + 1) as Agent[]; return { agents: rows.slice(0, limit).map(summary), nextCursor: rows.length > limit ? rows[limit - 1].id : null }; },
    inspect(id: string) { const row = get(id); if (!row) throw new ApiError(404, 'not_found'); return summary(row); },
    lifecycle(id: string, desired: 'ready' | 'stopped') {
      const row = get(id); if (!row) throw new ApiError(404, 'not_found');
      if (active.has(id)) { if (row.desired !== desired) throw new ApiError(409, 'operation_busy'); return summary(row); }
      db.prepare('UPDATE agents SET desired=? WHERE id=?').run(desired, id);
      update(id, 'creating', desired === 'stopped' ? 'stopping' : 'runtime'); reconcile(id); return summary(get(id)!);
    },
    async close() { closing = true; await Promise.all(active.values()); db.close(); },
  };
}
