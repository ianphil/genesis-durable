# Genesis Durable

Container-hosted [Genesis](https://github.com/ianphil/genesis) agents powered by
[Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable),
reachable through A2A.

**Status: planning.** No provisioning API, container image or agent runtime is
implemented yet. There are no installation or deployment instructions yet.

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
selected artifacts, API/bootstrap/task policies, observed local blockers and
unverified integration gates. These are implementation decisions, not runtime proof.

## Next validation

1. Verify local container prerequisites and gateway-to-container reachability.
2. Prove a minimal pinned Durable runtime with a synthetic mind and SQLite.
3. Verify instruction/memory loading and controlled bootstrap without Git.
4. Bridge SDK A2A tasks to Durable submissions with persistent identifiers.
5. Test restart recovery, result lookup, cancellation, permissions and safe logs.
