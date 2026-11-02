# Single-ingress deployment and fleet publication (#6)

Portable design: one provisioner container exposes private administration (8081)
and an HTTP routing endpoint (8082). Agents join its dedicated Docker network,
with **no published agent ports**. Host Tailscale Serve proxies one fixed tailnet
port into ingress. No Tailscale/Docker/admin access goes into agents.

```
Fleet caller -> LiteLLM -> Tailscale Serve -> ingress /agents/<UUID>
                                              -> agent:8080
```

## New host setup

Prerequisites: Docker, Tailscale joined to the approved tailnet, Node image build,
private Genesis source access, approved model token, gateway admin token and fleet
team ID. Do not copy development private keys into images or this repository.

1. Build the image; record immutable ID:
   `docker build -t genesis-durable:local .`
   `docker image inspect genesis-durable:local --format '{{.Id}}'`.
2. Create operator-owned private data/secret directories (0700), e.g.
   `/var/lib/genesis-durable` and `/etc/genesis-durable`. Generate admin key with
   `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'` into a 0600 file.
3. Create network: `docker network create genesis-agents`.
4. Run provisioner using docs/provisioner.md's mounts/options, plus:

```sh
--network genesis-agents \
-e GENESIS_GATEWAY_URL="$GATEWAY_URL" \
-e GENESIS_GATEWAY_ADMIN_KEY_FILE="$GATEWAY_ADMIN_KEY_FILE" \
-e GENESIS_GATEWAY_TEAM_ID="$FLEET_TEAM_ID" \
-e GENESIS_GATEWAY_GRANT_LOCK="$DATA_ROOT/fleet-grant-lock" \
-e GENESIS_INGRESS_URL="http://$TAILSCALE_IP:19901" \
-e GENESIS_DOCKER_NETWORK=genesis-agents \
-v "$GATEWAY_ADMIN_KEY_FILE:$GATEWAY_ADMIN_KEY_FILE:ro" \
-p 127.0.0.1:19900:8082
```

Keep administration `-p 127.0.0.1:8081:8081` separate. Absolute data and model-key
paths MUST be mounted identically in provisioner because daemon bind mounts use
host paths. Use the same non-root UID/GID as the directory owner and supplementary
Docker socket group. Socket access is host-root-equivalent. Exactly one provisioner
owns its SQLite. Use bounded container logs. Never give socket to agents.

5. One-time HOST ingress setup (not in containers):

```sh
sudo tailscale serve --bg --tcp=19901 tcp://127.0.0.1:19900
tailscale serve status
```

Allow the gateway host/principal to port 19901 in Tailscale policy. Serve is tailnet
only; do NOT use Funnel. HTTP-over-tailnet is a development transport exception,
not production TLS conformance. Production should use approved HTTPS ingress.
No per-agent Serve/UFW changes are required. No restart policy is assumed: operator
must arrange process/container supervision appropriate to the final host.

## Publication/lifecycle

After local health, provisioner registers `gd-<namespace>-<name>` with listener base
`<ingress>/agents/<UUID>`, persists ownership then grants fleet-team access. Ready
requires publication/grant. Start/restart reconciles using exact name/endpoint and
listener secret; same-name foreign records fail closed. Stop withdraws registration
and grant before stopping. Stable name/context/tasks survive; registry UUID can
change after stop/start. API errors never return registry secrets.

Every team-grant writer must serialize: shared mkdir lock coordinates cooperating
processes only. Existing pi-a2a registrars do not automatically share this lock;
coordinate externally until all writers use a common lock. Stale lock requires
operator inspection/removal, never automatic stealing.

Native listener remains SDK-backed. Deployed LiteLLM forwards task controls to
registry base using v0.3 methods; src/gateway-tasks.ts uses official SDK legacy
get/cancel and native ListTasks dispatch. Reproduced get/list 404 before adapter;
regression test covers root tasks/get. Upstream removal condition beside code:
https://github.com/BerriAI/litellm/pull/44769. No gateway patch/custom image.

## Development-host evidence and remaining checks

On lilarchy, direct Docker Tailscale-IP publication was unreachable from LiteLLM,
even after a host-input UFW allow rule. Host Serve TCP proxy fixed reachability.
Temporary actual Serve setup proxies `100.120.30.116:19901` to
`100.120.30.116:19900`; the provisioner ingress is published on that latter address.
This differs from recommended loopback deployment above; changing Serve requires
host sudo. Agent containers have no published ports.

Live fleet grant/discovery, SDK gateway send and two-turn conversation passed:
Juniper read generated identity/memory (project iris-682), then recalled a
conversation token. After agent replacement and migration to routed ingress,
conversation token persisted; gateway send/get/list passed. Registry and native
card must both advertise routed URL, not a private Docker hostname.

Automated tests: mocked ownership/grant failure/uncertain-create/outage/withdrawal,
HTTP ingress target/path/auth routing, native listener and gateway compatibility.
Final acceptance run also passed through the real gateway: pi extension nonblocking
start returned a task; explicit cancel settled canceled; a blocking SDK caller
aborted its wait while accepted work completed and its result remained retrievable.
Routed API stop withdrew registration, start republished the stable name (new registry
UUID), and old completed/canceled task IDs and shared context remained retrievable.
Paginated gateway list returned a page token. Independent oma14 fleet session reported
actual extension discovery/send success and correct Juniper identity/project code.
This remote result is agent-reported tool evidence, not a local rerun of its tools.
No comprehensive spec 1.0.1 or production-hardening claim.

Cleanup: test registration and fleet grant were withdrawn via API stop and their
absence verified; test containers and dedicated Docker network were removed.
Juniper's mind/state and private test evidence were moved outside Git to the
operator-only `~/.local/state/genesis-durable/session-evidence/issue6` directory.
Earlier issue fixtures were archived under that same private parent. These contain
sensitive data/keys, are not a deployment, and must not be copied to another host
as configuration. The actual pi A2A extension discovered and conversed with Juniper,
retrieving both the Markdown project code and prior conversation token. #9 tracks
the agent's inaccurate explanation of the two memory layers.

Host cleanup still requires sudo. Disable test proxy with
`sudo tailscale serve --tcp=19901 off`. Remove temporary UFW rule by its comment
`genesis-a2a-test` only after inspecting current numbering; never delete by stale index.
