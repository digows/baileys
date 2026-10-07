import { Boom } from '@hapi/boom'
import { randomBytes, randomUUID } from 'crypto'
import { Readable } from 'stream'
import { proto } from '../../WAProto/index.js'
import type {
	AnyMediaMessageContent,
	AnyMessageContent,
	InteractiveMessageContent,
	MessageContentGenerationOptions,
	ReplyButtonOption,
	WAMediaUpload,
	WAMessageContent
} from '../Types'
import type { BinaryNode } from '../WABinary'
import { unixTimestampSeconds } from './generics'

type MediaPreparationFunction = (
	content: AnyMediaMessageContent,
	options: MessageContentGenerationOptions
) => Promise<WAMessageContent>

const interactiveContentKeys = ['replyButtons', 'urlButton', 'list', 'carousel'] as const

export const isInteractiveMessageContent = (content: AnyMessageContent): content is InteractiveMessageContent =>
	interactiveContentKeys.some(key => key in content)

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Boom(`Invalid ${field}`, { statusCode: 400 })
	}
}

const assertText = (value: unknown, field: string): void => {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Boom(`Missing or invalid ${field}`, { statusCode: 400 })
	}
}

const assertOptionalText = (value: unknown, field: string): void => {
	if (value !== undefined && typeof value !== 'string') {
		throw new Boom(`Invalid ${field}`, { statusCode: 400 })
	}
}

function assertNonEmptyArray(value: unknown, field: string): asserts value is unknown[] {
	if (!Array.isArray(value) || !value.length) {
		throw new Boom(`Require at least one ${field}`, { statusCode: 400 })
	}
}

const validateButtons = (buttons: unknown): void => {
	assertNonEmptyArray(buttons, 'reply button')
	for (const button of buttons) {
		assertRecord(button, 'reply button')
		assertText(button.id, 'button id')
		assertText(button.displayText, 'button displayText')
	}
}

const validateImage = (image: unknown): void => {
	if (Buffer.isBuffer(image) && image.length) {
		return
	}

	assertRecord(image, 'image')
	if (image.stream instanceof Readable || image.url instanceof URL) {
		return
	}

	assertText(image.url, 'image url')
}

const validateUrl = (value: unknown, field: string): void => {
	assertText(value, field)
	try {
		const url = new URL(value as string)
		if (url.protocol === 'https:' || url.protocol === 'http:') {
			return
		}
	} catch {}

	throw new Boom(`Invalid ${field}: require an absolute HTTP(S) URL`, { statusCode: 400 })
}

const validateContent = (content: InteractiveMessageContent): void => {
	if (interactiveContentKeys.filter(key => key in content).length !== 1) {
		throw new Boom('Require exactly one interactive format', { statusCode: 400 })
	}

	if ('replyButtons' in content) {
		const replies = content.replyButtons
		assertRecord(replies, 'replyButtons')
		assertText(replies.text, 'replyButtons text')
		assertOptionalText(replies.footer, 'replyButtons footer')
		validateButtons(replies.buttons)
		if (replies.image !== undefined) {
			validateImage(replies.image)
		}
	} else if ('urlButton' in content) {
		const action = content.urlButton
		assertRecord(action, 'urlButton')
		assertText(action.text, 'urlButton text')
		assertOptionalText(action.footer, 'urlButton footer')
		assertText(action.displayText, 'urlButton displayText')
		validateUrl(action.url, 'urlButton url')
		if (action.merchantUrl !== undefined) {
			validateUrl(action.merchantUrl, 'urlButton merchantUrl')
		}
	} else if ('list' in content) {
		const list = content.list
		assertRecord(list, 'list')
		assertText(list.title, 'list title')
		assertText(list.description, 'list description')
		assertText(list.buttonText, 'list buttonText')
		assertOptionalText(list.footer, 'list footer')
		assertNonEmptyArray(list.sections, 'list section')
		for (const section of list.sections) {
			assertRecord(section, 'list section')
			assertOptionalText(section.title, 'section title')
			assertNonEmptyArray(section.rows, 'list row')
			for (const row of section.rows) {
				assertRecord(row, 'list row')
				assertText(row.rowId, 'rowId')
				assertText(row.title, 'row title')
				assertOptionalText(row.description, 'row description')
			}
		}
	} else {
		assertRecord(content.carousel, 'carousel')
		assertText(content.carousel.text, 'carousel text')
		assertNonEmptyArray(content.carousel.cards, 'carousel card')
		for (const card of content.carousel.cards) {
			assertRecord(card, 'carousel card')
			assertText(card.title, 'card title')
			assertText(card.text, 'card text')
			validateImage(card.image)
			validateButtons(card.buttons)
		}
	}
}

