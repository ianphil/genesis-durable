# ais-mac-mini deployment evidence — issue #10

Observed 2026-11-02 through the existing homeportal session on the Mac. This is a
partial deployment, **not completed automatic-deployment acceptance**.

## Implemented and checked

- Genesis revisions `2e7dd49` and `5d63e49`: publishing workflow, provisioner-only
  Compose template, private environment example and deployment runbook.
- Local typecheck/build and 16 tests passed; Docker amd64 build passed.
- GitHub publish runs `41475412448` and `41476078529` succeeded.
- Homeportal PR [#1](https://github.com/ipdelete/homeportal/pull/1) merged as
  `13fc77f1c7c89189d1c436b84080a27dd7deb939`: fixed repository/package/latest
  allowlist, serialized/coalesced target updates, mounted deployment configuration,
  bounded signed requests and no global pruning. 10 demigod and 32 portal tests
  passed; Compose override validated. Homeportal publishing run `41476213302` passed.
- Mac is Intel; engine linux/amd64. UID 502/GID 20 can use the engine socket only
  with supplemental group 0. Disposable containers verified same-path bind
  read/write, cross-container flock exclusion/release and SQLite WAL. Temp resources
  were removed; these checks are not a full agent persistence test.
- Anonymous Genesis pull and image revision check passed. Published index for
  `2e7dd49` was `sha256:6b5828a653c9087b8bf9084633e3195361b4ea4aa20c7b17118fc9f42f94b249`.
- Mac source cloned at `/Users/ianphil/src/genesis-durable`.
- Private deployment at `/Users/ianphil/src/genesis-durable-deploy`, data at
  `/Users/ianphil/.local/state/genesis-durable`, secrets at
  `/Users/ianphil/.config/genesis-durable`. Directories mode 0700, secret files 0600.
- Homeportal deployment config backed up privately at
  `/Users/ianphil/src/homeportal-backup-issue10-20261102-105437` before migration.
- Demigod updated manually with mounted deployment configurations. Portal was not
  recreated during that update. Both target configurations and image pulls worked
  from inside demigod.
- Provisioner `5d63e49` running healthy; its local image ID reported as
  `sha256:2018c3de7b20576bf23c949bf3258a5f128857648fd9da8ac19cd6f082c2fa3d`.
  Agent image configuration separately pins a pre-pulled bare local ID.
- Portal, demigod and provisioner health returned HTTP 200; authenticated agent-list
  request returned 200. Model completion and read-only gateway checks passed.
- Added private Tailscale Serve TCP `100.82.9.79:19901` to `127.0.0.1:19900`.
  Existing portal HTTP Serve and webhook HTTPS Funnel remained configured.
- Created Genesis repository package webhook `706505140` pointing to the existing
  signed listener. Ping returned 200. No secrets included in this evidence.

## Open acceptance gap

A subsequent successful Genesis manual publish changed GHCR latest, but no package
webhook delivery appeared in repository history. The homeportal publication also
produced no new recorded delivery at the observation time. Therefore **neither
new automatic deployment loop has passed actual publish-to-deploy acceptance**.
A normal host credential-helper pull also timed out; anonymous pull succeeded.
Do not confuse readable Compose configuration or a webhook ping with a working
publication-triggered update. Investigation remains ongoing.

No Jupiter or synthetic agent was created. Agent persistence across provisioner
replacement, fleet conversation and agent security inspection remain untested on
this host. Jupiter purpose/character inputs still need agreement before creation.
