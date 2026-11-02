# MVP acceptance evidence (#8)

Baseline code: 82271bf plus no implementation changes during clean run. Built with
`docker build --no-cache`, image
`sha256:17dd82501645915c01b4fd2f7416d4388ba6c5f4b93d7f6cc7f5bcc9e9394ee1`.
Genesis revision `17580f5fec87c3cda6bc78745009c7d8edf3dac5`; Haiku 5.5 through
approved LiteLLM route. Lockfile is authoritative package graph. Node 22 image;
automated tests on Node 25.9.0. Typecheck/build and all 15 tests passed.

## Clean-data run

Fresh private root `~/.local/state/genesis-durable/clean-acceptance8` with no existing
agent/provisioning state; preexisting Docker/Tailscale/gateway/source credentials
are host prerequisites, not a clean operating-system installation. Rebuilt image,
new dedicated Docker network, Docker-hosted provisioner and existing Serve ingress.
Unauthorized API returned 401; create 202; repeated same create 200/same agent ID.
Rowan reached published readiness. No .git found. Inspected UID 1000, read-only
rootfs, nonprivileged, bounded local logs; agents lack socket/admin/template mounts.

Remote oma14 session reported actual extension discovery/send/start/get/list/cancel
success; identity Rowan and project willow-864. Task
`d0d2d138-b6db-4e16-bcda-627e528de009` canceled after settlement. This is remote
agent-reported tool evidence. Local extension independently retrieved that canceled
task after actual agent SIGKILL/start with same context and result.

## PRD section 7 mapping

| Item | Evidence | Boundary |
| --- | --- | --- |
| 1 clean create/no Git | Fresh Rowan API run above | Existing approved host prerequisites |
| 2 creation retries/auth/invalid | Rowan retry/401; provisioner/bootstrap tests | Interrupted bootstrap fails inspectably, explicit staging recovery |
| 3 remote SDK A2A surface | oma14 extension tool report; #6 gateway pagination/disconnect | Remote report distinguished from local observation |
| 4 actual identity/memory use | Rowan remote report; Juniper inspected real reads in #2/#3/#6 | No general personality-fidelity guarantee |
| 5 reopen/replacement/kill/results | #2 killed pending submission; #4/#6 task continuity; Rowan kill + old task lookup; live restore report | No exactly-once external effects |
| 6 cancellation/races/usability | Native tests, real #6 and Rowan remote cancel | Controlled examples, not exhaustive interleavings |
| 7 lifecycle/failures | #5/#6 stop/start/withdraw/restart; failed bootstrap, mocked gateway/storage tests | Real gateway outage not deliberately induced |
| 8 compaction/backup | operations tests + docs/live-restore-acceptance.md real Haiku restored copy | Cold coordinated backup; model recall not guaranteed |
| 9 diagnostics/privacy/rotation | #7 sentinel/interface failure tests and actual rotation probe | Not every upstream unexpected log path proven redacted |
| 10 reproducible operators/cleanup | docs/deployment.md and linked runbooks | Private HTTP/Tailscale development deployment, not production TLS |

## Known risks, not hidden completion claims

#9 remains open: generated agent misstates when conversation-only facts survive.
No per-caller isolation: authorized callers share history/task control. Advisory
store locks require cooperating local launchers. No shell/write tools; workspace
must be read-only. Network egress is not a hardened sandbox. Gateway grant lock
coordinates cooperating writers only; serialize other fleet registrars externally.
Production TLS, physical disk-failure/host-power-loss and full conformance are not
established. Gateway SDK exception has explicit upstream removal condition.

This matrix records observed evidence, not approval to silently drop PRD requirements.
Review these boundaries before closing #8 or deploying real private minds.
