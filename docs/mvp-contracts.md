# MVP implementation contracts — issue #1

Status: selected implementation baseline, not implemented behavior. Read with
[prd.md](../prd.md) and [CONTRIBUTING.md](../CONTRIBUTING.md). Inspection performed
2026-11-01. No containers, bootstrap, model calls or gateway mutations were run.
Existing README/PRD/contributor changes in the working tree were left intact.

## 1. Artifact baseline and primary evidence

Use these exact versions when introducing code; commit the resulting npm lockfile
in #2/#4, including every transitive dependency. This document selects artifacts;
it is not a substitute for a lockfile. Do not copy upstream main APIs.

| Artifact | Selected version | Evidence |
| --- | --- | --- |
| `@earendil-works/pi-durable` | `1.4.0` | Published README, `dist/index.d.ts`, `dist/harness/types.d.ts`, `dist/documents.d.ts`, SQLite exports inspected locally |
| `@earendil-works/pi-ai` | `1.4.0` | Installed manifest, `dist/models.d.ts`, provider exports inspected |
| `@earendil-works/chord` | `1.4.0` | Installed manifest; Durable's matching README uses `BACKGROUND_CONTEXT` |
| `@a2a-js/sdk` | `1.3.0` | Published README, server/client/database exports and declarations; matching tag source/examples inspected |

Durable tarball SHA-256:
`6d4dedd7a342151bca8b962f35a6231312cb10e5226796734e6644ad02f48224`.
A2A tarball SHA-256:
`9134ffc94fe2741170020db88d676734e00b87992b15d6d274027afbb318f3a3`.
A2A npm integrity:
`sha512-OpK4nygUnLKlpTFZlM2IrYu7f3c/B7c4u4Z14+vgMq24lEINTVCxH/BqZx+GL92rNf7CoBL5oTP5UhNsl75yyg==`.
Durable npm integrity:
`sha512-EtIyXH1MBSXdJSkodmy+CYXuwfve3gPrD4GNCZ0XmuRWLPupwRlNQ7fdaXjRcLoKb6SWkT/yEzK+sMmrqvYK+Q==`.

