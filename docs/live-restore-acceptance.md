# Juniper cold-restore and real-model compaction acceptance

Used isolated copies under `~/.local/state/genesis-durable/acceptance8`, never the
preserved original. Original and restored instances were not run simultaneously.
Image: `sha256:6fb352934e6c839e5b4ee87ac20d668f1767e6b731d5554f8c1aa8166c774a40`
(Node 22, kernel-lock entrypoint, #7 runtime changes).

1. Copied stopped Juniper workspace/state, including both SQLite stores and keys.
2. In constrained read-only/non-root image, invoked official Durable compact with
   Haiku and bounded recent retention, then awaited summary placement.
3. Verified all 22 original transcript entries still stored, compaction entry exists,
   and a new response includes Juniper, iris-682 and moss-lark-413.
4. SHA-256 hashes of six canonical mind files unchanged.
5. Closed harness, cold-copied again into separate restored provisioner data root.
6. Started latest Docker-hosted provisioner and restored agent with one owner,
   published through existing Tailscale Serve and fleet grant.
7. Official SDK through real LiteLLM gateway retrieved pre-backup canceled task
   `48aee9a7-cef9-46b8-8a1d-6905b833d749` and its original shared context.
8. New gateway conversation correctly returned Juniper, iris-682, moss-lark-413.
9. API stop withdrew registration/grant; test containers/network removed. Private
   copies/evidence retained outside Git. Existing host Serve left per user request.

Opt-in probe source: `test/juniper-acceptance.mjs`, mounted into built image at
`/app/test/juniper-acceptance.mjs`; requires read-only `/workspace`, writable `/state`,
private model key `/run/secrets/model` and GENESIS_MODEL_URL. Only use cold copies.
Probe writes private structured evidence to `/state/acceptance8.json`.

Observation: agent still claims conversation-only facts require Markdown to survive
future sessions. This contradicts observed Durable persistence; #9 tracks adaptation.
Compaction recall here is one successful real-model example, not guaranteed exact
recall of all historical facts. Not a complete clean-install #8 acceptance run.
