# Operations and recovery (#7 — in progress)

## Content-free troubleshooting

Runtime events: runtime_open/runtime_closed with conversationId; durable_report
with fixed category. A2A events: a2a_submission with taskId, contextId,
submissionId, conversationId; a2a_settled with task/context/conversation/state.
Provisioner transitions include agentId, operationId, stage/state and safe category.
Entrypoints add timestamp/severity. Artifact provenance is in provisioner inspect
and private workspace provenance.json. Do not log full inspect objects, headers,
provider exceptions, tool arguments/results or transcript to operational stdout.

Use identifiers to correlate events; access private transcript only through
separately authorized diagnostics. Task input/history and final answer are
intentional authorized A2A content, not operational logs. These stores and backups
are sensitive. Runtime open/close events include durationMs and the pinned Durable version;
provisioned runtime events include agentId. A2A submission events bridge task IDs
to submission/conversation IDs. Per-phase/bootstrap timing is not yet uniform.

Sentinel test covers provider error/private prompt not leaking to SDK console
warnings/errors or terminal error status on a controlled provider failure. Existing
bootstrap/provisioner tests cover safe generated-failure records and safe inspect.
Unexpected SDK/database error paths are not comprehensively sanitized by these
checks; never claim generic full error redaction.

## Cold backup (simplest supported procedure)

1. Stop the agent through authenticated provisioning API. Verify stopped, registration
   withdrawn, and container actually stopped. Do not equate caller disconnect with stop.
2. Stop provisioner before copying its SQLite or restoring any metadata; ensure no
   migration helper/runtime/process owns the stores. One owner is mandatory.
3. Copy the complete private data root to access-controlled backup storage, preserving
   permissions: provisioning DB, agents/workspaces, state (both SQLite stores and any
   WAL/SHM files), listener keys and provenance. Never copy only live *.sqlite files.
   Back up external secrets separately under the operator's secret policy, not Git.
4. Record image digest/package versions and namespace/network/ingress configuration.
   Encrypt backups as required by the deployment's storage/access policy.
5. Restore into an isolated location with the original owner permissions. Do NOT start
   the original and restored agent concurrently or publish duplicate registrations.
   Keep the same compatible image/schema; redirect host bind paths deliberately.
6. Verify original root/task IDs, old results, canonical memory and new work before
   switching production ownership. Regenerate runtime tokens only with coordinated
   registration updates. Never automatically bootstrap an evolved restored workspace.

Automated cold-copy restore checks preserve workspace + Durable/A2A SQLite, reopen
same root and old task results/request IDs, and execute a new read afterward.
This is process-close/copy/restore evidence, not live backup, power-loss proof or
an independently tested production disaster-recovery deployment.

## Memory/compaction

Bounded synthetic test uses official root.compact, waits for task/summary placement,
asserts a compaction entry exists while original historical answer remains stored,
and verifies canonical Markdown unchanged and readable after restore. It uses a
scripted summary, not a real-model semantic-fidelity test. Automatic threshold
triggering and real-model summary quality still need acceptance. #9 separately
tracks instructions distinguishing canonical memory from persistent transcript.

## Isolation, retention and remaining validation

Only read tool enabled with realpath containment; regression covers external
symlink denial. Read-only mind mounts are required to prevent path-swap races.
Agent resource/mount/non-root configuration was inspected in live #5/#6; no engine
socket/admin keys. Operator/launcher must enforce single owner; there is no
cross-process lock. Do not run competing provisioners or databases.

Docker local log rotation is configured at 10 MiB x3 in spawned containers. A
test-owned container using the same driver with smaller 1 MiB x2 bounds emitted
about 6 MiB; docker logs retained about 1.22 MiB, demonstrating rotation. Container
was removed. Exact 10 MiB x3 production-volume behavior was not load-tested. Private transcript retains data;
10,000-task/soft disk admission guards are not a full storage quota. Set backup and
retention access policies before real private minds. Secure egress filtering and
production TLS remain deployment responsibilities, not provided by Docker cwd.

Storage-open failure test rejects a directory used as database. A Proxy over the
supported Storage interface injects a mid-run commit I/O failure: submit rejects,
harness.closed reports failed, and lifecycle logs contain session_failed but neither
sentinel error content nor prompt. This is interface-level failure injection, not
physical SQLITE_FULL. Actual SQLITE_FULL, live HTTP readiness during storage failure,
automatic compaction and concurrent-owner rejection remain unverified. Do not close
#7 on this partial evidence alone.
