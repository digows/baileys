import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const modulePath = process.argv[2] ?? fileURLToPath(new URL('../lib/index.js', import.meta.url))
const { proto, generateWAMessage } = await import(pathToFileURL(modulePath).href)
const { getInteractiveMessageRelayNodes } = await import(
	new URL('./Utils/interactive-messages.js', pathToFileURL(modulePath)).href
)
const { encodeBinaryNode, decodeBinaryNode } = await import(pathToFileURL(modulePath).href)
const evidence = JSON.parse(
	await readFile(new URL('../baileys-native-interactive-evidence/selected-profiles.json', import.meta.url), 'utf8')
)
const mediaCacheData = new Map()
const normalize = value => JSON.parse(JSON.stringify(value))
const protobufObject = message =>
	proto.Message.toObject(proto.Message.fromObject(message), { bytes: String, longs: Number, enums: String })
let rejectedLiveUploads = 0
const results = []

for (const fixture of evidence.fixtures) {
	const expected = proto.Message.fromObject(fixture.message)
	const replies = expected.documentWithCaptionMessage?.message?.buttonsMessage
	const interactive = expected.interactiveMessage
	const list = expected.listMessage
	let content
	if (replies) {
		content = {
			replyButtons: {
				text: replies.contentText,
				footer: replies.footerText,
				buttons: replies.buttons.map(button => ({ id: button.buttonId, displayText: button.buttonText.displayText }))
			}
		}
		if (replies.imageMessage) {
			const image = replies.imageMessage
			content.replyButtons.image = { url: image.url }
			mediaCacheData.set(`image:${image.url}`, proto.Message.encode({ imageMessage: image }).finish())
		}
	} else if (list) {
		content = {
			list: {
				title: list.title,
				description: list.description,
				buttonText: list.buttonText,
				footer: list.footerText,
				sections: list.sections.map(section => ({
					title: section.title,
					rows: section.rows.map(row => ({ rowId: row.rowId, title: row.title, description: row.description }))
				}))
			}
		}
	} else if (interactive.nativeFlowMessage) {
		const params = JSON.parse(interactive.nativeFlowMessage.buttons[0].buttonParamsJson)
		content = {
			urlButton: {
				text: interactive.body.text,
				footer: interactive.footer.text,
				displayText: params.display_text,
				url: params.url,
				merchantUrl: params.merchant_url
			}
		}
	} else {
		content = {
			carousel: {
				text: interactive.body.text,
				cards: interactive.carouselMessage.cards.map(card => {
					const image = card.header.imageMessage
					mediaCacheData.set(`image:${image.url}`, proto.Message.encode({ imageMessage: image }).finish())
					return {
						title: card.header.title,
						text: card.body.text,
						image: { url: image.url },
						buttons: card.nativeFlowMessage.buttons.map(button => {
							const params = JSON.parse(button.buttonParamsJson)
							return { id: params.id, displayText: params.display_text }
						})
					}
				})
			}
		}
	}
	const generated = await generateWAMessage('10000000001@s.whatsapp.net', content, {
		userJid: '10000000002@s.whatsapp.net',
		messageId: `ARTIFACT_${fixture.sampleId}`,
		mediaCache: { get: key => mediaCacheData.get(key), set: () => {}, del: () => {}, flushAll: () => {} },
		upload: async () => {
			rejectedLiveUploads++
			throw new Error('No live upload authorized by artifact verification')
		}
	})
	const actual = generated.message
	if (replies) {
		assert.equal(actual.messageContextInfo.messageSecret.length, 32)
		assert.equal(actual.messageContextInfo.deviceListMetadata.recipientKeyHash.length, 10)
		assert.equal(actual.messageContextInfo.deviceListMetadataVersion, 2)
		assert.ok(Number(actual.messageContextInfo.deviceListMetadata.recipientTimestamp) > 0)
		actual.messageContextInfo = expected.messageContextInfo
	} else {
		assert.ok(!actual.messageContextInfo)
	}
	if (fixture.sampleId === 'N03') {
		const params = JSON.parse(actual.interactiveMessage.nativeFlowMessage.messageParamsJson)
		assert.equal(params.from, 'api')
		assert.match(params.templateId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
		actual.interactiveMessage.nativeFlowMessage.messageParamsJson =
			expected.interactiveMessage.nativeFlowMessage.messageParamsJson
	}
	assert.deepEqual(protobufObject(actual), protobufObject(expected))
	const nodes = getInteractiveMessageRelayNodes(content)
	const expectedNodes = structuredClone(fixture.relayNodes)
	if (replies) {
		assert.match(nodes[0].attrs.privacy_mode_ts, /^\d+$/)
		assert.match(nodes[0].content[1].attrs.decision_id, /^[0-9a-f]{40}$/)
		expectedNodes[0].attrs.privacy_mode_ts = nodes[0].attrs.privacy_mode_ts
		expectedNodes[0].content[1].attrs.decision_id = nodes[0].content[1].attrs.decision_id
	}
	assert.deepEqual(nodes, expectedNodes)
	for (const node of nodes) assert.deepEqual(normalize(await decodeBinaryNode(encodeBinaryNode(node))), node)
	results.push({ sampleId: fixture.sampleId, packagedApiProfileMatches: true, packagedRelayNodesMatch: true })
}
assert.equal(rejectedLiveUploads, 0)
process.stdout.write(
	JSON.stringify(
		{ checkedArtifact: 'baileys-review.tgz', noLiveConnectionOrUpload: true, verifiedProfiles: results },
		null,
		2
	) + '\n'
)
