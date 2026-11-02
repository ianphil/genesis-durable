# Genesis Durable

Container-hosted [Genesis](https://github.com/ianphil/genesis) agents powered by
[Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable),
reachable through A2A.

**Status: early runtime proof.** A minimal containerized Durable host with SQLite,
read-only mind access and health endpoints is implemented. Controlled no-Git
[Genesis bootstrap](docs/bootstrap.md) is available as a provisioner function.
An authenticated [direct A2A listener](docs/a2a.md) supports persistent tasks.
A Docker-hosted [provisioning API](docs/provisioner.md) creates and manages local
agent containers with fleet gateway registration. See [runtime setup and evidence](docs/runtime.md).

## Design

A private, authenticated provisioning API receives an agent name, character,
purpose and model. It fetches the latest Genesis template at creation time,
records its exact revision, bootstraps a persistent local workspace, and starts
an agent container from a shared base image.

Each agent has:

- A stable identity and one shared conversation for authorized callers.
- Genesis personality, operating instructions and Markdown memory.
- A Pi Durable harness with persistent SQLite state.
- An official-SDK-backed A2A interface routed through LiteLLM.
- Structured operational logs correlated with A2A and Durable identifiers.

The provisioned workspace has **no Git repository**. Genesis Git-based skills
and destructive bootstrap steps must be adapted or disabled, not run verbatim.
Container replacement must preserve workspace and database state. Template/image
updates must not silently overwrite an evolved mind.

## Initial scope

- Create, list, inspect, start and stop agents through the administrative API.
- Accept character and purpose up front; bootstrap without an interactive interview.
- Discover, send/start work, get/list tasks and explicitly cancel through A2A.
- Preserve task-to-submission associations and result lookup across restart.
- Let Durable own execution, recovery and conversation compaction; let Genesis
  own curated long-term memory. Do not build another harness or scheduler.
- Use private model credentials, readiness/liveness checks, structured stdout logs
  and bounded log rotation. Do not log secrets or conversation content by default.
- Prove one agent locally before expanding placement or capabilities.

Caller disconnect stops waiting, not agent work. Explicit cancellation must wait
for underlying execution to settle. Shared context is not caller isolation.

## Security and implementation constraints

The provisioning service's container-management access is privileged. Keep it
out of agent containers, along with gateway administrative credentials. Agent
credentials must be injected privately, never baked into images or committed.
Container execution and filesystem access need an explicit security policy;
a working directory alone is not a sandbox.

Use supported Pi Durable and A2A SDK interfaces. Pin dependencies and verify
against the chosen published package: upstream main may differ even when its
manifest carries the same version. Durable state does not guarantee exactly-once
external side effects; tools need appropriate replay and reconciliation policies.

## Not in the first version

Streaming, artifacts, fleet placement, a browser UI, package marketplaces,
autonomous schedules and migration of populated Copilot minds are deferred.
Genesis changes should remain minimal; this repo owns hosting and runtime adapters.

## Product requirements

See [prd.md](prd.md) for MVP requirements, acceptance criteria and deferred scope.
Implementation slices and dependencies are tracked in
[GitHub issues](https://github.com/ianphil/genesis-durable/issues).

## Development

Before implementation, review or dependency changes, read
[CONTRIBUTING.md](CONTRIBUTING.md) for SDK-first contracts and verification gates.
Coding agents must also follow [AGENTS.md](AGENTS.md).

## Implementation baseline

See [MVP contracts and prerequisite findings](docs/mvp-contracts.md) for issue #1's
selected artifacts and API/bootstrap/task policies. The narrowed #2 runtime and
current default model (Haiku 5.5) are documented in [runtime setup and evidence](docs/runtime.md).
Docker access is now operational; historical prerequisite findings are not current blockers.

## Deploy and operate

Start with the [single-host deployment guide](docs/deployment.md): build the pinned
image, prepare private data/secrets, run the Docker-hosted provisioner and configure
one host Tailscale Serve ingress. Agents share a private Docker network; they do not
receive the Docker socket or gateway admin credentials.

- [Demigod deployment and image publishing](docs/demigod-deployment.md)
- [Administrative API and lifecycle](docs/provisioner.md)
- [A2A listener](docs/a2a.md) and [fleet gateway routing](docs/gateway.md)
- [Backup/restore, diagnostics and security boundaries](docs/operations.md)
- [MVP acceptance evidence and remaining risks](docs/acceptance.md)

Development checks: `npm ci --ignore-scripts`, `npm run typecheck`, `npm test`.
Use a supported Node version (22.19+; Node 25.9 tested, Node 26 outside the SQLite
addon's supported range), and build the native SQLite addon with
`npm rebuild better-sqlite3` after installation. Docker build handles this itself.

This is a private single-host development deployment, not production hardening.
HTTP-over-Tailscale is not production TLS. Authorized callers share agent history.
See [memory policy](docs/memory-policy.md) for Markdown, transcript and active-context continuity boundaries.
