# Deployment through demigod (issue #10)

This is the deployment plan and configuration template, not evidence of a live
installation. The existing ais-mac-mini is Intel; publish linux/amd64. Its Docker
Desktop engine runs Linux containers. Do not assume macOS socket ownership equals
ownership of the mounted socket inside that engine.

## Release ownership

The publishing workflow tests and publishes `ghcr.io/ianphil/genesis-durable:latest`
and `sha-<full commit>` on main pushes (or manual dispatch). OCI source/revision
labels link the package to this repository. Only main may publish latest.
Demigod should accept signed package/published events for this repository/package
and latest only. The existing homeportal target must continue independently.
Automatic provisioner updates still require schema/runtime compatibility review;
this is not unattended database migration or agent runtime upgrading.

`deploy/compose.yml` updates only the provisioner. `GENESIS_AGENT_IMAGE` is a
separately pinned **bare local image ID** (`sha256:<64 hex>`) for new agents;
existing records keep their own image. Pull a published immutable registry digest,
then obtain the local ID with `docker image inspect --format '{{.Id}}' <reference>`.
A registry reference (`ghcr.io/...@sha256:...`) is not accepted by the provisioner. No general agent upgrade API exists.

## Private Mac deployment

1. Copy `deploy/compose.yml` into `/Users/ianphil/src/genesis-durable-deploy/docker-compose.yml`
   and `deploy/env.example` to its private `.env`, mode 0600. Set actual paths,
   UID/GID, socket supplementary GID, ingress address and image digest.
2. Create data/secret directories owned by the runtime user, mode 0700. Secret
   files `model`, `admin`, and `gateway-admin` must be mode 0600 and readable by
   the runtime UID. The admin token is base64url, at least 32 characters. Obtain
   credentials through the approved private process; never embed them in commands,
   logs, source, webhook payloads or Compose output. Public Genesis templates need
   no template token; private templates require an explicit added file reference.
3. Mount both data and secrets at the **same absolute paths** in the provisioner
   and on the host. The provisioner passes the model-file source path to Docker
   for agent mounts. Mapping it to a container-only path breaks agent creation.
4. Verify the non-root runtime can read files, write the data root, hold `flock`
   and use the Docker socket inside Docker Desktop. Test a disposable agent before
   bootstrapping Jupiter. Do not solve permissions by giving agents the socket.
5. Run `docker compose --project-name genesis-durable --file docker-compose.yml config -q`,
   pull the provisioner, and start only `provisioner`. Health uses loopback 8081;
   router uses loopback 19900. Check conflicts immediately before starting.
6. Configure host Tailscale **Serve**, not Funnel, TCP 19901 to 127.0.0.1:19900.
   Preserve existing portal HTTP Serve and webhook HTTPS Funnel. Authorize gateway
   reachability through tailnet policy; HTTP-over-Tailscale remains dev transport.

Demigod needs read access to deployment Compose/private environment configuration
at the same host paths, plus its existing Docker socket. Explicit project/file
selection prevents it operating on the wrong stack. Do not mount Genesis secrets
into demigod merely to interpolate Compose: `.env` contains paths, not key values.
The provisioner has gateway administration; agent containers receive only their
model/listener credentials. Provisioner replacement alone leaves agents running.

## GitHub webhook

After the updated demigod target is live, create a repository webhook with `gh api`
using private input (no secret in CLI arguments or transcript):

- Repository: `ianphil/genesis-durable`.
- Events: `package`; active; JSON content type; SSL verification enabled.
- URL: `https://ais-mac-mini.taile9ce97.ts.net/webhook` (existing listener).
- Secret: existing listener HMAC secret, supplied privately. Supporting independent
  per-repository secrets is not part of this initial deployment.

Verify repository webhook admin permission first. The workflow uses its own
`GITHUB_TOKEN` with contents:read/packages:write, not the operator's token. Ensure
GHCR image visibility permits host pulls (or configure credentials privately).
Confirm GitHub ping and actual package/latest delivery; a successful ping alone
is not deployment acceptance. Inspect real package payload tag/repository shape
when implementing the allowlist. Do not weaken validation to accommodate a guess.

## Acceptance and rollback

Record revisions/digests and safe outcomes, not raw private configuration. Verify:

- Portal update affects only portal; Genesis update only provisioner.
- Invalid signatures, unrelated repositories/packages and other tags do nothing.
- Concurrent events do not lose another target; failures are observable.
- Provisioner replacement preserves agent metadata/workspace/state and discovery.
- Remote fleet conversation and restart persistence work; agent mounts/env contain
  neither Docker access nor gateway administration.
- Portal, existing Funnel and Serve routes still work.

Keep the previous provisioner digest and configuration. Before schema-changing
updates use a coordinated cold backup per [operations](operations.md); do not
blindly roll back a binary against an incompatible database. Do not globally prune
images or delete data during deployments. Jupiter creation waits for approved
character and purpose, and never reuses or overwrites Juniper's retained data.
