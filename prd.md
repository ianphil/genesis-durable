# Genesis Durable — MVP PRD

**Status:** proposed implementation plan; no runtime is implemented.

## 1. Product and outcome

Create persistent Genesis agents from a character and purpose, run each in a
container using the official Pi Durable harness, and communicate with them through
A2A via LiteLLM. Keep Genesis itself minimally changed: this repository owns the
host, bootstrap adapter, provisioning API, container image and A2A integration.

The first deployment targets a single host, lilarchy. The project is public;
agent data, credentials and deployment-specific configuration are private.

**MVP success:** an authorized administrator creates an agent; a caller on another
machine discovers it and starts work through LiteLLM; the agent uses its generated
identity and memory; restarting/replacing its container preserves identity,
conversation, task lookup and results. An operator can diagnose a failed creation
or execution using correlated logs without default disclosure of private content.

## 2. Users and primary journey

- **Administrator:** creates, inspects, starts and stops hosted agents.
- **A2A caller:** discovers an agent, sends work, polls results or explicitly cancels.
- **Operator:** checks readiness, investigates failures and restarts containers.

Primary journey:

1. Administrator submits name, character, purpose and model with a creation request ID.
2. API returns an agent ID and asynchronous creation state.
3. Provisioner resolves the latest Genesis template to an exact revision, prepares
   a persistent workspace and performs controlled model-driven bootstrap.
4. Bootstrap validates generated artifacts; runtime opens its durable store.
5. After local readiness and gateway registration/grants succeed, agent becomes ready.
6. Caller discovers the stable A2A name and submits work to its shared conversation.
7. Caller receives an answer or Task ID, gets/lists tasks and can request cancellation.
8. Container restart/replacement reopens the same store/workspace and reconciles
   registration and pending work without bootstrapping again.

## 3. Agreed scope and constraints

- Character and purpose arrive up front; no interactive awakening interview.
- Provisioned workspaces contain **no Git repository**. Fetching template content
  is not permission to initialize Git, detach remotes, commit, push or create repos.
- One stable identity and **one shared conversation per agent**. Authorized callers
  share history and task control; this is not multi-tenant caller isolation.
- One shared base image, with per-agent persistent data; no per-agent image build.
- Official Pi Durable owns execution, queues, persistence, recovery and compaction.
- Official A2A SDK owns codecs, protocol dispatch, transport and task machinery.
- Administrative operations use the provisioning API; conversations use A2A, not
  a second custom chat API.
- Dependencies and image artifacts are pinned. Template creation resolves latest
  once and records the revision. Existing agents are never silently re-bootstrapped.
