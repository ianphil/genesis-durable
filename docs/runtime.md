# Minimal runtime (#2)

A small host around published Pi Durable 1.4.0. No A2A listener, custom chat API,
provisioning or awakening. `src/runtime.ts` exposes the harness/root for composition;
`src/main.ts` opens it and serves health endpoints only.

## Build and test

Node >=22.19.0:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
docker build -t genesis-durable:issue2 .
```

Dependencies/lockfile and Node 22.23.4 base image digest are pinned. Image uses
UID 1000 (`node`); no mind, credentials or state is baked in. Build context is
allowlisted. Generated files live under `dist/`.

Default model: **`github/claude-haiku-5.5` through LiteLLM**. Gateway `/model/info`
reported 1,000,000 input and 128,000 output tokens, tool calling and chat-completions
support. Runtime config uses that context size and 4,096 maxTokens model metadata;
this is not an independently measured context limit or hard spending cap.
SDK retries/timeouts and built-in compaction are configured. Costs are gateway
baseline estimates, not authoritative billing. Model configuration is in
`src/model.ts`, not user-supplied arbitrary model references.

## Run with a synthetic mind

Required existing files: `SOUL.md`, `AGENT.md`, and
`.working-memory/{memory,rules,log}.md`. Runtime validates them and supplies identity
and role through a prompt section, plus explicit memory-read instructions. No mind
file is generated or overwritten. State directory must be writable by UID 1000.

```sh
docker run --name gd-synthetic --read-only --cap-drop ALL \
  --security-opt no-new-privileges --cpus 1 --memory 1g --pids-limit 128 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --log-driver local --log-opt max-size=10m --log-opt max-file=3 \
  --mount type=bind,src="$MIND",dst=/workspace,readonly \
  --mount type=bind,src="$STATE",dst=/state \
  --mount type=bind,src="$MODEL_KEY_FILE",dst=/run/secrets/model,readonly \
  -e GENESIS_MODEL_KEY_FILE=/run/secrets/model \
  -e GENESIS_MODEL_URL="$MODEL_URL" \
  -p 127.0.0.1:8080:8080 genesis-durable:issue2
```

Use a scoped runtime model credential, not gateway admin access. No engine socket
or other minds are mounted. `GENESIS_WORKSPACE`/`GENESIS_DATABASE` optionally
change default `/workspace` and `/state/durable.sqlite` paths.

**One owner per state directory is an operator requirement.** Stop/remove the old
container before replacement; never run two copies. SQLite does not provide the
cross-process harness exclusion. SIGTERM/SIGINT close the harness, not cancel work;
reopen installs definitions and resumes the same root. Do not initialize Git.

Only SDK read is installed. A realpath guard rejects paths outside the mind,
including external symlinks. It assumes a read-only mount and no concurrent path
swapping; it is not an adversarial filesystem sandbox. Credentials/state stay
outside that mount. Network egress is not filtered by this example. Do not enable
shell/write tools under this policy.

`/health/live`: HTTP process alive. `/health/ready`: harness opened/resumed, not
provider validation or gateway publication. Logs use fixed events/report categories
and conversation IDs, not exception messages/transcripts. State and mind are private.

## Observed evidence

- Type-check/build and automated faux test passed: real SDK read execution,
  SQLite graceful reopen, same root/settled submission/request deduplication,
  outside-workspace read rejection.
- Digest-pinned image built and ran non-root, read-only, nonprivileged with dropped
  capabilities and resource limits. Health/live and health/ready returned 200;
  SIGTERM produced runtime_closed.
- Real Haiku test in container made **four file reads** (SOUL plus three memory
  files) and retrieved a unique synthetic fixture fact.
- A newly created replacement container reopened the same state, resolved the
  original request/submission and recalled a conversation-only token.
- Another container was SIGKILLed immediately after durable admission; a new
  container resubmitted the same request ID, recovered the same submission ID,
  settled done, and retained the earlier conversation token. This is process-kill
  recovery, not power-loss or exactly-once external-effect proof.
- No mind changed. All test containers removed. Synthetic databases and failure
  evidence remain locally at `/tmp/gd-issue2`, with no credentials copied there.

Live probe source: `test/container-probe.mjs`. Mount it at `/app/test/probe.mjs`
in the built image alongside the same fixture/state/key mounts; invoke
`node test/probe.mjs first`, then `replacement` in a new container. For crash test,
run `admit`, wait for `ADMITTED`, SIGKILL, then run `recover`. Use fresh test state
for each complete sequence. Never target an evolved mind with this fixture probe.

**Model behavior limit:** initial live attempts relied only on system-provided
identity/path instructions; Haiku tried reading the directory and did not reliably
adopt the supplied personality. Explicit paths in the user input produced successful
file reads. A direct identity check also answered Claude rather than Juniper.
Thus this slice proves file-backed data access and durable conversation plumbing,
not autonomous personality fidelity. Bootstrap acceptance must test generated-mind
behavior explicitly. Full-window compaction, adversarial isolation, queued-work
cancellation and A2A/gateway acceptance were not exercised here.