export const generateInteractiveMessageContent = async (
	content: InteractiveMessageContent,
	options: MessageContentGenerationOptions,
	prepareMedia: MediaPreparationFunction
): Promise<proto.Message> => {
	// Validate every card/row before the first media upload, including JavaScript callers.
	validateContent(content)
	const prepareImage = async (image: WAMediaUpload) => {
		const prepared = await prepareMedia({ image }, options)
		if (!prepared.imageMessage) {
			throw new Boom('Image preparation returned no imageMessage', { statusCode: 500 })
		}

		return prepared.imageMessage
	}

	if ('replyButtons' in content) {
		const replies = content.replyButtons
		const imageMessage = replies.image === undefined ? undefined : await prepareImage(replies.image)
		// N23/N25 used random opaque recipient metadata, not a verified Signal-key digest.
		// These private fields were tested together; their individual necessity is unproven.
		return proto.Message.create({
			messageContextInfo: {
				messageSecret: randomBytes(32),
				deviceListMetadata: { recipientKeyHash: randomBytes(10), recipientTimestamp: unixTimestampSeconds() },
				deviceListMetadataVersion: 2
			},
			documentWithCaptionMessage: {
				message: {
					buttonsMessage: {
						contentText: replies.text,
						...(replies.footer === undefined ? {} : { footerText: replies.footer }),
						...(imageMessage ? { imageMessage } : {}),
						headerType: imageMessage
							? proto.Message.ButtonsMessage.HeaderType.IMAGE
							: proto.Message.ButtonsMessage.HeaderType.EMPTY,
						buttons: replies.buttons.map(button => ({
							buttonId: button.id,
							buttonText: { displayText: button.displayText },
							type: proto.Message.ButtonsMessage.Button.Type.RESPONSE
						}))
					}
				}
			}
		})
	}

	if ('urlButton' in content) {
		const action = content.urlButton
		return proto.Message.create({
			interactiveMessage: {
				body: { text: action.text },
				...(action.footer === undefined ? {} : { footer: { text: action.footer } }),
				nativeFlowMessage: {
					buttons: [
						{
							name: 'cta_url',
							buttonParamsJson: JSON.stringify({
								display_text: action.displayText,
								url: action.url,
								merchant_url: action.merchantUrl ?? action.url
							})
						}
					],
					messageParamsJson: JSON.stringify({ from: 'api', templateId: randomUUID() })
				}
			}
		})
	}

	if ('list' in content) {
		const list = content.list
		return proto.Message.create({
			listMessage: {
				title: list.title,
				description: list.description,
				buttonText: list.buttonText,
				...(list.footer === undefined ? {} : { footerText: list.footer }),
				listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
				sections: list.sections.map(section => ({ ...section, rows: section.rows.map(row => ({ ...row })) }))
			}
		})
	}

	const cards: proto.Message.IInteractiveMessage[] = []
	for (const card of content.carousel.cards) {
		cards.push({
			header: { title: card.title, hasMediaAttachment: true, imageMessage: await prepareImage(card.image) },
			body: { text: card.text },
			footer: { text: '' },
			nativeFlowMessage: { messageParamsJson: '{}', buttons: card.buttons.map(createNativeReplyButton) }
		})
	}

	// N47: Web interaction reported; iOS shows text/images but disables selection.
	// Horizontal iOS navigation and an N47-specific callback remain unconfirmed.
	return proto.Message.create({
		interactiveMessage: {
			header: { hasMediaAttachment: false },
			body: { text: content.carousel.text },
			carouselMessage: { cards }
		}
	})
}

const createNativeReplyButton = (
	button: ReplyButtonOption
): proto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton => ({
	name: 'quick_reply',
	buttonParamsJson: JSON.stringify({ display_text: button.displayText, id: button.id })
})

export const getInteractiveMessageRelayNodes = (content: InteractiveMessageContent): BinaryNode[] => {
	if ('list' in content) {
		// N04 pairs this node name with SINGLE_SELECT, not a product catalogue.
		return [{ tag: 'biz', attrs: {}, content: [{ tag: 'list', attrs: { type: 'product_list', v: '2' } }] }]
	}

	const children: BinaryNode[] = [
		{
			tag: 'interactive',
			attrs: { type: 'native_flow', v: '1' },
			content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
		}
	]
	const businessNode: BinaryNode = {
		tag: 'biz',
		attrs: {},
		content: children
	}
	if ('replyButtons' in content) {
		businessNode.attrs = { actual_actors: '2', host_storage: '2', privacy_mode_ts: unixTimestampSeconds().toString() }
		children.push({
			tag: 'quality_control',
			attrs: { decision_id: randomBytes(20).toString('hex'), source_type: 'third_party' },
			content: [{ tag: 'decision_source', attrs: { value: 'df' } }]
		})
	}

	return [businessNode]
}
