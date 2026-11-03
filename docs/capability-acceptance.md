# Capability acceptance — issue #11

Observed 2026-11-03 on ais-mac-mini; source runtime revision `31aaf41`.

## Automated/local

Typecheck/build and 19 tests passed. Tests include array defaults/normalization,
unknown values, combined bundles, empty selection, legacy records, runtime
write/edit boundaries including traversal and symlink escape, actual SDK bash,
conversation identity across reopen/selection changes, legacy-running upgrade
rejection, and desired/active distinction after failed drain. Docker build passed.
Publish run `41657019163` succeeded and the signed deployment updated provisioner.

## Live Jupiter

- Completed A2A exchange to establish idle maintenance and recall existing sentinel.
- Stopped Jupiter through the API, waited for stopped, stopped provisioner, copied
  complete private data root to a cold backup, then restarted provisioner.
  Backup retained privately at
  `/Users/ianphil/.local/state/genesis-durable-backups/issue11-20261103-094750`.
- Set server agent-image configuration to pre-pulled compatible image ID
  `sha256:c9498fe4042b87c8040e4e08100f7f50662bbe70308c47ea6e14ff6a1b179a04`.
- PUT capabilities `["coding"]`; stopped intent preserved. Started Jupiter;
  inspection reported ready, desired/active coding, tools read/write/edit/bash.
  Existing UUID/workspace/state and canonical mind preserved; no regeneration.
- Via fleet A2A Jupiter used actual write/edit/read tools on `capability-check.md`
  and bash `pwd` plus harmless `printf` into `capability-shell.txt`.
  Host independently read both files and verified expected contents.
- Restarted agent container; A2A reread both files and recalled the earlier
  conversation-only sentinel. Tools remained available.
- Inspected container: workspace writable, root read-only, no Docker socket or
  administrative secret mounts.
- Exercised running PUT downgrade to read: ready, active read, workspace read-only.
  Exercised running PUT upgrade to coding: ready, active coding, workspace writable.
  This used new authenticated drain-and-replace path with no active conversation.
  Subsequent A2A read both files, recalled sentinel, and listed all four tools.
- Two harmless capability test files intentionally retained in Jupiter workspace.

## Evidence boundaries / remaining work

Final live checks: requested a workspace downgrade while Jupiter executed a
20-second bash command. The admitted A2A task completed successfully, its output
file was independently verified, and replacement reached ready/workspace. Re-enabled
coding. Then requested a downgrade during a 30-second tool call, observed the
provisioner draining stage and killed only the provisioner. Explicit restart resumed
the pending update, the A2A task completed (including result lookup after replacement),
and ready/workspace was restored. The recovery file independently contained the
expected marker. Restored ready/coding afterward.

Fault injection at every update crash boundary is not exhaustive. Local tests
cover failure reporting but not every container replacement race. Coding bash is container-wide,
not workspace-only; it can access its readable model/listener credentials and state
and allowed network routes. It has no host-admin capability simply because Ian
requests one. Tools are not exactly-once external transactions.

The initial read call in one response returned no content; a repeated absolute-path
read and independent host read succeeded. No general read-transport fix is claimed.

The illustrated `meet-jupiter.html` now describes coding tools, current container
boundaries and outbound A2A as a future capability. No claim of automatic note
curation was added. Busy/recovery test marker files intentionally remain in the
workspace alongside the two earlier harmless capability check files.
