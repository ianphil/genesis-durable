# Memory policy adaptation (#9)

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
Genesis PR #70 was squash-merged as 8874e92d81b92b756ceeb28a6b48e88940939d4b.

Evidence: 15 automated tests pass after changes. First live Haiku test on a private
copy of existing Juniper FAILED: agent still said chat has no durable record and
would likely be lost after replacement, despite new runtime/system instructions.
Private evidence: ~/.local/state/genesis-durable/memory9/evidence.json. System policy alone was insufficient on the tested route with contradictory old mind
and history. A targeted replacement of the single fresh-session sentence in the private
Juniper copy's SOUL.md (original saved alongside it) corrected the explanation. Real
Haiku distinguished iris-682 canonical memory from moss-lark-413 transcript, corrected
its earlier claims, denied perfect recall and correctly described read-only access.
After close/reopen and real-model bounded compaction, the same explanation passed.
Private evidence: memory9/juniper/policy-verification.json. Original preserved Juniper
remains untouched; no other knowledge/personality was regenerated.

Fresh generation fetched merged Genesis 8874e92. Initial attempt failed safely;
subsequent validated generation produced host-aware files. A real Haiku conversation
correctly explained all three layers and read-only proposals. This second check used
the validated generated JSON materialized into a fresh private workspace, not a
successful full bootstrap retry; no partial first attempt was published. Evidence
under memory9/verified-merged. These are inspected live examples, not guarantees
against every future contradictory paraphrase. No gateway resources/containers
were created for these probes.

Cleanup after acceptance: corrected Juniper workspace/state promoted to the retained
private issue6 agent directory; redundant memory9 copies, known-wrong instruction
backup and diagnostics removed at user request. Historical evidence paths above
identify where probes ran, not files promised retained. No test containers remain.
The retained Juniper now contains the corrected continuity wording and tested state.