Sources:
- [Published Durable tarball](https://registry.npmjs.org/@earendil-works/pi-durable/-/pi-durable-1.4.0.tgz), extracted at `/tmp/pi-durable-package-review/package`; matching installed package under its `node_modules`.
- [Published A2A tarball](https://registry.npmjs.org/@a2a-js/sdk/-/sdk-1.3.0.tgz), extracted at `/tmp/genesis-durable-issue1/package`.
- A2A npm `gitHead` and tag `v1.3.0` both resolve to `29417a5bb4038f804f310ce4fffd267a9375aa90`.
- [SDK persistent-store guide](https://github.com/a2aproject/a2a-js/blob/29417a5bb4038f804f310ce4fffd267a9375aa90/docs/persistent-stores.md), [database example](https://github.com/a2aproject/a2a-js/blob/29417a5bb4038f804f310ce4fffd267a9375aa90/src/samples/agents/database-agent/index.ts), [cancel example](https://github.com/a2aproject/a2a-js/blob/29417a5bb4038f804f310ce4fffd267a9375aa90/src/samples/agents/cancellable-agent/agent_executor.ts).
- [Default handler](https://github.com/a2aproject/a2a-js/blob/29417a5bb4038f804f310ce4fffd267a9375aa90/src/server/request_handler/default_request_handler.ts).
- [A2A 1.0.1 changes](https://github.com/a2aproject/A2A/releases/tag/v1.0.1): HTTP media-type preference, transcoding errors and TaskStatus corrections. SDK README claims spec 1.0.0, not 1.0.1: compatibility remains a #4 test gate. Select JSON-RPC/wire `1.0`, no legacy compatibility, REST or gRPC initially.

Durable requires Node >=22.19.0; SDK requires >=20. Use a supported Node 22
patch >=22.19 for the first image, pinned by digest in #2. The local Node
26.12.0 is inspection tooling, not evidence for the eventual image. Container
base digest and native SQLite driver compatibility remain build-time gates.

## 2. Administrative HTTP contract (#5)

Private bearer authentication on every route; constant-time comparison against a
privately injected random token (at least 32 random bytes), never query-string
auth. Initially one administrator role; no caller-specific tenancy. Bind loopback
by default, use an approved TLS ingress for remote administration. No CORS.
JSON only; reject unknown fields, oversized bodies (>32 KiB), invalid UTF-8/JSON,
and arbitrary model URLs, host paths or container options.

| Method/path | Request | Success |
| --- | --- | --- |
| `POST /v1/agents` | `{requestId,name,character,purpose,model}` | `202` new creation; `200` same recorded request replay |
| `GET /v1/agents?limit=50&cursor=…` | limit 1–100, opaque cursor | `200 {agents:[summary],nextCursor:null|string}` |
| `GET /v1/agents/{id}` | UUID | `200` inspect record |
| `POST /v1/agents/{id}/start` | `{}` | `202` reconciling; `200` already ready |
| `POST /v1/agents/{id}/stop` | `{}` | `202` reconciling; `200` already stopped |

`requestId` is a UUID; `name` matches `[a-z][a-z0-9-]{0,47}`;
character and purpose are nonempty strings, each <=8 KiB UTF-8; model is an exact
approved alias, <=128 ASCII characters. Do not silently normalize names or trim
payloads after computing identity. Reject leading/trailing whitespace in names.
Gateway name is `gd-<private-deployment-namespace>-<name>`; validate its final
length against the deployed gateway before enabling create. Namespace is fixed
for a deployment, not supplied by requests. IDs are independent random UUIDs.

Persist request UUID, validated-payload SHA-256, agent ID and operation intent in
one provisioning SQLite transaction before acknowledgment. Compare fixed-order
validated fields, not raw JSON formatting. Same ID/different payload: `409`.
Name collision: `409`, including failed/stopped records; never adopt somebody
else's registration. No deletion/name reuse endpoint in MVP.

Summary: `{id,name,model,state,stage,operationId,createdAt,updatedAt}`.
Inspect additionally returns `desiredState`, `failure:null|{code,correlationId}`,
`provenance:{templateRevision,imageDigest,packages}` and stable `a2aName`.
No character/purpose, host paths, raw registry objects, credentials or transcript.
State: `creating|ready|stopped|failed`. Stage:
`accepted|template|bootstrap|validate|runtime|publish|stopping|stopped|failed`.
Start/recovery uses `creating` plus its current stage; this is not re-bootstrap.
During stop, readiness becomes false immediately, desiredState becomes stopped,
and state cannot remain ready. Reject incompatible concurrent lifecycle requests
with `409`; retries for the same desired state return the same operation.

Errors: `{error:{code,correlationId}}`; `400` invalid input, `401` auth,
`404` unknown ID, `409` conflict, `413` body limit, `503` unavailable/capacity.
Fixed safe codes, no raw exception strings. Persist lifecycle intent, then
reconcile owned containers and gateway resources after provisioner restart.
Provisioner alone opens its database; no general workflow engine.

## 3. Mind/bootstrap contract (#2/#3)

Per-agent persistent data: `workspace/`, `state/durable.sqlite`,
`state/a2a.sqlite`, and private provenance/config metadata. Provisioner state is
separate. Runtime alone owns agent stores; replacement stops the old owner before
opening them. No database or workspace in the container writable layer.

Required generated files:
- `SOUL.md`: personality and identity.
- `AGENT.md`: portable role/operating instructions, no Copilot activation/YAML.
- `.working-memory/{memory,rules,log}.md`.
- `mind-index.md`: links to actual initial knowledge/memory files.

Explicit host loading: a stable prompt section supplies SOUL/AGENT; instructions
require reads of the three memory files. Canonical Markdown is not a Durable
summary. Skills are reviewed portable Markdown, listed by name/description/path
and loaded on demand through read. Initially no skills enabled: current commit
and daily-report skills require unavailable Git/Copilot/external integrations.
Never concatenate all `.agent.md` files or execute template shell instructions.

Fetch trusted template latest once, record its immutable revision before use;
private fetch credentials stay with provisioner. Reject absolute paths, `..`,
links, devices and Git metadata; cap compressed archive at 10 MiB, expanded at
50 MiB/2,000 files. Bootstrap stages in a new private directory, generates only
the fixed required paths (<=64 KiB each, <=512 KiB total), validates UTF-8,
nonempty content, links and absence of Git metadata, then publishes atomically.
Generation returns structured file content, not arbitrary paths/commands.
Bound bootstrap at 5 minutes, 3 generation attempts, 16,384 output tokens total;
record usage where supplied. These limits are policy, not measured cost bounds.
A hard monetary cap requires provider accounting and is not claimed.

Durably mark validated bootstrap completion before runtime starts. Recovery
reuses a validated workspace, never overwrites it. Incomplete staging is private
and inspectable; explicit retry may replace only incomplete staging. Failed
records do not auto-publish or regenerate an evolved mind.

## 4. Model and security baseline

Initial validation candidate alias: `gpt-oss-20b`, via private LiteLLM
OpenAI-compatible chat-completions access. Local pi catalog reports context
131,072 and max output 32,768 tokens. These are configuration observations,
**not independently verified provider limits or tool-call acceptance**. Do not
accept create for this alias until #2 verifies gateway metadata, credentials,
real-model tool use and compaction. Until then the active production allowlist
is empty; faux provider is test-only. No subscription credential reuse assumed.

pi-ai `createProvider` is exported from `/models`; use its supported provider
configuration and chat-completions implementation, not `openaiProvider()` blindly:
the installed latter returns `Provider<"openai-responses">`. Exact adapter setup
is a #2 probe. No new gateway routes/models are requested by this slice.

Candidate compaction configuration: enabled, reserve 8,192, keep recent 16,384,
background 8,192 tokens; cap generated answer to 4,096 tokens. Set model retries
2, retry-delay cap 10 seconds, stream timeout 120 seconds, restartLimit 3;
verify configuration semantics in #2. Published declarations expose no maxTurns
setting: use a supported GenerationTask hook to count requests durably and end
work at 32 model requests, with a regression test; do not invent a main-only
setting. Model retries and compaction also consume budget.

Docker shared image, non-root UID/GID, read-only rootfs, drop all capabilities,
no-new-privileges, no engine socket/host networking/privileged mode. Start with
1 CPU, 1 GiB RAM, 128 PIDs, 64 MiB tmpfs, and private per-agent mounts. Initial
fixture is read-only and only read tool installed. Memory writes/edit/bash need
an explicit later policy expansion and tests; cwd is not enforcement. Never
mount provisioning secrets or another mind. Inject a scoped model token and
per-agent listener token privately; the model tool environment cannot read them.
This requires separate credential/filesystem handling, not simply prompt rules.

Private bridge network; publish only listener port to lilarchy's Tailscale IP,
with authenticated ingress restricted to gateway source and egress restricted
to the model gateway/DNS needed. Enforcement mechanism must be verified before
untrusted tools are enabled. No arbitrary internet/shell by default. Structured
stdout uses allowlisted fields only; Docker local log driver with 10 MiB x 3
files is the proposed bound. Do not blindly export provider errors or Durable
telemetry diagnostic messages, which may contain content.

## 5. A2A/Durable persistence and settlement (#4)

Use SDK `DefaultRequestHandler`, native JSON-RPC Express handler/card handler,
`AgentExecutor`, `AgentEvent`, and `DatabaseTaskStore` (Kysely SQLite dialect,
matching example). Pin Kysely/driver/Express when code is introduced. Use the
SDK migrations as an explicit deploy step. Do not build another TaskStore when
an exported persistent store already exists. Configure `ownerResolver` to the
fixed agent scope after authentication so authorized callers share tasks;
default SDK per-user ownership would contradict the shared-context contract.
Reject arbitrary tenants and foreign context/task IDs.

Durable exported seams: `Harness.open`, `root`, `resume`, `close`,
`root.submit`, `harness.submission`, `Submission.wait/abort`, `root.abort`,
`root.commit`, `defineDoc/defineDocFamily`, and SQLite `/storage/sqlite/node`.
Registry definitions must be installed before resuming. Published `wait` settles
an answer, not arbitrary background work; no `afterRun` hook exists. MVP enables
no background/subagent/user-defined run-end work. Verify idle/ownership boundary
before reporting any terminal cancellation, and disable admission while settling.

Persist an application association (in SDK database application tables) containing
agent/context/task/message IDs, payload hash, deterministic Durable request ID,
submission ID, admission phase, cancellation intent and terminal result pointer.
Use unique `(agent,messageId)`; JSON-RPC request IDs are transport correlation,
not execution deduplication. No task follow-up turns initially: each send creates
one task; same message ID/same payload resolves it, changed payload conflicts.
Persist intent before submit; submit using `requestId = a2a:<messageId>`; save
submission ID before acknowledging acceptance. Recover uncertain admission by
resubmitting the identical input/requestId, not scheduling a parallel execution.
SDK snapshots and Durable admission are separate commits: reconciliation is
required, not an atomic/exactly-once claim. Never replay unsafe external effects.

One stable shared A2A context maps to the persisted Durable root. Use
`whenBusy: "reject"` plus an admission lock: at most one unsettled submission,
no steers or queued merging. Capacity rejection is explicit and creates no
accepted work. This deliberately avoids conversation-wide abort affecting a
second task. Durable remains the execution owner; no application scheduler.

Cancellation: persist intent, withdraw an unplaced submission with
`Submission.abort`; for already-placed work invoke `root.abort` and await
settlement/idleness. If a successful answer won the race, keep completed and let
SDK report not-cancelable; never replace it with canceled. Emit canceled only
after actual execution settles. HTTP wait cancellation never reaches these APIs.
Stop withdraws readiness/publication then `Harness.close`, preserving pending
work for resume; it does not call abort. Close can hang on code ignoring abort;
use a bounded process grace period and document subsequent kill as recovery.

**SDK trap found by inspection:** default `cancelTask` with no live event bus
writes canceled directly without invoking executor. On startup, restore a bus
and settlement observer for every nonterminal persisted task *before readiness*;
reconcile Durable results and persisted cancel intents first. Keep buses for live
tasks. A test must prove cancellation after restart reaches the real work; if
composition cannot enforce this, block #4 and document/test a supported handler
exception rather than copying protocol mechanics. The cancel sample's in-memory
Set is illustrative only, not a durable cancellation strategy.

SDK executor must publish task/message first, even on follow-up; publish text
result in terminal status message (no artifact/streaming/push capability). SDK
stores task snapshots; executor/observer bridges committed Durable outcomes.
Default synchronous event bus avoids deferred-delivery settlement complexity.
Blocking/nonblocking send share the same admitted work. Actual gateway behavior,
restart reconciliation and SDK 1.0.1 compatibility remain integration tests.

Retention: keep accepted task snapshots/results/dedupe records for agent lifetime
in MVP, bounded at 10,000 tasks and 1 GiB agent state; reject new work before
capacity, never evict existing accepted work. Max input 16 KiB, text result
64 KiB, page size default 50/max 100; retain only input and final message in A2A
history, tool transcript stays in Durable. Count failures/deduped identities in
the cap; retries of existing work still resolve. Reserve disk headroom, check
before admission and apply a volume/storage guard; filesystem failure after
acceptance is a recoverable failure, not permission to drop mappings. No promise
of indefinitely growing transcript; capacity requires operator intervention,
not silent truncation. List tokens/order remain SDK-owned and must be tested.

## 6. Local inspection and transport boundary

Observed with read-only commands:
- Node `v26.12.0`, npm `12.2.1`, Linux amd64; Docker CLI `29.9.2`.
- `docker version`/`docker info`: socket permission denied, no server information.
  Socket root:docker mode 0660; current user not in docker group.
- `systemctl is-active docker`: inactive. No `docker0` interface. This does not
  prove whether an alternate/rootless engine exists; no podman executable found.
- Tailscale IPv4 present. Host request to gateway `/health/liveliness` returned
  HTTP 200. This proves host-to-gateway HTTP only, not authentication/model
  availability or gateway-to-container reachability.
- SDK inspection/downloads under `/tmp/genesis-durable-issue1`; no installs in
  this repo, privileged commands, service changes, registrations or containers.

Proposed development transport exception: HTTP bearer-authenticated A2A listener
bound only to lilarchy Tailscale IP and restricted to gateway source. Tailscale
protects the network leg; this is **not production A2A TLS conformance**. Production
requires TLS. Actual container port publication, source filtering and gateway
reachability require approval and a #6 live probe. Do not infer inbound access
from successful outbound health request.

## 7. Gates and next work

Issue #1 delivers contracts and inspected SDK seams, not runtime proof. Outstanding:
1. Operator approval/provisioning of a usable Docker engine; do not add this
   session to privileged groups or start services implicitly.
2. #2 pins image digest, full dependency graph and validates Node/native drivers,
   real model metadata/tool use, compaction, request budgets and close/reopen/kill.
3. #3 validates template access and generated files under bounded bootstrap.
4. #4 proves native SDK spec compatibility, persistent tasks/deduplication,
   post-restart cancellation and safe shared owner scoping.
5. #6 validates actual gateway DTO/auth/grants, forwarding quirks and inbound
   networking. Existing pi-a2a workarounds are evidence, not adopted code.

No test runner/build exists yet. Checks here were package/source/export inspection,
artifact hashes, npm metadata, read-only host probes and unauthenticated gateway
health. No live-model, storage execution, container, process-kill, TLS or end-to-end
A2A acceptance claim is made. Do not close downstream gates using this document.
