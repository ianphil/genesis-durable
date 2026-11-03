# Agent capabilities (issue #11 — implementation under verification)

Creation accepts `capabilities`, an array of additive server-defined bundles:

| Bundle | Tools |
| --- | --- |
| `read` | read |
| `workspace` | read, write, edit |
| `coding` | read, write, edit, bash |

Omitted means `["read"]`; empty means no optional tools. Unknown/malformed values
return 400. Arrays are sorted/deduplicated; overlaps do not duplicate tools.
Creation request deduplication includes the normalized selection, with compatibility
for legacy read-only request hashes. Existing records default to read.

`PUT /v1/agents/<UUID>/capabilities` with `{"capabilities":["coding"]}` replaces the
selection and returns 202. Inspect the agent: `capabilities` is desired policy,
`activeCapabilities` and `tools` describe the last applied policy; state/stage/failure
must also be checked. Same in-flight selection is idempotent; competing work is 409.

The explicit update uses the server-configured `GENESIS_AGENT_IMAGE` as its target
runtime image. It must be a pre-pulled bare local ID with Docker image label
`io.genesis.capabilities=1`. This deliberately opts into a compatible runtime upgrade;
ordinary provisioning-service updates still do not upgrade agents. Do a cold backup
before changing a populated agent image; label compatibility is a host contract,
not proof arbitrary schema migrations are safe.

Running legacy images have no drain endpoint: update returns 409
`legacy_agent_must_be_stopped`. Arrange an idle maintenance window and explicitly stop
that agent first, then apply capabilities while stopped and start it afterward.
Never stop busy legacy work under the claim of draining it.

For supported running images, the provisioner blocks ingress routing for the update
and calls the authenticated drain endpoint. It rejects new work and waits for active
A2A work; timeout/failure leaves the update failed and retryable, without intentional
cancellation. Discovery is withdrawn after draining. The owned container is stopped
and removed, then recreated over the same workspace/state, using the target image.
Stopped intent is preserved. Readiness/publication must succeed before active policy
is reported for a running agent. An interrupted update can be retried with the same
PUT. Failed operations are not automatically retried on provisioner reopen.

## Security boundaries

Read uses the existing realpath workspace guard. Write/edit use the SDK tools with
workspace/ancestor checks; dedicated tools reject outside paths and symlink escapes.
These checks are not a concurrent-filesystem adversary sandbox: callers operating
on untrusted concurrently mutable host directories need stronger OS isolation.
Writable bundles mount the workspace read/write, without adding host paths.

Coding enables bash in the container. Bash can bypass file-tool checks, access its
readable model/listener credentials, change its state files, and use permitted
network routes. It is not a memory-only sandbox. Root filesystem remains read-only;
workspace/state/tmp writable. No Docker socket or gateway admin credentials are
provided. Authorized callers share this authority and one conversation.

Durable owns tool execution/recovery; file/process side effects are not exactly-once
transactions with SQLite. Use its exported tools, not copied implementations.
Outbound fleet A2A is not enabled by these bundles.

Live Jupiter upgrade and complete update-failure/container-recovery acceptance are
not yet recorded. Do not treat this implementation document as deployment evidence.
