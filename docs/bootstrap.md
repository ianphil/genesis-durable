# Controlled Genesis bootstrap (#3)

`src/bootstrap.ts` exports `bootstrap(options)` for the future provisioner. No
new service or API is introduced. The provisioner will run in Docker with the
engine socket; bootstrap itself neither uses that socket nor starts containers.

Inputs: trusted operator-selected `agentDirectory`, name, character, purpose,
configured Models collection, optional private template token and abort signal.
Model defaults to `github/claude-haiku-5.5`. Data root is provisioner policy
(default planned `/var/lib/genesis-durable/agents/<id>`), never a caller path.

1. Resolve Genesis `main` once to an exact SHA through GitHub API.
2. Fetch four allowlisted `.genesis-temp` Markdown files at that SHA. No archive,
   extraction, Git checkout or executable downloads. HTTP bodies and file sizes
   are bounded; credentials stay in request headers outside the workspace.
3. Generate one JSON object containing exactly SOUL.md, AGENT.md, three memory
   files and mind-index.md. Adapt role/personality and memory principles, with
   read-only capabilities; no interview, optional extensions or Git operations.
4. Validate fixed paths, sizes, nonempty content, index references and obvious
   unavailable operating capabilities. Prompt constraints are not a semantic
   proof: generated instructions still require acceptance testing.
5. Write private staged files/provenance, then rename into workspace. Never
   regenerate a published mind. Same payload retries reuse it; conflicts fail.

One model attempt, 8192 output tokens, no provider retries, five-minute overall
signal deadline. Fetch has a bounded response reader. No monetary guarantee.
An injected test adapter must honor the signal just as the real SDK call does.

`bootstrap-staging/` is an atomic creation lock and inspectable status record.
Failure publishes no workspace; status contains a fixed code, not provider errors.
Interrupted/failed staging requires explicit operator recovery: inspect it, ensure
no creator is running, then move it aside before retrying. Do not remove a lock
or workspace automatically. Publication assumes all creators obey this lock and
operator-controlled parent paths. This is not a distributed workflow engine.
A crash after publication is recovered from workspace provenance without model
regeneration. Workspace provenance includes template SHA, model, contract version
and input hash, but no credentials. Agent input/mind remain private.

## Verification

`npm test` checks invalid/traversal paths, missing content/index, unavailable
capability commands, no Git metadata, preservation of evolved SOUL on retry,
conflicting inputs, safe failure status and refusal to steal failed staging.
No archive parser exists, so archive-traversal testing is unnecessary.

Live Haiku validation fetched Genesis revision
`17580f5fec87c3cda6bc78745009c7d8edf3dac5`, generated all six files, and opened them
with the Durable runtime. Generated AGENT.md was independently inspected: role,
startup reads, memory proposals and read-only restrictions matched installed tools.
Runtime made six actual file reads and answered as Juniper, the botanical librarian,
retrieving project code `marigold-739` from initial memory. This was an explicit
read/role request, not proof that every future prompt automatically adopts identity.

Initial attempts failed safely without publication. One exposed a GitHub commit
response exceeding the original response cap (now bounded at 2 MiB); another
returned Markdown instead of JSON. Repeating format requirements in the generation
user message produced valid JSON. Validation remains mandatory; no malformed-output
repair loop silently accepts partial minds.

Synthetic live artifacts/failure evidence are private local files under
`/tmp/gd-issue3`; no credentials were copied there. Live verification was an
in-process runtime using the same installed Durable host, not a new container
acceptance run. Container replacement was verified in #2. No provisioning API,
gateway registration, upstream Genesis changes or Git side effects occurred.
