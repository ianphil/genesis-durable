# Memory policy adaptation (#9 — in progress)

Host-owned src/memory-policy.ts distinguishes canonical Markdown, persistent Durable
transcript and active model context. Runtime renders it as a prompt section and
refreshes pi.agent instructions on reopen (without editing mind files). Bootstrap
includes it in generation instructions and rejects several known contradictory
fresh-session/only-Markdown persistence claims. This is not semantic validation of
every paraphrase.

Existing evolved minds must not be re-bootstrapped. Recommended migration: cold
backup, inspect SOUL.md/AGENT.md/memory wording, propose a minimal patch only to
contradictory persistence/capability claims, obtain approval and preserve an audit
copy. Do not regex-rewrite personality or curated knowledge automatically. Runtime
policy is compatible metadata, not permission to overwrite an evolved soul.

Genesis upstream clarification is prepared on branch
`docs/host-neutral-memory-continuity` in the sibling checkout: conversation continuity
depends on host, while Markdown provides curated continuity. No Durable-specific
promises belong upstream. Existing untracked migration research was untouched.
Genesis requires branch + PR; changes are not committed/pushed yet.

Evidence: 15 automated tests pass after changes. First live Haiku test on a private
copy of existing Juniper FAILED: agent still said chat has no durable record and
would likely be lost after replacement, despite new runtime/system instructions.
Private evidence: ~/.local/state/genesis-durable/memory9/evidence.json. This suggests
system policy alone is insufficient on the tested route with contradictory old mind
and history. #9 is not complete. Need targeted approved mind correction/new-bootstrap
real-model test, reopen and bounded compaction explanation checks. Original preserved
Juniper remains untouched. No gateway resources or containers created for this probe.
