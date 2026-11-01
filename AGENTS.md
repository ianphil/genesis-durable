# Working on Genesis Durable

Before implementation, review or dependency changes, read
[CONTRIBUTING.md](CONTRIBUTING.md) for ownership contracts and verification gates.
The [README](README.md) defines agreed scope; planned behavior is not implemented behavior.

## SDK-first

Inspect the chosen installed Pi Durable and official A2A SDK exports, types and
matching examples before writing equivalents. Prefer direct use, configuration,
composition/exported interfaces, then supported subclassing. Let Durable own
execution, persistence, recovery and compaction; let the A2A SDK own protocol
mechanics. Keep our code focused on Genesis adaptation, provisioning and policy.

A replacement for SDK behavior requires a documented reason, a regression test
and a removal condition beside the exception. Use supported exports rather than
private internals or edits to dependencies. Published packages and upstream main
can differ despite identical manifest versions; verify the exact artifact.

## Preserve agents and state

- Provision agent workspaces without Git; preserve evolved identity and memory.
  Adapt bootstrap deliberately instead of executing Copilot awakening verbatim.
- Keep one shared conversation per agent and persistent A2A-to-Durable identifiers.
  Request deduplication is not exactly-once execution of external effects.
- Caller disconnect ends waiting, not work. Explicit cancellation reports a
  terminal outcome only after the underlying execution has settled.
- Container replacement preserves workspace and database. One runtime owns each
  store; distinguish restart/stop from explicit task cancellation.
- Keep container-management and gateway administrative access in the provisioning
  service, outside agent containers. Credentials and private content stay out of
  images, Git, cards, API errors and default operational logs.

Work in small verified slices. Report observed behavior separately from proposals;
keep documentation current and superseded designs in Git history. Do not copy a
pi CLI extension into Durable assuming the extension contracts are interchangeable.
