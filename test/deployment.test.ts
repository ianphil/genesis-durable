import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Compose keeps privileged provisioning separate and host mount paths stable', t => {
  const available = spawnSync('docker', ['compose', 'version']);
  if (available.status !== 0) return t.skip('Docker Compose not installed');
  const env = { ...process.env, GENESIS_UID: '502', GENESIS_GID: '20', GENESIS_DOCKER_GID: '0',
    GENESIS_DATA_ROOT: '/tmp/genesis-data', GENESIS_SECRET_DIR: '/tmp/genesis-secrets',
    GENESIS_AGENT_IMAGE: `ghcr.io/ianphil/genesis-durable@sha256:${'a'.repeat(64)}`,
    GENESIS_MODEL_URL: 'http://gateway:4000', GENESIS_GATEWAY_URL: 'http://gateway:4000',
    GENESIS_GATEWAY_TEAM_ID: 'test', GENESIS_INGRESS_URL: 'http://100.64.0.1:19901' };
  const result = spawnSync('docker', ['compose', '-f', 'deploy/compose.yml', 'config', '--format', 'json'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(config.services), ['provisioner']);
  const service = config.services.provisioner;
  assert.equal(service.user, '502:20');
  assert.equal(service.read_only, true);
  assert.equal(service.restart, 'unless-stopped');
  assert.ok(service.ports.every((port: { host_ip: string }) => port.host_ip === '127.0.0.1'));
  for (const path of [env.GENESIS_DATA_ROOT, env.GENESIS_SECRET_DIR]) {
    assert.ok(service.volumes.some((volume: { source: string; target: string }) => volume.source === path && volume.target === path));
  }
  assert.equal(service.environment.GENESIS_MODEL_KEY_FILE, `${env.GENESIS_SECRET_DIR}/model`);
  assert.equal(service.environment.GENESIS_AGENT_IMAGE, env.GENESIS_AGENT_IMAGE);
});
