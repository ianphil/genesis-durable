# Direct A2A bridge (#4)

Uses official SDK 1.3.0 DefaultRequestHandler, DatabaseTaskStore, ResultManager,
execution buses and JSON-RPC transport. pi-a2a server/tasks were inspected as
reference; no gateway compatibility adapter was copied. Gateway work remains #6.

`src/a2a.ts` maps persistent message/task IDs to Durable `a2a:<messageId>` request
IDs. One shared persisted A2A context, one root conversation, one active submission;
no steers or task follow-ups. Same message ID/text returns existing snapshot;
changed text conflicts. Authorized callers share all tasks via fixed store owner.
SDK owns snapshot updates and list pagination. Application tables store association,
input hash/text and cancellation intent. Inputs and databases are private content.

Reopen reinstalls live buses/observers before HTTP ingress, avoiding SDK's no-bus
cancel path. Explicit cancellation withdraws queued submission or awaits root abort;
terminal success wins over cancellation. HTTP disconnect is not wired to abort.
Shutdown closes Durable without task cancellation.

`src/a2a-http.ts`: bearer auth, bounded JSON body (32 KiB), text input (16 KiB),
authenticated agent card, JSON-RPC `/a2a`, unauthenticated health only. Supports
application/json and application/a2a+json. No streaming/push/artifacts advertised.
Task cap 10,000, no automatic eviction; output above 65,536 UTF-8 bytes fails
explicitly (full answer remains in Durable). Admission checks SDK database page
count (~1 GiB at default page size) and 64 MiB free disk headroom. This is a soft
admission guard, not a filesystem quota or total transcript cap.
No external TLS termination is included; HTTP is private-development only.

Deployment must run SDK migrations BEFORE listener startup:

```sh
node node_modules/@a2a-js/sdk/dist/cli/a2a_db.js upgrade \
  --url sqlite:/state/a2a.sqlite --store tasks
```

In addition to model key, mount a random base64url listener token (32+ characters)
and set `GENESIS_LISTENER_KEY_FILE`. Set `GENESIS_A2A_URL` to the reachable native
`/a2a` URL and `GENESIS_NAME` to stable identity. No registration is performed.
Single runtime owns all stores. These settings extend docs/runtime.md's example.

Native SQLite addon requires a supported Node version. Development test run used
Node 25.9.0; Node 26 is outside better-sqlite3 12.8.0's declared engine range.
The image builds the addon on pinned Node 22.23.4. Use supported Node for npm test.

Observed: typecheck/build and five tests pass. Direct official SDK tests cover:
- Authenticated discovery and unauthorized card rejection.
- Blocking/nonblocking send, get/result lookup, duplicate ID and conflicting reuse.
- Two-page listing, unknown tasks, foreign tenant rejection.
- Completed task lookup after reopen; terminal cancel rejection and active cancel.
- Pending work closed/reopened, then canceled through its restored bus.
- Blocking caller abort/disconnect followed by completed-result lookup.

A live Haiku listener in the constrained image read the #3 generated mind, answered
as Juniper and retrieved its initial project code. A distinct replacement container
retrieved the same task/context/result and recalled a conversation-only token.
Opt-in probe is `test/a2a-live.mjs`; set A2A_TEST_URL, A2A_TEST_TOKEN_FILE and
A2A_TEST_EVIDENCE_FILE, run `first`, replace container using the same state, then
run `replacement`. Test containers removed; synthetic state/private token remain
under `/tmp/gd-issue4`. No gateway resources changed.

JSON-RPC wire 1.0 is verified through native SDK workflows, not a comprehensive
spec 1.0.1 conformance suite. SDK README targets 1.0.0. Production TLS and gateway
acceptance remain separate. Pending process-kill recovery through A2A, exhaustive
completion/cancel races, disk failure injection and full error sanitization are
not established by these checks. Runtime kill recovery was checked separately in #2.
The SDK may log unexpected internal/store errors; do not enable content diagnostics
or claim complete redaction without #7's sentinel/failure tests.
