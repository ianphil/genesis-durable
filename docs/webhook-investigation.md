# GHCR webhook investigation — issue #10

2026-11-02. Automatic deployment remains unverified; do not broaden demigod's
allowlist or deploy untagged artifacts to conceal the event-source gap.

## Observations

- Genesis hook 706505140 is active, package-only; ping succeeded with HTTP 200.
- Successful publish runs 41477811636 (new revision 4f86ca4) and earlier runs did
  not produce package deliveries during bounded observation. Public GHCR package
  page links the image to the correct repository and lists new tagged versions.
- Historical homeportal delivery was genuinely `package` in both history and
  X-GitHub-Event, with correct repository/package and `latest` tag.
- GitHub status reported Packages, Webhooks and Actions operational.
- Temporarily adding registry_package alongside package, then dispatching run
  41478766291, produced both event types. Package delivery 3851803763880763392 and
  registry_package delivery 3851803762058338304 returned 200/ignored. Both had the
  correct repository/package but **empty tag.name**. Registry GET of the delivered
  digest confirmed a Docker attestation artifact with an in-toto SLSA layer, not a
  tagged runnable image. Demigod correctly did not deploy it.
- Restored subscription to package-only. Controlled run 41479311955 (a958c2d)
  disabled Buildx provenance. GHCR latest became a single AMD64 OCI manifest with
  that revision, without index/attestation children. Through 16:16:06 UTC no new
  package delivery appeared; demigod did not deploy. Disabling provenance therefore
  did not resolve the observed failure and was reverted.
- Healthy provisioner remains at 5d63e49. Portal and demigod remain healthy.

## Conclusion and next options

The endpoint/signature path works. Actual event delivery is observed for an
untagged attestation, but not the expected latest publication. Root cause is
**not established**. Resaving subscriptions, event type selection and provenance
changes have not demonstrated a reliable publish-to-deploy path.

Next options: investigate with GitHub Support using the run/delivery identifiers,
or explicitly notify demigod after a successful publishing workflow with a signed,
allowlisted deployment contract and privately provisioned Actions secret. The
latter requires source changes/tests and should be agreed rather than silently
introduced as if native package webhooks worked.

Sources:
- https://docs.github.com/en/webhooks/webhook-events-and-payloads#package
- https://docs.github.com/en/webhooks/webhook-events-and-payloads#registry_package
- https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry

GitHub recommends package over registry_package; their payload roots differ.
Workflow recursion suppression for GITHUB_TOKEN does not, by itself, establish
suppression of ordinary webhook deliveries. Historical homeportal delivery sender
was github-actions[bot]. Do not claim that as a confirmed cause.

Tooling note: delivery IDs exceed JavaScript exact-integer range. `gh --jq` rounded
them in output; preserve JSON integers with Python when retrieving delivery detail.
Never print full webhook request headers/configuration containing private values.
