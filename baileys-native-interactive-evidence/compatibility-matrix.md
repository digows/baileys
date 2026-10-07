# Native Message Compatibility Test Matrix

Library baseline: `0af2386292907f7d9742d8d41f830d8c48208fa1` (package 7.0.0-rc14).
Live observations were collected on October 6–7, 2026. Exact iOS and Web build
numbers were not recorded; these results do not claim universal compatibility.
Server ACK and status 2 indicate transport acceptance, not rendering or clicks.
Client results are human reports. Native response fixtures separately prove
captured option IDs and exact target messages.

## Existing Message Formats

| Sample | Format | Transport measurement | iOS / Web observation |
| --- | --- | --- | --- |
| R01 | Plain text, Unicode, emoji, paragraphs | Submission completed | Confirmed on both |
| R02–R06 | Bold, italic, strike, monospace, inline code | Submission completed | Confirmed on both |
| R07–R10 | Bullets, numbering, visual quote, combined styles | Submission completed | Confirmed on both |
| R11 | URL, automatic preview attempt | Submission completed; captured message has no preview metadata | Confirmed on both |
| R12 | Markdown heading/link/table and HTML text | Submission completed | Confirmed on both |
| R13 | Explicit preview title, description, thumbnail | Native acknowledged; preview metadata present | Confirmed on both |
| R14–R15 | PNG/JPEG images and captions | Native acknowledged | Confirmed on both |
| R16–R18 | MP4 video, GIF-style MP4, circular video note | Native acknowledged | Confirmed on both |
| R19–R20 | MP3 audio and Opus voice note | Native acknowledged | Confirmed on both |
| R21–R22 | PDF and TXT attachments | Native acknowledged | Confirmed on both |
| R23–R24 | Static and animated WebP stickers | Native acknowledged | Confirmed on both |
| R25–R26 | Single and multiple contact cards | Native acknowledged | Confirmed on both |
| R27 | Synthetic static location, 0,0 | Native acknowledged | Confirmed on both |
| R28–R29 | Single-choice and multiple-choice polls | Native acknowledged | Confirmed on both |
| R30 | Synthetic event without call link | Native acknowledged | Confirmed on both |
| R31 | Reply quoting R14 image | Native acknowledged | Confirmed on both |
| R32–R33 | Structured forwarded text/image | Native acknowledged | Confirmed on both |
| R34 | Structured self mention | Native acknowledged in self-chat | Confirmed on both |
| R35 | Reaction on R14 image | Native acknowledged | Confirmed on both |
| R36–R37 | Edit/delete of new test messages | Native acknowledged | Confirmed on both |
| R38–R40 / VO38–VO40 | View-once image/video/voice | Native acknowledged, including distinct-recipient follow-up | Self-chat unclear; follow-up media did not appear on either client |
| R41 | Album parent, two images, one video | All four native submissions acknowledged | Confirmed on both |
| R42 | Text with 24-hour expiry metadata | Native acknowledged; chat settings unchanged | Text confirmed; expiration not observed |

R38–R40 and VO38–VO40 are negative observations, excluded from feature acceptance.
R42 confirms text presentation and transmitted expiry metadata; actual expiry
was not observed. Poll voting and event response behavior were not tested.
The image/document/media fixtures were small: the largest transmitted file was
85,097 bytes. Size ceilings, HD quality and other client versions were not tested.

## Initial Interactive Controls

| Sample | Recipe | iOS | Web | Captured choice |
| --- | --- | --- | --- | --- |
| I01 | Native-flow replies in document carrier | Visible; click initially unverified | Load error | None |
| I01M | Document carrier with device metadata | Visible; click unverified | No rendering | None |
| I01V | Alternate view-once carrier for same replies | Visible; click unverified | No rendering | None |
| I01D | I01 sent to a separate consenting recipient | Visible, disabled | Load error | None |
| I02 | Native-flow URL, document carrier | Unconfirmed | Unconfirmed | URL navigation unconfirmed |
| I03 | Native-flow single-select list, document carrier | Unconfirmed | Unconfirmed | None |
| I04 | Two-image carousel, document carrier | Did not work | Card text without images | None |
| I05 | Legacy list candidate | Offline only | Offline only | Not transmitted |

## Native Interactive Controls

Options labeled iOS/Web do not prove client provenance. Explicit human reports
and the requested first-client procedure establish the stated provenance.

