import { mkdir, rmdir, readFile } from 'node:fs/promises';

export type GatewayConfig = { url: string; adminKeyFile: string; teamId: string; grantLockDirectory: string };
export type Registration = { id: string; name: string; listener: string };
export type GatewayAgent = { name: string; listener: string; token: string };

// LiteLLM registry DTOs are separate from native SDK cards. Based on pi-a2a's
// deployed registration contract; no native task transport workaround is used.
export function gateway(config: GatewayConfig) {
  const url = new URL(config.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('gateway_configuration');
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const key = (await readFile(config.adminKeyFile, 'utf8')).trim();
    const response = await fetch(new URL(path, url), { method,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (response.status === 404 && method === 'DELETE') return null;
    if (!response.ok) throw new Error('gateway_unavailable');
    return response.status === 204 ? null : response.json();
  };
  const list = async (): Promise<Array<{ agent_id: string; agent_name: string; agent_card_params?: { url?: string }; static_headers?: Record<string, string> }>> => {
    const rows = await request('/v1/agents');
    if (!Array.isArray(rows)) throw new Error('gateway_registry_invalid');
    return rows;
  };
  const grant = async (id: string, remove: boolean) => {
    // Fail closed on lock contention/crash. Every registrar of this team must
    // use this same shared directory or serialize externally (including pi-a2a).
    try { await mkdir(config.grantLockDirectory, { mode: 0o700 }); }
    catch { throw new Error('gateway_grant_locked'); }
    try {
      const read = async () => {
        const info = await request(`/team/info?team_id=${encodeURIComponent(config.teamId)}`);
        if (info.team_info?.team_id !== config.teamId) throw new Error('gateway_team_invalid');
        return info.team_info.object_permission ?? {};
      };
      const permissions = await read();
      if (permissions.agents !== undefined && (!Array.isArray(permissions.agents) || permissions.agents.some((x: unknown) => typeof x !== 'string'))) throw new Error('gateway_team_invalid');
      const existing: string[] = permissions.agents ?? [];
      if (existing.includes(id) === !remove) return;
      const agents = remove ? existing.filter(x => x !== id) : [...existing, id];
      const { object_permission_id: _id, ...other } = permissions;
      await request('/team/update', 'POST', { team_id: config.teamId, object_permission: { ...other, agents } });
      const saved = await read();
      if (!agents.every(x => saved.agents?.includes(x)) || (remove && saved.agents?.includes(id))) throw new Error('gateway_grant_failed');
    } finally { await rmdir(config.grantLockDirectory); }
  };
  const owns = (row: Awaited<ReturnType<typeof list>>[number], agent: GatewayAgent) => row.agent_name === agent.name && row.agent_card_params?.url === agent.listener.replace(/\/$/, '') && row.static_headers?.Authorization === `Bearer ${agent.token}`;
  return {
    async publish(agent: GatewayAgent, saved: Registration | undefined, persist: (registration: Registration) => void) {
      const listener = new URL(agent.listener);
      if (!['http:', 'https:'].includes(listener.protocol) || listener.username || listener.password || ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(listener.hostname)) throw new Error('gateway_listener_invalid');
      const rows = await list();
      const sameName = rows.filter(row => row.agent_name === agent.name);
      let registration: Registration;
      if (sameName.length) {
        if (sameName.length !== 1 || !owns(sameName[0], agent) || (saved && saved.id !== sameName[0].agent_id)) throw new Error('gateway_name_conflict');
        registration = { id: sameName[0].agent_id, name: agent.name, listener: agent.listener };
      } else {
        if (saved && rows.some(row => row.agent_id === saved.id)) throw new Error('gateway_ownership_conflict');
        const result = await request('/v1/agents', 'POST', { agent_name: agent.name,
          agent_card_params: { name: agent.name, description: 'Persistent Genesis agent; shared conversation', version: '0.1.0', url: agent.listener.replace(/\/$/, ''),
            protocolVersion: '1.0', preferredTransport: 'JSONRPC', capabilities: { streaming: false, pushNotifications: false },
            skills: [{ id: 'conversation', name: 'Conversation', description: 'Talk to a persistent Genesis agent', tags: ['genesis'] }],
            defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
            securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } }, security: [{ bearer: [] }] },
          static_headers: { Authorization: `Bearer ${agent.token}` } });
        if (typeof result?.agent_id !== 'string') throw new Error('gateway_registration_uncertain');
        registration = { id: result.agent_id, name: agent.name, listener: agent.listener };
      }
      // Record ownership before grants: grant failure never causes blind create.
      persist(registration);
      await grant(registration.id, false);
      return registration;
    },
    async withdraw(agent: GatewayAgent, saved: Registration | undefined) {
      const rows = await list();
      const candidates = rows.filter(row => row.agent_name === agent.name || (saved && row.agent_id === saved.id));
      if (candidates.some(row => !owns(row, agent))) throw new Error('gateway_ownership_conflict');
      for (const row of candidates) {
        await request(`/v1/agents/${encodeURIComponent(row.agent_id)}`, 'DELETE');
        await grant(row.agent_id, true);
      }
      if (!candidates.length && saved) await grant(saved.id, true);
    },
  };
}
