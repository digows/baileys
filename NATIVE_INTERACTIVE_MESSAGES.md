# Native interactive messages

`sendMessage` and `generateWAMessageContent` accept typed reply buttons, image
reply cards, URL actions, single-select lists and image carousels. Business relay
nodes and message carriers are constructed automatically by `sendMessage`.
Low-level `relayMessage` keeps its existing custom-node behavior.

```typescript
await socket.sendMessage(destinationJid, {
	replyButtons: {
		text: 'Choose an option',
		footer: 'Optional footer',
		buttons: [
			{ id: 'option_a', displayText: 'Option A' },
			{ id: 'option_b', displayText: 'Option B' }
		]
	}
})

await socket.sendMessage(destinationJid, {
	replyButtons: {
		text: 'Choose an image option',
		image: { url: '/path/to/fresh-neutral-image.jpg' },
		buttons: [{ id: 'image_a', displayText: 'Choose image' }]
	}
})

await socket.sendMessage(destinationJid, {
	urlButton: {
		text: 'Open the repository',
		displayText: 'Open Baileys',
		url: 'https://github.com/WhiskeySockets/Baileys'
	}
})

await socket.sendMessage(destinationJid, {
	list: {
		title: 'Choose an option',
		description: 'Open the list to choose',
		buttonText: 'Open list',
		sections: [
			{
				title: 'Options',
				rows: [
					{ rowId: 'list_a', title: 'Option A', description: 'First option' },
					{ rowId: 'list_b', title: 'Option B', description: 'Second option' }
				]
			}
		]
	}
})

// N47: Web interaction was reported. On the tested iOS client text/images
// appeared, but selection was disabled. Horizontal navigation is unconfirmed.
// No callback was captured for N47 itself.
await socket.sendMessage(destinationJid, {
	carousel: {
		text: 'Choose a card',
		cards: [
			{
				title: 'Card 1',
				text: 'First image',
				image: firstImage,
				buttons: [{ id: 'card_1', displayText: 'Choose card 1' }]
			},
			{
				title: 'Card 2',
				text: 'Second image',
				image: secondImage,
				buttons: [{ id: 'card_2', displayText: 'Choose card 2' }]
			}
		]
	}
})
```

`image`, `firstImage` and `secondImage` use `WAMediaUpload`: a Buffer, an existing
`{ stream: Readable }` input, or `{ url: string | URL }`. Images use the existing
preparation, encryption, upload and media-cache path. Prepared headers retain
their media URL, direct path, keys, hashes, length and MIME metadata. The selected
live image examples used JPEGs; other media headers are not homologated here.

| Input          | Exported options                                                                   | Notes                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `replyButtons` | `ReplyButtonsMessageOptions`, `ReplyButtonOption`                                  | Required body and nonempty reply options; optional footer and image                                                         |
| `urlButton`    | `UrlButtonMessageOptions`                                                          | Required body, label and absolute HTTP(S) URL; optional footer and `merchantUrl` (defaults to `url`)                        |
| `list`         | `SingleSelectListMessageOptions`, `SingleSelectListSection`, `SingleSelectListRow` | Required title, description, open-list label and nonempty sections/rows; optional footer, section title and row description |
| `carousel`     | `ImageCarouselMessageOptions`, `ImageCarouselCard`                                 | Required root body and ordered image cards; each card requires title, body and nonempty reply options                       |

The four named content interfaces are combined as `InteractiveMessageContent`
and added to `AnyMessageContent`. These are control creation inputs. Existing
`buttonReply` and `listReply` continue to create responses.

Option IDs and row IDs belong to the caller and are preserved without rewriting.
Invalid structures, missing identifiers/labels and malformed URL data throw
`Boom` with status 400 before relay. All cards and rows are validated before the
first upload. Media preparation and relay failures propagate. Successful sends
retain the existing message ID, `WAMessage` return and configured own events.
There is no automatic text fallback or separate payload for a recipient client.
The example counts are measured examples, not WhatsApp size limits.

## Selected wire profiles and compatibility

Live controls used revision `0af2386292907f7d9742d8d41f830d8c48208fa1`, package
`7.0.0-rc14`, on October 6–7, 2026. Exact iOS/Web builds and account versions
were not recorded. These observations cannot establish universal compatibility.

| Format           | Selected profile | Wire shape                                                        | Observed behavior                                                                                                                            |
| ---------------- | ---------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Text replies     | N23/N24          | `documentWithCaptionMessage.message.buttonsMessage`, EMPTY header | Rendering and selection on iOS and Web; `buttonsResponseMessage` captured                                                                    |
| Image reply card | N25/N26          | Same carrier with full prepared image and IMAGE header            | Rendering and selection on iOS and Web; `buttonsResponseMessage` captured                                                                    |
| URL              | N03              | Direct `interactiveMessage` and `cta_url`                         | Navigation reported on both clients; no selection callback promised                                                                          |
| List             | N04              | Direct SINGLE_SELECT `listMessage`                                | Rendering and selection on both clients; `listResponseMessage` captured                                                                      |
| Carousel         | N47              | Direct `interactiveMessage.carouselMessage`                       | Web functionality reported; iOS text and two images visible, selection disabled, horizontal navigation unconfirmed; no N47 callback captured |

