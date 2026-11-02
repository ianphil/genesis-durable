# Docker provisioning API (#5 — in progress)

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

Not complete: interrupted creation stages, orphan/conflict recovery and failure
matrix need further tests. Lifecycle observability and deployment examples need
finishing. Test resources under `/tmp/gd-issue5` contain private keys/databases;
test containers currently remain running for continuation. No gateway mutations.
