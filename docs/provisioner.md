# Docker provisioning API (#5)

Entrypoint: `node dist/src/provisioner-main.js` in the shared image. The provisioner
mounts the Docker socket; agents never do. Socket access is effectively host-root.
Bind API to loopback/private approved ingress only; all routes require bearer auth.
No gateway registration yet. `ready` currently means local container health only.

Required configuration:
- GENESIS_DATA_ROOT: absolute host data root, default deployment choice
  `/var/lib/genesis-durable`; mount at the IDENTICAL path inside provisioner.
- GENESIS_AGENT_IMAGE: immutable local `sha256:...` image ID.
- GENESIS_NAMESPACE: deployment ownership namespace, lowercase slug.
- GENESIS_MODEL_URL, GENESIS_MODEL_KEY_FILE: approved model gateway and private
  runtime model token path. Mount key at identical host/container path because
  agent bind mounts are resolved by the Docker daemon on the host.
- GENESIS_TEMPLATE_KEY_FILE: optional private GitHub source token file.
- GENESIS_ADMIN_KEY_FILE: random base64url admin token, >=32 characters.
- GENESIS_HEALTH_PORT=8081 for the provisioner image healthcheck.

Run provisioner as the data-owning non-root UID/GID with Docker socket supplementary
group. Agent containers use that UID/GID. Rootfs read-only, drop capabilities,
no-new-privileges, private tmpfs; publish `127.0.0.1:<port>:8081`. The provisioner
needs outbound GitHub and model access. Do not mount credentials in workspaces.
This slice uses Docker's default bridge and publishes no agent port; #6 establishes
approved gateway reachability. Docker networking changes are not performed.

API:
- POST /v1/agents: `{requestId,name,character,purpose,model?}`; Haiku default,
  only approved alias accepted. Returns 202 new / 200 existing same request.
- GET /v1/agents?limit=50&cursor=...; max 100.
- GET /v1/agents/{id}.
- POST /v1/agents/{id}/start or /stop with `{}`; returns 202.

Conflicting request reuse/name: 409. Invalid/unknown: 400/404; auth 401. Errors
contain fixed code/correlation UUID, no raw Docker/provider errors. Inputs and
private provisioning SQLite are sensitive; inspect/list omit character/purpose.
One provisioner owns its SQLite file; no concurrent replicas. Creation intent is
stored before async orchestration. Ownership labels gate Docker actions. Start
reuses validated workspace; stop does not cancel accepted Durable work.

Layout: provisioning.sqlite and agents/<UUID>/{workspace,state,listener-key,
bootstrap-staging}. Failed bootstrap staging is inspectable and requires explicit
operator recovery per docs/bootstrap.md; no automatic destructive retry.

Observed: six automated tests passed on Node 25.9.0; image built on pinned Node 22.
Live Docker-hosted API: unauthorized list 401; create 202; Genesis fetched/generated;
migration helper ran; constrained non-root agent became healthy; stop/start passed;
provisioner restart retained/reconciled same agent. Agent mounts inspected: only
workspace, state, listener key and model key, no socket/admin/template key.

Additional verification: seven tests pass, including restart adoption of an owned
partial container, persisted stop intent, failed start/retry, and refusal to mutate
an unrelated label/name conflict. Lifecycle transitions emit safe structured events.
A live SIGKILL during creation preserved request identity after restart; incomplete
bootstrap was reported failed rather than duplicated or silently regenerated.
Operator must inspect/move aside failed staging before retry, as in bootstrap docs.
This is safe inspectable recovery, not automatic completion of interrupted model work.

All test-owned containers were stopped/removed. Test evidence/private keys and
databases remain under `/tmp/gd-issue5`; do not commit or share them. No gateway
mutations. Latest image rebuilt after healthcheck port correction; the live lifecycle
run preceded that minor health-route change. Full interruption-at-every-stage,
backup/restore, adversarial isolation and gateway publication remain later acceptance
work, not claims established here.

Example (create keys privately first; paths must exist and be readable by the UID):

```sh
docker run -d --name genesis-provisioner \
  --user "$(id -u):$(id -g)" --group-add "$(stat -c %g /var/run/docker.sock)" \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --log-driver local --log-opt max-size=10m --log-opt max-file=3 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$DATA_ROOT:$DATA_ROOT" -v "$MODEL_KEY_FILE:$MODEL_KEY_FILE:ro" \
  -v "$ADMIN_KEY_FILE:$ADMIN_KEY_FILE:ro" -v "$TEMPLATE_KEY_FILE:$TEMPLATE_KEY_FILE:ro" \
  -e GENESIS_DATA_ROOT="$DATA_ROOT" -e GENESIS_AGENT_IMAGE="$IMAGE_ID" \
  -e GENESIS_NAMESPACE=local -e GENESIS_MODEL_URL="$MODEL_URL" \
  -e GENESIS_MODEL_KEY_FILE="$MODEL_KEY_FILE" \
  -e GENESIS_ADMIN_KEY_FILE="$ADMIN_KEY_FILE" \
  -e GENESIS_TEMPLATE_KEY_FILE="$TEMPLATE_KEY_FILE" -e GENESIS_HEALTH_PORT=8081 \
  -p 127.0.0.1:8081:8081 "$IMAGE_ID" node dist/src/provisioner-main.js
```

Provisioner stop/replacement does not stop agent containers; restart reconciles
recorded desired state. An agent's explicit API stop preserves all data and work.