Text/card profiles generate fresh 32-byte secrets, opaque random ten-byte
recipient metadata, UTC Unix timestamps and metadata version 2. The recipient
value is **not** a verified Signal-key digest. Their business node includes
`actual_actors=2`, `host_storage=2`, `privacy_mode_ts` and the measured
quality-control children with a fresh 20-byte hex decision ID. These private
fields were tested together; their individual necessity was not isolated.

URL and carousel use minimal mixed native-flow business nodes. The list pairs
SINGLE_SELECT content with the measured `biz > list(type=product_list,v=2)` node;
the public input is not a catalogue. No selected profile adds a `bot` node. URL,
list and carousel omit root reporting metadata during high-level generation.
Ordinary reporting behavior and encryption/device fan-out remain unchanged.

URL flow parameters include `from=api` and a fresh UUID `templateId`, without a
declared flow version. N47 has a root header with no media, media headers on
each ordered card, empty card footers, `messageParamsJson="{}"` and quick replies.
Its root footer/context/native flow and carousel/card flow versions are omitted.
High-level carousel generation rejects quote and ephemeral-expiration options
because they would add root context information and change the selected profile.
Do not infer a callback family from the name of an outgoing control.

The complete [evidence package](./baileys-native-interactive-evidence/README.md)
includes failed controls and unconfirmed results, all 58 exploratory profiles,
five selected profiles, 115 transport records, 366 events, 58 historical
preflights, six baseline high-level rejections and 12 normalized captured returns.
The package hashes identify the unchanged historical attachments. Structural
fixtures contain synthetic private/media values and are not captured server
echoes. Never send or download their dummy media. No new live homologation is
claimed by the implementation tests.

## Existing incoming events

Read responses from `messages.upsert` using the existing protobuf fields:

- `buttonsResponseMessage`: `selectedButtonId`, `selectedDisplayText`, `type` and
  `contextInfo.stanzaId`.
- `listResponseMessage`: `singleSelectReply.selectedRowId`, `title` and
  `contextInfo.stanzaId`.
- `templateButtonReplyMessage`: `selectedId`, `selectedDisplayText`,
  `selectedIndex`, optional `selectedCarouselCardIndex` and `contextInfo.stanzaId`.

The target stanza identifies the original control. Optional indices are
preserved as received, including zero; they are not synthesized or reinterpreted.
The N05/N30/N40 captured carousel responses demonstrate these existing fields,
and do not establish N47 callback delivery. No event family or normalized
selection DTO is added. An option label or ID does not identify the selecting
client. Opening a URL does not require a reply event.

## Authorized manual reproduction

The passive [example builder](./Example/native-interactive-messages.ts) returns
typed content for all five controls. Importing or calling it does not upload or
send. Use an already connected socket with fresh authorized credentials and a
recipient authorized for the specific test. Supply two fresh neutral JPEGs,
not the synthetic headers or private artifacts from the historical probes.

```typescript
import { randomUUID } from 'crypto'
import { createNativeInteractiveExamples } from './Example/native-interactive-messages'

const examples = createNativeInteractiveExamples(
	{ url: '/path/to/first-neutral-image.jpg' },
	{ url: '/path/to/second-neutral-image.jpg' },
	randomUUID()
)

// Only run a send after the operator authorizes that control and recipient.
const example = examples[0]!
const result = await socket.sendMessage(destinationJid, example.content)
// Record result.key.id and correlate actual response contextInfo.stanzaId.
```

Record the client builds, test UTC time, message ID, transport outcome,
presentation, image visibility/navigation and exact returned selection separately.
Repeat with distinct fresh copies for iOS-first and Web-first selections. The
order is a test procedure; payloads do not branch by client. Check URL navigation
without expecting a callback. Retain failures and absent callbacks in the report.
Do not conclude rendering or click success from ACK alone. No implementation
test connects to WhatsApp or authorizes sending a manual sample.

## Offline checks and contribution disclosure

Run `corepack yarn install --immutable`, `corepack yarn build`,
`corepack yarn lint`, `corepack yarn test --runInBand` and `git diff --check`.
Check formatting on changed source, tests, examples and documentation only. The
evidence verifier can be run separately with:

```sh
node ./baileys-native-interactive-evidence/verify-evidence.mjs "$PWD/lib/index.js"
```

Feature tests compare final generated profiles and transmitted business nodes,
mock the transport/encryption boundary, preserve own-device wrapping, propagate
failures, and exercise captured replies through decode and buffered event
delivery. Offline fixtures and checks do not substitute for live client checks.
View-once media, other action kinds, video cards, payment/form flows and solving
the iOS carousel selection limitation are outside this contribution.

Drafted with Codex. Independent Codex review and measured checks are recorded in
[native-interactive-review](./native-interactive-review/README.md). Human code
review and new live client validation are not claimed.