- Follow [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## 4. Architecture and ownership

```text
Administrator → private authenticated provisioning API
                  ├─ persistent agent/provisioning records
                  ├─ template fetch + bootstrap
                  ├─ container lifecycle + gateway registration/grants
                  └─ shared agent image
                       ├─ Genesis instructions + identity + memory
                       ├─ Pi Durable harness + SQLite
                       ├─ SDK-backed authenticated A2A listener
                       └─ structured stdout logs + health endpoints

Authorized callers → LiteLLM A2A gateway → agent listener
```

The provisioner owns container-engine and gateway administrative credentials.
Agent containers receive only their required runtime/model/listener credentials.
No agent container mounts the engine socket or another agent's workspace.

Each agent's data survives container replacement: generated mind files, Durable
storage, external-task associations and identity/provenance metadata. Storage
layout and minimal provisioning persistence technology are implementation choices;
use supported facilities rather than build a general workflow framework.

## 5. Functional requirements

### 5.1 Administrative API

Provide authenticated create, list, inspect, start and stop operations. Document
request/response contracts, validation, safe errors and idempotency before release.

- Create accepts name, character, purpose, an approved model reference and a request ID.
- Same creation request ID and payload returns the same agent/operation; conflicting
  reuse fails safely. Invalid models/names fail before expensive work starts.
- Names are stable, unique within this provisioner/gateway namespace and separate
  from container IDs. Resolve naming collisions without adopting unrelated agents.
- A durable creation record exposes stage, state, safe failure reason and correlation ID.
- Minimum states: `creating`, `ready`, `stopped`, `failed`. Creating records expose
  their current stage; partial readiness never appears as ready.
- Start/stop are retryable and reconcile actual container state. Stop preserves
  data; it is not destructive deletion or automatic task cancellation.
- Recovery after provisioner restart reconciles unfinished operations and owned
  containers/registrations without duplicating bootstrap or grants.
- API responses omit credentials, raw registry records and private transcript content.

### 5.2 Template and bootstrap

- Fetch trusted Genesis template content at a recorded revision. Fetch credentials
  remain outside generated workspaces; public project does not imply public template access.
- Generate identity, role/operating instructions and the three initial memory files
  from up-front inputs, plus an index where required by the adapted template.
- Adapt Copilot-specific instruction/skill discovery explicitly. Do not execute
  awakening commands verbatim or depend on absent optional extensions.
- Disable/adapt Git-based skills. Capability claims must match installed tools.
- Validate required files and path placement before starting the conversational runtime.
- Bound template extraction/model bootstrap time, output and cost exposure. Treat
  archive paths and model-generated paths/content as untrusted input.
- Failed or retried creation leaves an inspectable outcome without publishing an
  incomplete agent or overwriting a valid evolved mind. Template or image updates
  preserve identity and user knowledge.

### 5.3 Agent runtime and model access

- Minimal host built on the selected published Durable package, not the pi CLI.
  Verify exported APIs against that exact artifact; main may differ from releases.
- Explicitly load generated identity, operating instructions and relevant memory;
  expose portable skill content through a documented, bounded loading policy.
- Use approved LiteLLM model references and private injected credentials. Verify
  accurate context limits and configure Durable compaction for the chosen model.
- Persist one shared conversation; distinguish its transcript from canonical
  Markdown memory. Reopen loads both without resetting identity.
- Provide read/write/edit/bash only where explicitly approved by the runtime's
  tool/security policy. A cwd is not an isolation boundary. Initial validation
  uses read-only synthetic fixtures before granting writes.
- Exactly one runtime owns an agent database. Shutdown flushes/closes supported
  storage cleanly; crash recovery uses Durable rather than application replay loops.
- Bound execution resources and model retries/turns using facilities available in
  the pinned version; do not assume main-only controls exist.

### 5.4 A2A contract

Target **A2A spec 1.0.1 / wire `1.0`**. Advertise only verified capabilities.
Support official SDK discovery, blocking/nonblocking send, get/list tasks with
pagination, explicit cancel and text result retrieval through the actual gateway.

- Stable agent name, shared context and A2A task IDs survive container replacement.
- Persist A2A task ↔ Durable submission associations and enough task/result state
  to recover lookups. Inspect SDK store/executor interfaces before implementing.
- Define the bridge's admission/settlement rules, error mapping and retention.
  HTTP disconnect/timeout never implicitly cancels accepted work.
- Explicit cancellation targets the correct underlying work; report canceled only
  after it settles. Specify completion/cancel races and queued-submission behavior.
- Durable answer settlement and full runtime idleness may differ; inspect the
  pinned runtime and choose the correct terminal boundary for the supported hooks.
- Do not claim exactly-once external side effects. Specify duplicate request handling
  and reconcile uncertain tool outcomes rather than blindly replay unsafe actions.
- Define bounded task listing/history/result retention before release. Completed
  tasks remain retrievable across restart within that documented retention policy;
  exceeding limits fails or evicts explicitly, never silently strands accepted work.
- Gateway-specific registration DTOs/compatibility remain separate from native A2A.
  Reuse verified SDK extension points, not another task scheduler/protocol stack.

### 5.5 Lifecycle and registration

- Listener is authenticated and reachable from the gateway on the approved private
  network; no broad host exposure or privileged networking by default.
- Register only after local readiness; ready requires successful gateway publication
  and required access grants. Reconcile provisioner/runtime/network failures.
- Stop makes the agent unavailable and removes or disables owned discovery records;
  start restores the same identity. Preserve pending work unless explicitly canceled.
- Only mutate registrations/grants proven owned by this provisioner. Serialize
  cross-process grant updates where required by deployed gateway behavior.
- Container replacement is a coordinated ownership transfer, not two simultaneous
  database writers. Record image/template provenance and support a safe rollback
  only where persisted schema compatibility is established.

## 6. Security and troubleshooting

- Private authenticated administration; authenticated A2A ingress and gateway access.
  Authorized callers share agent data; do not present this as user-level isolation.
- Non-root agent runtime, constrained mounts, resource limits and documented network
  and shell/tool policy. Model tools cannot access provisioning credentials or engine control.
- Per-agent private data directories/volumes; SQLite/WAL, transcripts and backups
  are sensitive. Define access, retention and a consistent backup/restore procedure.
- Structured JSON operational logs with timestamp, severity, event, agent ID and
  applicable provisioning operation, A2A task/request and Durable submission/conversation IDs.
- Log bootstrap/lifecycle/recovery transitions, safe failure categories and durations.
  Include image/package/template provenance without credentials or raw payloads.
- Prompts, memory, full provider errors, tool arguments/output, headers and transcripts
  are excluded from default operational logs/API errors. Content diagnostics require
  separate authorized access; content-free error categories remain actionable.
- Structured stdout plus bounded container-log rotation initially. Specify bounds,
  health checks and an operator troubleshooting path; no new logging platform required.
- Liveness means process alive; readiness means it can safely admit supported work.
  Surface storage/model configuration/bootstrap/registration failures distinctly.
- Production A2A requires TLS. Any initial HTTP-over-Tailscale exception must be
  explicitly documented as private development transport, not production conformance.

## 7. MVP acceptance

1. From a clean local setup, create one synthetic agent with up-front inputs through
   authenticated administration; validate artifacts and absence of Git metadata.
2. Same creation request retries safely, including after a provisioning interruption;
   invalid/unauthorized requests create no usable agent or leaked secret.
3. An SDK caller on another machine discovers through LiteLLM and exercises send,
   start, get, paginated list, result retrieval and explicit cancellation.
4. Inspect real tool evidence showing generated identity/memory use. A scripted
   provider validates plumbing only; a real approved model validates the full path.
5. Graceful restart, container replacement and a controlled process kill preserve
   agent identity/context/task IDs; completed results remain retrievable and pending
   work follows documented recovery/replay policy. Same external request does not
   silently create duplicate execution.
6. Controlled long-running work cancels after settlement; completion/cancel races
   produce consistent status/results and leave the agent usable afterward.
7. Stop preserves data and withdraws availability; start restores the same agent.
   Failed bootstrap, gateway outage and storage failure are inspectable/recoverable
   according to documented policy without duplicate owned resources.
8. Verify durable compaction with a bounded test configuration; identity/canonical
   memory remain usable and original transcript remains stored. Exercise backup/restore.
9. Diagnose one provisioning and one execution failure using correlated logs; confirm
   sentinel secrets/private content do not appear in logs/errors and rotation is bounded.
10. Document reproducible operator commands, chosen contracts/limits, test evidence
    and remaining risks. Clean test-owned resources; retain no accidental registrations.

## 8. Non-goals

Fleet placement, streaming, artifacts, browser UI, package marketplace, autonomous
schedules, migration/import of populated Copilot minds, Git/GitHub agent workspaces,
per-caller isolated contexts and transparent exactly-once external effects.

## 9. Decisions to resolve during implementation

- Provisioning API schemas, stable-name namespace and private authentication mechanism.
- Published SDK/runtime versions, container engine/image and supported model metadata.
- Bootstrap artifact contract and minimal supported Genesis skills.
- A2A persistence seam, admission/settlement, idempotency and retention policies.
- Resource/tool/network limits, task recovery on stop/start and backup/restore policy.

Resolve these through the linked SDK/contracts and small probes before expanding
implementation. The initial local host is a validation target, not a promise of
production hardening or multi-host orchestration.

## 10. Delivery tracking

GitHub issues in [ianphil/genesis-durable](https://github.com/ianphil/genesis-durable/issues)
track implementation slices and dependencies:

| Issue | Slice | Depends on |
| --- | --- | --- |
| [#1](https://github.com/ianphil/genesis-durable/issues/1) | Contracts, pinned SDKs and local prerequisites | — |
| [#2](https://github.com/ianphil/genesis-durable/issues/2) | Containerized Durable runtime and SQLite | #1 |
| [#3](https://github.com/ianphil/genesis-durable/issues/3) | Controlled no-Git bootstrap | #1, #2 |
| [#4](https://github.com/ianphil/genesis-durable/issues/4) | Persistent A2A messaging/task bridge | #1, #2 |
| [#5](https://github.com/ianphil/genesis-durable/issues/5) | Provisioning API and lifecycle recovery | #1, #2, #3 |
| [#6](https://github.com/ianphil/genesis-durable/issues/6) | Gateway registration and networking | #4, #5 |
| [#7](https://github.com/ianphil/genesis-durable/issues/7) | Operational/security/recovery validation | #2–#6 |
| [#8](https://github.com/ianphil/genesis-durable/issues/8) | End-to-end acceptance and operator docs | #1–#7 |

Bootstrap and direct A2A work can proceed independently after the minimal runtime.
Each slice must report what was verified, what remains untested and any deviation
from this PRD. Logging and security begin in each implementation slice; #7 verifies
them together rather than introducing them at the end.
