# Jupiter deployment acceptance — issue #10

Observed 2026-11-02; follows [signed service deployment acceptance](signed-deployment-evidence.md).

- Created fresh `jupiter`, UUID `7833fc84-18f9-4cae-8693-62435a63896e`, on
  ais-mac-mini; fleet name `gd-mac-mini-jupiter`, Haiku 5.5.
- Purpose: Ian's persistent fleet companion; Roman Jupiter personality with
  restrained grandeur, honesty and Ian's authority. Initial tools remain read-only.
- Administrative API returned ready/published. Actual fleet A2A discovery and
  conversation from lilarchy succeeded.
- Established a conversation-only sentinel before restart. Direct Docker restart
  of the labeled Jupiter container completed. Subsequent A2A answer recalled the
  exact sentinel without a read request, and correctly described its earlier
  fleet-companion purpose. This tests container restart, not compaction/exact
  historical retrieval after arbitrary context loss.
- Force-recreated the provisioner through its deployment Compose configuration,
  overriding with its existing immutable image reference (no opportunistic upgrade).
  Verified provisioner ID changed, image stayed identical, Jupiter container ID
  stayed identical, and readiness returned 200.
- API still reported Jupiter ready/published; fleet A2A exchange after replacement
  recalled the same sentinel and answered in character.
- Inspected Jupiter mounts/environment: no Docker socket, administrative secret
  mount or administrative environment variables. Portal, demigod and provisioner
  remained running.

Jupiter initially misstated transcript persistence despite generated instructions;
a host clarification was supplied in conversation. Observed restart recall passed;
this is not proof every future answer will describe hosting correctly. He cannot
write curated Markdown memory yet. No runtime capability or broad infrastructure
permission was added to fix personality wording.

Issue #10's deployment goal is complete. Native GitHub package-event cause remains
unresolved; explicit signed notifications are the tested replacement. Queue state
is in-memory, 202 means acceptance, and the registry freshness check is not atomic.
See linked evidence for limits; do not infer production hardening or perfect recall.
