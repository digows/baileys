import { readFileSync } from 'fs'
import { resolve } from 'path'
import { proto } from '../../../WAProto/index.js'
import type { CacheStore, InteractiveMessageContent, ReplyButtonOption } from '../../Types'
import type { BinaryNode } from '../../WABinary'

export interface SelectedProfile {
	sampleId: string
	message: proto.IMessage
	relayNodes: BinaryNode[]
}

interface SelectedEvidence {
	fixtures: SelectedProfile[]
}

export interface InteractiveGenerationCase {
	sampleId: string
	content: InteractiveMessageContent
	profile: SelectedProfile
}

export interface NativeResponseFixture {
	replyMessageId: string
	wireType: 'buttonsResponseMessage' | 'listResponseMessage' | 'templateButtonReplyMessage'
	selectedIdentifier: string
	targetMessageId: string
	response:
		| proto.Message.IButtonsResponseMessage
		| proto.Message.IListResponseMessage
		| proto.Message.ITemplateButtonReplyMessage
}

interface NativeResponseEvidence {
	fixtures: NativeResponseFixture[]
}

const evidencePath = resolve('baileys-native-interactive-evidence')
const selected = JSON.parse(readFileSync(resolve(evidencePath, 'selected-profiles.json'), 'utf8')) as SelectedEvidence

export const nativeResponseFixtures = (
	JSON.parse(readFileSync(resolve(evidencePath, 'native-response-fixtures.json'), 'utf8')) as NativeResponseEvidence
).fixtures

const fromLegacyButtons = (buttons: proto.Message.ButtonsMessage.IButton[]): ReplyButtonOption[] =>
	buttons.map(button => ({ id: button.buttonId!, displayText: button.buttonText!.displayText! }))

export const generationCases: InteractiveGenerationCase[] = selected.fixtures.map(profile => {
	const message = proto.Message.fromObject(profile.message)
	const replies = message.documentWithCaptionMessage?.message?.buttonsMessage
	const action = message.interactiveMessage?.nativeFlowMessage
	const list = message.listMessage
	const carousel = message.interactiveMessage?.carouselMessage
	let content: InteractiveMessageContent
	if (replies) {
		content = {
			replyButtons: {
				text: replies.contentText!,
				footer: replies.footerText!,
				buttons: fromLegacyButtons(replies.buttons!),
				...(replies.imageMessage ? { image: { url: replies.imageMessage.url! } } : {})
			}
		}
	} else if (action) {
		interface UrlParameters {
			display_text: string
			url: string
			merchant_url: string
		}
		const parameters = JSON.parse(action.buttons![0]!.buttonParamsJson!) as UrlParameters
		content = {
			urlButton: {
				text: message.interactiveMessage!.body!.text!,
				footer: message.interactiveMessage!.footer!.text!,
				displayText: parameters.display_text,
				url: parameters.url,
				merchantUrl: parameters.merchant_url
			}
		}
	} else if (list) {
		content = {
			list: {
				title: list.title!,
				description: list.description!,
				buttonText: list.buttonText!,
				footer: list.footerText!,
				sections: list.sections!.map(section => ({
					title: section.title!,
					rows: section.rows!.map(row => ({ rowId: row.rowId!, title: row.title!, description: row.description! }))
				}))
			}
		}
	} else if (carousel) {
		content = {
			carousel: {
				text: message.interactiveMessage!.body!.text!,
				cards: carousel.cards!.map(card => ({
					title: card.header!.title!,
					text: card.body!.text!,
					image: { url: card.header!.imageMessage!.url! },
					buttons: card.nativeFlowMessage!.buttons!.map(button => {
						interface ReplyParameters {
							id: string
							display_text: string
						}
						const parameters = JSON.parse(button.buttonParamsJson!) as ReplyParameters
						return { id: parameters.id, displayText: parameters.display_text }
					})
				}))
			}
		}
	} else {
		throw new Error(`Unknown selected fixture ${profile.sampleId}`)
	}

	return { sampleId: profile.sampleId, content, profile }
})

export const createFixtureMediaCache = (): CacheStore => {
	const cache = new Map<string, Uint8Array>()
	for (const profile of selected.fixtures) {
		const message = proto.Message.fromObject(profile.message)
		const image = message.documentWithCaptionMessage?.message?.buttonsMessage?.imageMessage
		const cards = message.interactiveMessage?.carouselMessage?.cards ?? []
		const images = [image, ...cards.map(card => card.header?.imageMessage)]
		for (const prepared of images) {
			if (prepared?.url) {
				cache.set(`image:${prepared.url}`, proto.Message.encode({ imageMessage: prepared }).finish())
			}
		}
	}

	return {
		get: <T>(key: string) => cache.get(key) as T | undefined,
		set: () => {},
		del: () => {},
		flushAll: () => {}
	}
}

export const fixtureObject = (message: proto.IMessage): Record<string, unknown> =>
	proto.Message.toObject(proto.Message.fromObject(message), { bytes: String, longs: Number, enums: String }) as Record<
		string,
		unknown
	>

export const expectSelectedMessage = (actual: proto.IMessage, profile: SelectedProfile): void => {
	const expected = proto.Message.fromObject(profile.message)
	const comparable = proto.Message.fromObject(actual)
	if (profile.sampleId === 'N23' || profile.sampleId === 'N25') {
		expect(actual.messageContextInfo?.messageSecret).toHaveLength(32)
		expect(actual.messageContextInfo?.deviceListMetadata?.recipientKeyHash).toHaveLength(10)
		expect(actual.messageContextInfo?.deviceListMetadataVersion).toBe(2)
		expect(Number(actual.messageContextInfo?.deviceListMetadata?.recipientTimestamp)).toBeGreaterThan(0)
		comparable.messageContextInfo = expected.messageContextInfo
	} else {
		expect(actual.messageContextInfo).toBeFalsy()
	}

	if (profile.sampleId === 'N03') {
		interface FlowParameters {
			from: string
			templateId: string
		}
		const parameters = JSON.parse(actual.interactiveMessage!.nativeFlowMessage!.messageParamsJson!) as FlowParameters
		expect(parameters.from).toBe('api')
		expect(parameters.templateId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
		comparable.interactiveMessage!.nativeFlowMessage!.messageParamsJson =
			expected.interactiveMessage!.nativeFlowMessage!.messageParamsJson
	}

	expect(fixtureObject(comparable)).toEqual(fixtureObject(expected))
}
