# Native Interactive Message Evidence

This package supports a standalone Baileys contribution for high-level reply
buttons, image reply cards, URL actions, single-select lists and image carousels.
It contains no application dependency and must be attached in full to the PR.

## Baseline and Provenance

Live controls used Baileys revision
`0af2386292907f7d9742d8d41f830d8c48208fa1`, package `7.0.0-rc14`, on
October 6–7, 2026. Observations came from authorized self-chat and separate
recipient checks using iOS and WhatsApp Web. Exact client builds and account
versions were not recorded. Their absence prevents a universal compatibility
claim.

These sources have different evidentiary strength:

| File | Contents | What it proves |
| --- | --- | --- |
| `compatibility-matrix.md` | All R/I/N observations and limitations | Human-reported presentation/click results, including failures and unconfirmed checks |
| `transport-results.json` | 115 submission records and 366 structured events | Message-ID correlation, submission completion, ACK/status/error measurements when present; not client rendering |
| `offline-preflights.json` | 58 historical preflight measurements | Reported protobuf/binary-node checks before the native experiments; not the future PR suite |
| `high-level-generation-probes.json` | Six pretransmission status-400 rejections | The exercised high-level input shapes were unsupported at the baseline; no messages were sent by those probes |
| `selected-profiles.json` | Five selected structural profiles | Exact selected protobuf/carrier/relay-node shape, with synthetic private/media values |
| `exploratory-profiles.json` | 58 structural profiles, including all N01–N51 | Reproducible alternative wire shapes and negative controls; not captured server echoes |
| `native-response-fixtures.json` | 12 unique captured native callback payloads | Actual selected IDs, display fields, target stanza IDs and card indices when present |
| `verify-evidence.mjs` | Portable offline verifier | Profile/response protobuf and binary-node round-trips, selected omissions, all-N coverage and exact callback-target checks |
| `evidence-verification.json` | Measured verifier output | Offline integrity results against the built baseline library; not implemented feature tests or a new live check |
| `manifest.json` | Byte counts and SHA-256 hashes | Exact identity of the files supplied with this package |

The five selected profiles are N23 (text replies), N25 (image replies), N03
(URL), N04 (list) and N47 (carousel). N24/N26 are the matching Web-first live
copies. Known carousel limit: N47 displayed text and two images on iOS, but
selection was disabled; horizontal navigation was not confirmed. Web functionality
was reported. **No N47 callback was captured**. N05/N30/N40 callbacks cannot be
reattributed to that recipe. The iOS limitation is accepted pending further
investigation.

## Normalization and Privacy

Application labels were replaced with neutral labels. Option-ID prefixes were
renamed to `sample_` consistently in outbound structures and real callback
payloads. Transport message IDs remain unchanged to retain exact correlations.
Callback payloads are therefore normalized captures, not byte-identical raw
captures. Client provenance comes from explicit human reports and the requested
first-client procedure; an option named iOS does not establish its sender client.

Structural fixtures were regenerated from the pure candidate builders used in
the experiments. They are not saved encrypted stanzas, server echoes or proof
that synthetic values are deliverable. Protobuf fields use standard JSON
conversion: byte values are base64, long values numbers and enums strings.

Synthetic fixture material:

- Message secrets and ten-byte recipient hashes use zero bytes.
- Quality-control decision IDs use zero hexadecimal digits; timestamps are
  fixture data rather than current runtime values.
- Media URLs use `example.invalid`; media keys, hashes, length and dimensions
  are synthetic prepared-header values. They cannot be downloaded/decrypted.

Live authentication, account/recipient JIDs, encryption keys, recipient hashes,
private raw logs and client screenshots are not public attachments. Original
image assets had application labels and are not included. For a new manual
check, use fresh neutral media and the existing preparation/upload path. Do not
send the dummy headers or describe replacement assets as the originals.

The text/card profile's live ten-byte hash was generated randomly by the probe.
It is opaque experimental metadata, not an established Signal-key digest. The
experiment did not independently prove that every private field was necessary.

## Reproduce the Offline Integrity Check

Use Node 20 or newer and a built Baileys checkout at the stated baseline. Supply
its `lib/index.js` path explicitly. The verifier loads files relative to its own
location and has no auth, socket, upload or live-send path.

From a Baileys checkout after copying this evidence folder into it:

```sh
corepack yarn install --immutable
corepack yarn build
node ./baileys-native-interactive-evidence/verify-evidence.mjs "$PWD/lib/index.js"
```

The recorded syntax and execution checks both exited 0. The source checkout's
dependency installation state was unavailable for this evidence task, so the
recorded execution used an existing installed build pinned to the same baseline
revision, without installing into or changing that checkout. The output records
Node version, UTC time and the loaded entry-point hash; local paths are omitted.
It verifies 63 profile round-trips (five selected plus 58 exploratory), all
associated binary nodes and 12 response round-trips with exact target checks.
It makes no claim that the feature has been implemented or that the current
source checkout's build/lint/test suite was rerun.

When implementing the PR, turn these selected references into focused tests of
the **final high-level generated messages and relay path**, including automatic
postprocessing. Keep the full historical matrix as evidence rather than turning
every failed experimental profile into a new supported public option.

## PR Attachment Rules

Include this complete folder plus the new implementation tests, examples and
actual check output for the PR commit. Preserve the distinction between human
observations, native captured callbacks, transport acceptance and synthetic
offline fixtures. Record new client versions/results only if actually measured.
Do not claim new live homologation from running this verifier.

Keep the PR title, description and attachments independent of consumer projects.
Include the accepted iOS carousel limitation and accurate AI-use disclosure.
Do not claim review, merge, release or publication has happened before it has.
