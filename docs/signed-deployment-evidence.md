# Signed deployment acceptance — issue #10

Observed 2026-11-02 on ais-mac-mini. This supersedes the native package-trigger
acceptance gap for **service deployment**, not the unresolved GitHub event cause
or full agent acceptance.

## Implementation

- Homeportal PR [#2](https://github.com/ipdelete/homeportal/pull/2) merged as
  `52eff1e`: dedicated `/deploy` HMAC contract, strict repository/image allowlist,
  registry latest digest comparison, immutable Compose image override, serialized
  per-target queue, run deduplication and retry after failure. Sender rejects
  redirects. 23 demigod and 32 portal tests passed.
- Genesis `cb5873a`: post-publish signed notification using Buildx output digest;
  16 TypeScript tests and 3 Python sender tests passed locally.
- Separate signing secret provisioned privately in both repositories and listener.
  Shared secret means shared trust across the two allowlisted targets.
- Demigod updated manually; package triggers disabled in listener and both native
  repository hooks disabled. Saved metadata/config privately on Mac, including
  `/Users/ianphil/src/homeportal-backup-notify-20261102-113040`.

## Actual publish-to-deploy checks

- Homeportal run `41482166964`, attempt 2: notification succeeded. Demigod logged
  deployment completion for registry digest
  `sha256:f97ed3f25415927e7c01160f271434a49840a933ed1d9d6af773bcf22bb8a6ec`.
  Portal reports revision `52eff1e`; Genesis provisioner remained untouched.
  First attempt failed against the old listener during bootstrap and is not
  acceptance evidence.
- Genesis run `41482654221`: notification succeeded. Demigod logged provisioner
  deployment start 16:34:23 UTC and completion 16:34:26 UTC for digest
  `sha256:86a0282529aa04c589db6a09b4863556ac4d957f42409657ac6986fd8d5f374c`.
  Provisioner reports `cb5873a`, healthy. Portal and demigod IDs remained unchanged.
- Pinned agent image stayed unchanged and matches provisioner configuration.
- Replay of the successful Genesis signed request returned 202/duplicate without
  provisioner recreation; invalid signature returned 403; signed wrong repository
  or image returned 400. No synthetic high run ID was used.
- Portal, demigod and provisioner health returned 200; Serve/Funnel preserved.

## Boundaries

202 is queue acceptance, not deployment completion; logs and inspected containers
provided the completion evidence above. Queue/order state resets on restart. The
latest digest check is not atomic with registry publication or Compose update.
No deployed health rollback, persistent deployment journal or workflow status
polling is claimed. Native package-event cause remains unknown.

Jupiter is not created: approved purpose/character and full agent conversation,
security and persistence checks are still pending. Issue #10 stays open.
