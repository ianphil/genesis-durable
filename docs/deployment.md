# Single-host development deployment

This installs on a chosen Docker/Tailscale host; lilarchy is only the tested dev
machine. Use fresh private paths/secrets on the final host, not archived dev keys.
HTTP-over-Tailscale is development transport. Production needs approved TLS and
security review. Administrative Docker socket access is effectively host-root.

## Prerequisites and build

- Linux Docker engine usable by the operator; Tailscale joined to approved tailnet.
- Gateway/model URL reachable from containers; approved model token for Haiku 5.5.
- Genesis template access token (if private), gateway admin token, fleet team ID.
- Private admin bearer token (base64url >=32 chars); all secret files mode 0600.
- Single provisioner; local filesystem supporting flock; matching operator UID/GID.

```sh
git clone https://github.com/ianphil/genesis-durable.git
cd genesis-durable
docker build -t genesis-durable:local .
export IMAGE_ID=$(docker image inspect genesis-durable:local --format '{{.Id}}')
docker network create genesis-agents
```

Prepare private DATA_ROOT and secret files via your operator/secret-management
process. Example root `/var/lib/genesis-durable`, owned by runtime UID, mode 0700;
secret directory `/etc/genesis-durable`. Do not put keys in shell history or images.
Set shell variables DATA_ROOT, MODEL_KEY_FILE, TEMPLATE_KEY_FILE, ADMIN_KEY_FILE,
GATEWAY_ADMIN_KEY_FILE, MODEL_URL, GATEWAY_URL, FLEET_TEAM_ID, TAILSCALE_IP.
All bind source paths must be absolute, existing and readable by the operator.

## Start provisioner

```sh
docker run -d --name genesis-provisioner --network genesis-agents \
  --user "$(id -u):$(id -g)" --group-add "$(stat -c %g /var/run/docker.sock)" \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --log-driver local --log-opt max-size=10m --log-opt max-file=3 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$DATA_ROOT:$DATA_ROOT" -v "$MODEL_KEY_FILE:$MODEL_KEY_FILE:ro" \
  -v "$TEMPLATE_KEY_FILE:$TEMPLATE_KEY_FILE:ro" \
  -v "$ADMIN_KEY_FILE:$ADMIN_KEY_FILE:ro" \
  -v "$GATEWAY_ADMIN_KEY_FILE:$GATEWAY_ADMIN_KEY_FILE:ro" \
  -e GENESIS_DATA_ROOT="$DATA_ROOT" -e GENESIS_AGENT_IMAGE="$IMAGE_ID" \
  -e GENESIS_NAMESPACE=local -e GENESIS_MODEL_URL="$MODEL_URL" \
  -e GENESIS_MODEL_KEY_FILE="$MODEL_KEY_FILE" \
  -e GENESIS_TEMPLATE_KEY_FILE="$TEMPLATE_KEY_FILE" \
  -e GENESIS_ADMIN_KEY_FILE="$ADMIN_KEY_FILE" \
  -e GENESIS_GATEWAY_URL="$GATEWAY_URL" \
  -e GENESIS_GATEWAY_ADMIN_KEY_FILE="$GATEWAY_ADMIN_KEY_FILE" \
  -e GENESIS_GATEWAY_TEAM_ID="$FLEET_TEAM_ID" \
  -e GENESIS_GATEWAY_GRANT_LOCK="$DATA_ROOT/fleet-grant-lock" \
  -e GENESIS_INGRESS_URL="http://$TAILSCALE_IP:19901" \
  -e GENESIS_DOCKER_NETWORK=genesis-agents -e GENESIS_HEALTH_PORT=8081 \
  -p 127.0.0.1:8081:8081 -p 127.0.0.1:19900:8082 \
  "$IMAGE_ID" node dist/src/provisioner-main.js
sudo tailscale serve --bg --tcp=19901 tcp://127.0.0.1:19900
```

Configure tailnet policy to permit gateway -> host:19901. Do NOT use Funnel. No
per-agent published ports or Serve commands. Choose host supervision explicitly;
this command does not install system services/restart policies. Protect loopback
administration against untrusted local users and use approved TLS ingress remotely.

## Create/manage an agent

Use authenticated HTTP to loopback port 8081. Supply bearer token privately through
a client/header file or secret-aware API client, not command-line literal secrets.

```json
{
  "requestId": "<new UUID>",
  "name": "juniper",
  "character": "Warm, concise botanical librarian",
  "purpose": "Help plan our community garden"
}
```

POST `/v1/agents` returns 202/agent ID. Poll GET `/v1/agents/<id>` until ready or
failed; ready requires local health plus registration/grant. Same request/payload
returns same agent; changed reuse/name conflict returns 409. Default model is
`github/claude-haiku-5.5`. GET `/v1/agents` lists safe summaries. POST
`/v1/agents/<id>/stop` and `/start` with `{}` manage existing state, not bootstrap.

A2A callers use fleet discovery to find `gd-local-juniper`; native official SDK
clients resolve the gateway card URL with a trailing slash, then send/start/get/
list/cancel. pi extension users register their visible session, list, send/start and
poll/cancel using existing tools. Authorized callers share one conversation.
No conversational traffic goes through the administrative API.

## Updates, recovery and shutdown

Pin image IDs. Back up first using [cold backup/restore](operations.md). A new image
configuration affects new agents, not an automatic upgrade of existing records.
There is no general in-place agent upgrade API yet. Do not edit populated SQLite
or run a second owner; use a coordinated, reviewed migration procedure with schema
compatibility evidence. Never re-bootstrap or overwrite evolved mind files.

Stop agents through API to withdraw gateway resources before stopping/removing
provisioner. Provisioner stop alone leaves agents running. Do not use global Docker
prune. Preserve data unless explicit deletion is approved. Disable host Serve only
when no agent uses it: `sudo tailscale serve --tcp=19901 off`.

Troubleshoot health, safe stage/category and correlated IDs before private content.
Lock exit 73 means another owner or launcher holds the store; never delete a lock
file to bypass a live kernel lock. Interrupted bootstrap staging needs operator
inspection and explicit move-aside before retry. Stale fleet-grant directory lock
requires confirming all writers stopped. Gateway/network errors do not authorize
blind duplicate registration. See [gateway](gateway.md), [provisioner](provisioner.md),
[operations](operations.md) and [acceptance evidence/risks](acceptance.md).
