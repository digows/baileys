import { Boom } from '@hapi/boom'
import { jest } from '@jest/globals'
import { proto } from '../../../WAProto/index.js'
import type { AnyMessageContent, MessageGenerationOptions } from '../../Types'
import { getInteractiveMessageRelayNodes } from '../../Utils/interactive-messages'
import { generateWAMessage, generateWAMessageContent, normalizeMessageContent } from '../../Utils/messages'
import { decodeBinaryNode, encodeBinaryNode } from '../../WABinary'
import {
	createFixtureMediaCache,
	expectSelectedMessage,
	fixtureObject,
	generationCases
} from '../TestUtils/interactive-fixtures'

const destinationJid = '10000000001@s.whatsapp.net'
const userJid = '10000000002@s.whatsapp.net'
const upload = jest.fn<MessageGenerationOptions['upload']>(async () => {
	throw new Error('Unexpected live upload')
})
const options: MessageGenerationOptions = {
	userJid,
	upload,
	mediaCache: createFixtureMediaCache(),
	messageId: 'GENERATION_TEST'
}

beforeEach(() => upload.mockClear())

describe('high-level interactive generation', () => {
	it.each(generationCases)(
		'generates the final selected $sampleId message and binary nodes',
		async ({ content, profile }) => {
			const generated = await generateWAMessage(destinationJid, content, { ...options })
			expect(generated.key.id).toBe('GENERATION_TEST')
			expect(generated.key.remoteJid).toBe(destinationJid)
			expectSelectedMessage(generated.message!, profile)
			const decoded = proto.Message.decode(proto.Message.encode(generated.message!).finish())
			expectSelectedMessage(decoded, profile)
			const nodes = getInteractiveMessageRelayNodes(content)
			const expectedNodes = structuredClone(profile.relayNodes)
			if ('replyButtons' in content) {
				expect(nodes[0]!.attrs.privacy_mode_ts).toMatch(/^\d+$/)
				const qualityControl = nodes[0]!.content
				expect(Array.isArray(qualityControl)).toBe(true)
				if (!Array.isArray(qualityControl)) throw new Error('Expected business children')
				expect(qualityControl[1]!.attrs.decision_id).toMatch(/^[0-9a-f]{40}$/)
				expectedNodes[0]!.attrs.privacy_mode_ts = nodes[0]!.attrs.privacy_mode_ts!
				const expectedChildren = expectedNodes[0]!.content
				if (!Array.isArray(expectedChildren)) throw new Error('Expected fixture business children')
				expectedChildren[1]!.attrs.decision_id = qualityControl[1]!.attrs.decision_id!
			}

			expect(nodes).toEqual(expectedNodes)
			for (const node of nodes) {
				expect(JSON.parse(JSON.stringify(await decodeBinaryNode(encodeBinaryNode(node))))).toEqual(node)
			}

			expect(upload).not.toHaveBeenCalled()
		}
	)

	it('uses fresh private metadata and UUIDs for separate copies', async () => {
		const replies = generationCases[0]!.content
		const first = await generateWAMessageContent(replies, options)
		const second = await generateWAMessageContent(replies, options)
		expect(first.messageContextInfo!.messageSecret).not.toEqual(second.messageContextInfo!.messageSecret)
		expect(first.messageContextInfo!.deviceListMetadata!.recipientKeyHash).not.toEqual(
			second.messageContextInfo!.deviceListMetadata!.recipientKeyHash
		)
		const url = generationCases.find(testCase => 'urlButton' in testCase.content)!.content
		const firstUrl = await generateWAMessageContent(url, options)
		const secondUrl = await generateWAMessageContent(url, options)
		expect(firstUrl.interactiveMessage!.nativeFlowMessage!.messageParamsJson).not.toEqual(
			secondUrl.interactiveMessage!.nativeFlowMessage!.messageParamsJson
		)
	})

	it('omits optional footers and defaults merchant_url to the target', async () => {
		const generated = await generateWAMessageContent(
			{ urlButton: { text: 'Open', displayText: 'Website', url: 'https://example.com' } },
			options
		)
		expect(generated.interactiveMessage!.footer).toBeFalsy()
		expect(JSON.parse(generated.interactiveMessage!.nativeFlowMessage!.buttons![0]!.buttonParamsJson!)).toEqual({
			display_text: 'Website',
			url: 'https://example.com',
			merchant_url: 'https://example.com'
		})
		const distinctMerchant = await generateWAMessageContent(
			{
				urlButton: {
					text: 'Open',
					displayText: 'Website',
					url: 'https://example.com',
					merchantUrl: 'https://example.org'
				}
			},
			options
		)
		expect(
			JSON.parse(distinctMerchant.interactiveMessage!.nativeFlowMessage!.buttons![0]!.buttonParamsJson!)
		).toHaveProperty('merchant_url', 'https://example.org')
	})

	it.each([
		{ replyButtons: null },
		{ replyButtons: { text: '', buttons: [] } },
		{ replyButtons: { text: 'Choose', buttons: [{ id: '', displayText: 'Choice' }] } },
		{ replyButtons: { text: 'Choose', buttons: [{ id: 'choice', displayText: '' }] } },
		{ replyButtons: { text: 'Choose', buttons: [{ id: 'choice', displayText: 'Choice' }], image: null } },
		{ urlButton: { text: 'Open', displayText: 'Website', url: 'not a URL' } },
		{ urlButton: { text: 'Open', displayText: '', url: 'https://example.com' } },
		{ urlButton: { text: 'Open', displayText: 'Website', url: 'javascript:alert(1)' } },
		{ urlButton: { text: 'Open', displayText: 'Website', url: 'https://example.com', merchantUrl: '' } },
		{ list: { title: 'Choose', description: 'Options', buttonText: 'Open', sections: [] } },
		{ list: { title: 'Choose', description: 'Options', buttonText: 'Open', sections: [{ rows: [] }] } },
		{
			list: { title: 'Choose', description: 'Options', buttonText: 'Open', sections: [{ rows: [{ title: 'Choice' }] }] }
		},
		{ carousel: { text: 'Cards', cards: [] } },
		{ carousel: { text: 'Cards', cards: [null] } },
		{
			carousel: {
				text: 'Cards',
				cards: [{ image: { url: 'https://example.invalid/image' }, title: 'Card', text: 'Choose', buttons: [] }]
			}
		},
		{ replyButtons: { text: 'Choose', buttons: [{ id: 'a', displayText: 'A' }] }, list: {} }
	])('rejects malformed JavaScript input before upload: %j', async content => {
		await expect(generateWAMessageContent(content as unknown as AnyMessageContent, options)).rejects.toBeInstanceOf(
			Boom
		)
		expect(upload).not.toHaveBeenCalled()
	})

	it('validates all carousel cards before preparing any media', async () => {
		const content = structuredClone(generationCases.find(testCase => 'carousel' in testCase.content)!.content)
		if (!('carousel' in content)) throw new Error('Expected carousel')
		content.carousel.cards[1]!.buttons[0]!.id = ''
		await expect(generateWAMessageContent(content, { ...options, mediaCache: undefined })).rejects.toMatchObject({
			output: { statusCode: 400 }
		})
		expect(upload).not.toHaveBeenCalled()
	})

	it('rejects carousel generation options that would change its required root-context omission', async () => {
		const content = generationCases.find(testCase => 'carousel' in testCase.content)!.content
		const quoted = {
			key: { remoteJid: destinationJid, id: 'ORIGINAL', fromMe: false },
			message: { conversation: 'Original' }
		}
		await expect(generateWAMessage(destinationJid, content, { ...options, quoted })).rejects.toMatchObject({
			output: { statusCode: 400 }
		})
		await expect(
			generateWAMessage(destinationJid, content, { ...options, ephemeralExpiration: 86400 })
		).rejects.toMatchObject({ output: { statusCode: 400 } })
		expect(upload).not.toHaveBeenCalled()
	})

	it('propagates preparation/cache failures without a partial message', async () => {
		const failure = new Error('Media cache failed')
		const content = generationCases.find(testCase => testCase.sampleId === 'N25')!.content
		await expect(
			generateWAMessageContent(content, {
				...options,
				mediaCache: {
					...createFixtureMediaCache(),
					get: () => {
						throw failure
					}
				}
			})
		).rejects.toBe(failure)
	})

	it('propagates upload failure through the existing media preparation path', async () => {
		const failure = new Error('Image upload failed')
		const failingUpload = jest.fn<MessageGenerationOptions['upload']>(async () => {
			throw failure
		})
		await expect(
			generateWAMessageContent(
				{
					replyButtons: {
						text: 'Choose',
						image: Buffer.from('offline upload fixture'),
						buttons: [{ id: 'choice', displayText: 'Choose' }]
					}
				},
				{ ...options, upload: failingUpload, mediaCache: undefined }
			)
		).rejects.toBe(failure)
		expect(failingUpload).toHaveBeenCalledTimes(1)
	})

	it('retains ordinary reporting, quotes, forwarding, edits, deletions and reactions', async () => {
		const original = await generateWAMessage(
			destinationJid,
			{ text: 'Original' },
			{ ...options, messageId: 'ORIGINAL' }
		)
		expect(original.message!.messageContextInfo!.messageSecret).toHaveLength(32)
		const quoted = await generateWAMessage(destinationJid, { text: 'Quoted' }, { ...options, quoted: original })
		expect(quoted.message!.extendedTextMessage!.contextInfo!.stanzaId).toBe('ORIGINAL')
		const forwarded = await generateWAMessageContent({ forward: original }, options)
		expect(normalizeMessageContent(forwarded)!.extendedTextMessage!.text).toBe('Original')
		const deleted = await generateWAMessageContent({ delete: original.key }, options)
		expect(deleted.protocolMessage!.type).toBe(proto.Message.ProtocolMessage.Type.REVOKE)
		const edited = await generateWAMessageContent({ text: 'Edited', edit: original.key }, options)
		expect(edited.protocolMessage!.editedMessage!.extendedTextMessage!.text).toBe('Edited')
		const reaction = await generateWAMessageContent({ react: { key: original.key, text: 'OK' } }, options)
		expect(reaction.reactionMessage!.text).toBe('OK')
		expect(reaction.messageContextInfo).toBeFalsy()
		const image = await generateWAMessageContent(
			{ image: { url: 'https://example.invalid/fixtures/card-1.enc' } },
			options
		)
		expect(image.imageMessage!.mediaKey).toHaveLength(32)
		expect(image.messageContextInfo!.messageSecret).toHaveLength(32)
		expect(fixtureObject(image)).toHaveProperty('imageMessage')
	})
})
