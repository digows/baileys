# Independent review

The approved five-profile implementation was independently reviewed at
`86a4d013b5498bc318d016cf121eb5641217378b`, based on
`0af2386292907f7d9742d8d41f830d8c48208fa1`. The review accepted the public
types, final message generation, automatic business nodes, reporting omissions,
media preparation reuse, native return-field preservation and unchanged device
fan-out within the agreed scope. No implementation defect was identified.

[results.json](./results.json) binds the exact independently executed commands
and results to that revision: build, type/lint, 461 tests in 30 suites, changed
file formatting, example typechecking and the 63-profile/59-node/12-response
evidence verifier all exited 0. Lint reported 103 warnings and no errors.
Historical evidence files remained byte-identical to the supplied package.

The library was packed, extracted and loaded independently of the source entry
point. [artifact-smoke.mjs](./artifact-smoke.mjs) and
[its result](./artifact-smoke.json) verify all five selected profiles and relay
nodes against that packaged code. Media metadata comes from an offline cache;
no connection or upload is performed. Pass an extracted package's `lib/index.js`
path to reproduce this check using the checkout's installed dependencies.

The publication commit adds only review/documentation attachments and normalizes
absolute paths/hostnames in public logs. The source tree, package manifest and
example Git-object IDs must remain equal to those in `results.json`. The checked
archive hash identifies the prepublication review archive; the release asset
has its own published checksum.

The N47 limitation remains accepted: iOS text/two images were observed, reply
selection was disabled, horizontal navigation is unconfirmed and no N47 callback
was captured. Web functionality was reported. This review does not claim a new
live check, e2e mock-server run, universal client support or human code review.
Implementation and review used Codex with separate reviewer/implementer roles.

Logs replace local checkout/temporary paths and hostname with disclosed neutral
values. Diagnostic text, counts, exit codes and timestamps are preserved. Original
private local paths and runtime credentials are not public attachments.