| Samples | Recipe/change | iOS | Web | Captured choice evidence |
| --- | --- | --- | --- | --- |
| N01/N02 | Bare reply buttons / image card with native flows | Rendered, choices disabled after clarification | Choices sent | Template-button replies; human confirms Web origin |
| N03 | Bare native-flow URL action | URL opens | URL opens | Navigation; no choice callback required |
| N04 | Direct legacy single-select list with list business node | Selection works | Selection works | Two list replies, exact targets |
| N05 | Bare two-image native carousel | Selection unverified after disabled-controls report | Selection works | Second-card template-button reply, exact target |
| N06/N07/N08 | Fresh iOS-first copies of N01/N02/N05 | Choices disabled | Not independently retested | None |
| N09/N10/N11 | Same structures on separate consenting recipient | Choices disabled | Unreported | None |
| N12 | Plain replies with private bot marker | Disabled | Unreported | None |
| N13 | Plain replies with root secret, without bot marker | Disabled | Clickable | None captured |
| N14 | N13 plus bot marker | Disabled | Disabled; human reports AI badge | None |
| N15 | Plain replies without API template parameters | Disabled | Unreported | None |
| N16 | Plain replies with flow version 1 | Disabled | Unreported | None |
| N17 | Direct version-1 replies without API parameters, separate recipient | Disabled | Works | None captured |
| N18 | N17 in view-once carrier, separate recipient | Disabled | Cannot load | None |
| N19 | Direct legacy replies with partial metadata, separate recipient | Disabled in batch report | Unreported | None |
| N20 | WA-JS-style mobile native-flow payload | Absent | Cannot load | None |
| N21 | Full private metadata with direct native replies | Unreported | Unreported | None |
| N22 | Full private metadata with direct legacy replies | Choice sent | Cannot load | Legacy button reply, exact target |
| N23/N24 | Full private metadata, legacy replies in document carrier | N23 choice sent | N24 choice sent | Both legacy button replies, exact targets, explicit client provenance |
| N25/N26 | N23/N24 with JPEG header type 4 | N25 image and choice work | N26 image and choice work | Both legacy button replies, exact targets, requested client procedure confirmed |
| N27/N28 | Full-metadata bare carousel, layout type 0, no extra business node | Absent | Unreported | None |
| N29/N30 | Same carousel plus mixed business node | Absent | N30 carousel choice works | Second-card template-button reply, exact target |
| N31/N32 | Carousel in template carrier | Absent | Cannot load | None |
| N33/N34 | Full-metadata bare carousel with horizontal type 1 | Absent | Arrived; selection unreported | None |
| N35/N36 | Complete V2 source carrier, carousel/layout version 1 | Text only | Carousel works by human report | None captured |
| N37/N38 | Carousel-specific business node | Not accepted | Not accepted | Server rejects with 479, status 0 |
| N39/N40 | Complete V1 carrier with nested secret/device metadata | Text only | Carousel works | N40 second-card template-button reply, exact target |
| N41/N42 | Nested-metadata carousel plus engagement envelope | Text only | Carousel works by human report | None captured |
| N43/N44 | Bare version-omission source recipe | Absent | Arrived | None |
| N45 | Application-level V1 carousel wrapper | Text only | Unreported | None |
| N46 | SDK-level bare carousel with mixed business and bot nodes | Text and two images, no selection | Selection disabled | None |
| N47 | N46 with only bot node removed | Text and two images; selection disabled; horizontal navigation not confirmed | Works by human report | No N47 callback captured; selected carousel recipe |
| N48 | N47 with card-flow version 3 | Incompatibility notice plus two separate images; no selection; broadcast-like icon reported, meaning unverified | Works by human report | None captured |
| N49/N50 | Bare declared carousel/layout version 1, card flow omitted / version 1 | Text and images, no selection; navigation unreported | Unreported | None |
| N51 | Minimal plain native-flow version 3 | Choice disabled; no carousel was included | Cannot load | None |

## Selected Profiles and Acceptance Boundary

Text replies: N23/N24. Image reply cards: N25/N26. URL action: N03.
Single-select list: N04. Image carousel: N47, retaining its documented iOS
selection limitation and unconfirmed horizontal navigation on that client.
N47 does not inherit N30/N40's callback proof: those are different wire profiles.
Resolving iOS carousel selection is further investigation, not a release blocker
for the approved selected profile. No device-specific payload or automatic
fallback was used. Known failures remain visible in this matrix.
