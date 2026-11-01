# Contributing

## Ownership and contracts

| Contract | Authority | This repo's responsibility |
| --- | --- | --- |
| Genesis mind/template | [Genesis](https://github.com/ianphil/genesis), at the revision resolved for creation | Reuse identity, knowledge and portable instructions; adapt Copilot bootstrap/tool assumptions. Record provenance and preserve evolved files. |
| Durable execution/state | Chosen published [Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable) package, exports and matching documentation | Supply the host, registry, environment, providers and Genesis instructions. Delegate conversations, execution, storage, recovery, queues and compaction to Durable. |
| A2A wire semantics | [Spec 1.0.1](https://github.com/a2aproject/A2A/blob/v1.0.1/docs/specification.md) and [protocol definitions](https://github.com/a2aproject/A2A/blob/v1.0.1/specification/a2a.proto); wire version `1.0` | Define truthful capabilities and map the external agent/context/task identities to persistent Durable work. |
| A2A implementation | Chosen official SDK's supported exports and interfaces | Supply execution/storage adapters and HTTP safety; delegate discovery, codecs, dispatch, transport framing and errors to the SDK. |
| Gateway administration | Deployed LiteLLM administrative interfaces and observed routing/auth behavior | Register ready agents, manage owned grants/records, separate caller/upstream/admin credentials and verify the actual gateway path. |
| Containers and provisioning | Container engine's supported lifecycle/storage interfaces | Authenticate administrative operations, create isolated agent workspaces, manage readiness and process supervision, and preserve data on replacement. |
| Operations | Our documented health, logging and access policy | Correlate provisioning, A2A and Durable identifiers; expose safe actionable diagnostics without default content logging. |

A spec defines semantics; an SDK implements mechanics; a gateway adds routing and
policy. Success in one does not prove the others. Reproduce mismatches through
normal SDK workflows and identify the responsible contract before adding a workaround.
The regular pi CLI extension API is not the Durable extension API.

## SDK and artifact discipline

Follow the preference order and exception requirements in [AGENTS.md](AGENTS.md).
Inspect exported task-store, executor, document and hook interfaces before
inventing persistence adapters or orchestration layers. Pin dependencies in package
metadata and the lockfile when code is introduced. Record the base image and
resolved Genesis revision; package, image, template and wire versions are independent.
Use matching release documentation: upstream main is research evidence, not proof
that an API exists in the installed package.

The runtime registry holds executable definitions; persisted names do not recreate
code after restart. Install compatible definitions before resuming work, and test
pending-task compatibility when changing them. Implement custom tasks only for
application behavior Durable does not already provide.

Gateway registration DTOs are not native Agent Cards. Keep gateway translation
separate from protocol handling. A workaround in pi-a2a is evidence to investigate,
not code to copy unconditionally; prove it necessary for the chosen integration,
link upstream tracking, and remove it after the deployed path passes without it.

## Provisioning and bootstrap

Creation takes name, character, purpose and model up front. Resolve the template
once and record the revision; the generated workspace has no `.git`. Bootstrap
must adapt the template's remote removal, self-overwrite, dependency installation,
commit/push skills and missing optional capabilities. Treat downloaded prompts,
skills and executable code as separate trust decisions.

Use a disposable workspace until generated artifacts validate and the agent is
ready. Publish discovery only after readiness; failed creation needs an inspectable
outcome and ownership-aware cleanup. Define retry/idempotency and partial-failure
behavior before accepting creation requests. Keep existing agent data intact;
template/image updates are not permission to re-bootstrap or overwrite a mind.

## Persistent work and lifecycle

One shared conversation per agent is the initial policy. Authorized callers share
its history and task control; context IDs are not isolation. Preserve stable agent
identity, A2A task IDs, Durable conversation/submission IDs and their associations
across container restart. Inspect SDK persistence interfaces and use Durable state
where suitable; avoid a second scheduler or parallel lifecycle implementation.

HTTP lifetime is independent of work. Explicit cancel must reach the correct
underlying work and await settlement; completion/cancel races need defined outcomes.
Stopping/restarting the container is not automatically cancellation of accepted
work: Durable may resume it. Define queued-work handling, graceful shutdown and
client-visible recovery behavior explicitly rather than borrowing CLI semantics.

SQLite and workspace files persist outside the container's writable layer, with
one runtime owning each database. Durable commits do not atomically include
external filesystem, Git, messaging or HTTP effects. Classify replay safety and
reconcile uncertain outcomes; submission request IDs alone do not ensure exactly-once
external actions. Compaction manages conversation context, not Genesis's curated
Markdown memory. Backup/restore must account for both and SQLite's WAL.

## Security and operations

The administrative API is authenticated and private. Container-engine access is
host-privileged: keep it and gateway admin credentials out of agent containers.
Inject only the model/upstream credentials an agent needs through private runtime
configuration. Explicitly define filesystem mounts, UID, network access and tool
permissions; cwd and prompt instructions do not enforce isolation.

Operational logs should be structured, bounded and correlated with agent,
provisioning, A2A and Durable identifiers, including artifact revisions. Log safe
state transitions, timing and error categories. Treat transcripts/state as sensitive
content with separate access and retention; omit prompts, memory, tool output,
authorization headers and secrets from default logs and API errors.

Separate liveness from readiness and report recovery, storage, bootstrap and
registration failures. Use stdout and bounded container-log rotation initially;
add a logging stack only when a demonstrated need exceeds that. Production A2A
requires TLS; any private-network exception must be explicit, not called full
transport conformance. Shared gateway, firewall and deployment changes need approval.

## Verification gates

Before claiming a slice works:

1. Run the checks provided by the project and add focused tests for changed policy.
   Until scripts exist, report the actual checks rather than inventing commands.
2. For bootstrap changes, use a synthetic mind: verify required artifacts,
   no Git metadata or destructive side effects, safe failures and preservation
   on retry. Inspect generated files; successful model output alone is insufficient.
3. For Durable integration, test the pinned package with persistent storage:
   reopen, queued work, duplicate requests, interrupted tools and cancellation.
   Distinguish graceful close/reopen from a killed-process recovery test. Test
   file-backed identity/memory with real tool evidence, not only scripted answers.
4. For A2A changes, use official SDK discovery → send/start → get/list/cancel →
   result retrieval directly and through the actual LiteLLM card. Verify auth,
   context, ordering and task identity after restart. Polling is not streaming proof.
5. For container/network changes, test gateway-to-container reachability and a
   caller on another machine. Verify replacement preserves data, readiness gates
   registration, and agent containers lack administrative credentials/engine access.
6. For operations changes, exercise a failure and confirm actionable correlated
   diagnostics without secret/content leakage; verify log bounds and health states.
7. Clean only test-owned containers, workspaces, registrations and grants. Preserve
   failure evidence safely and report anything intentionally retained.

Report what passed, what was not tested and remaining risks. Source inspection,
faux-model tests, live model tests, crash recovery and gateway acceptance are
different evidence. Capability claims must match the evidence, not the roadmap.
