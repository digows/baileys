import { jest } from '@jest/globals'
import { proto } from '../../../WAProto/index.js'
import { DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import { makeLibSignalRepository } from '../../Signal/libsignal'
import type { makeMessagesSocket } from '../../Socket/messages-send'
import type {
	AnyMessageContent,
	AuthenticationState,
	BaileysEventMap,
	SignalDataTypeMap,
	SignalKeyStoreWithTransaction,
	SocketConfig,
	WAMessage
} from '../../Types'
import { initAuthCreds } from '../../Utils/auth-utils'
import { decryptMessageNode } from '../../Utils/decode-wa-message'
import { makeEventBuffer } from '../../Utils/event-buffer'
import { encodeWAMessage, unpadRandomMax16 } from '../../Utils/generics'
import logger from '../../Utils/logger'
import { makeMutex } from '../../Utils/make-mutex'
import { cleanMessage } from '../../Utils/process-message'
import { type BinaryNode, getBinaryNodeChild, getBinaryNodeChildren } from '../../WABinary'
import {
	createFixtureMediaCache,
	expectSelectedMessage,
	fixtureObject,
	generationCases,
	nativeResponseFixtures
} from '../TestUtils/interactive-fixtures'

const userJid = '10000000002:1@s.whatsapp.net'
const userLid = '10000000002:1@lid'
const destinationJid = '10000000001@s.whatsapp.net'
const silentLogger = logger.child({ test: 'interactive' }, { level: 'silent' })
type StoredSignalData<T extends keyof SignalDataTypeMap> = Record<string, SignalDataTypeMap[T]>

const createNewsletterSocketStub = () => {
	const keys: SignalKeyStoreWithTransaction = {
		get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]): Promise<StoredSignalData<T>> => {
			if (type === 'tctoken') {
				return Object.fromEntries(
					ids.map(id => [id, { senderTimestamp: Math.floor(Date.now() / 1000) }])
				) as StoredSignalData<T>
			}

			return {}
		},
		set: async () => {},
		isInTransaction: () => true,
		transaction: async operation => operation()
	}
	const authState: AuthenticationState = { creds: initAuthCreds(), keys }
	authState.creds.me = { id: userJid, lid: userLid, name: 'Test sender' }
	const signalRepository = makeLibSignalRepository(authState, silentLogger)
	jest.spyOn(signalRepository.lidMapping, 'getLIDForPN').mockResolvedValue(null)
	jest.spyOn(signalRepository, 'validateSession').mockResolvedValue({ exists: true })
	jest
		.spyOn(signalRepository, 'encryptMessage')
		.mockImplementation(async ({ data }) => ({ type: 'msg', ciphertext: data }))
	jest.spyOn(signalRepository, 'decryptMessage').mockImplementation(async ({ ciphertext }) => ciphertext)
	const ev = makeEventBuffer(silentLogger)
	return {
		authState,
		signalRepository,
		ev,
		user: authState.creds.me,
		messageMutex: makeMutex(),
		sendNode: jest.fn<(node: BinaryNode) => Promise<void>>(async () => {}),
		query: jest.fn<(node: BinaryNode) => Promise<BinaryNode>>(async () => {
			throw new Error('Unexpected query')
		}),
		upsertMessage: jest.fn(async (message: WAMessage) => {
			ev.emit('messages.upsert', { messages: [message], type: 'append' })
		}),
		fetchPrivacySettings: async () => ({}),
		groupMetadata: jest.fn(),
		groupToggleEphemeral: jest.fn(),
		registerSocketEndHandler: jest.fn<(handler: () => void) => void>(),
		serverProps: { privacyTokenOn1to1: false, lidTrustedTokenIssueToLid: false },
		executeUSyncQuery: async () => ({
			list: [
				{
					id: '10000000002@s.whatsapp.net',
					devices: { deviceList: [{ id: 0 }, { id: 1, keyIndex: 1 }, { id: 2, keyIndex: 1 }] }
				},
				{ id: destinationJid, devices: { deviceList: [{ id: 0 }, { id: 3, keyIndex: 1 }] } }
			]
		})
	}
}

type NewsletterSocketStub = ReturnType<typeof createNewsletterSocketStub>
let newsletter: NewsletterSocketStub
await jest.unstable_mockModule('../../Socket/newsletter', () => ({ makeNewsletterSocket: () => newsletter }))
const { makeMessagesSocket: createMessagesSocket } = await import('../../Socket/messages-send')
type MessageSocket = ReturnType<typeof makeMessagesSocket>
let socket: MessageSocket

beforeEach(() => {
	newsletter = createNewsletterSocketStub()
	const configuration: SocketConfig = {
		...DEFAULT_CONNECTION_CONFIG,
		auth: newsletter.authState,
		logger: silentLogger,
		mediaCache: createFixtureMediaCache(),
		enableRecentMessageCache: false,
		emitOwnEvents: true
	}
	socket = createMessagesSocket(configuration)
})

afterEach(() => {
	for (const [handler] of newsletter.registerSocketEndHandler.mock.calls) handler()
	newsletter.signalRepository.close?.()
	jest.restoreAllMocks()
})

describe('interactive sendMessage', () => {
	it.each(generationCases)(
		'sends $sampleId once with automatic business nodes and normal own-device wrapping',
		async ({ content, profile }) => {
			const upsert = jest.fn<(event: BaileysEventMap['messages.upsert']) => void>()
			newsletter.ev.on('messages.upsert', upsert)
			const generated = await socket.sendMessage(destinationJid, content, { messageId: 'SEND_TEST' })
			expect(generated!.key.id).toBe('SEND_TEST')
			expectSelectedMessage(generated!.message!, profile)
			expect(newsletter.sendNode).toHaveBeenCalledTimes(1)
			const stanza = newsletter.sendNode.mock.calls[0]![0]
			expect(stanza.attrs.id).toBe(generated!.key.id)
			expect(getBinaryNodeChildren(stanza, 'biz')).toHaveLength(1)
			expect(getBinaryNodeChild(stanza, 'bot')).toBeUndefined()
			const business = getBinaryNodeChild(stanza, 'biz')!
			if ('list' in content) {
				expect(getBinaryNodeChild(business, 'list')!.attrs).toEqual({ type: 'product_list', v: '2' })
			} else {
				expect(getBinaryNodeChild(business, 'interactive')!.attrs).toEqual({ type: 'native_flow', v: '1' })
			}

			expect(!!getBinaryNodeChild(business, 'quality_control')).toBe('replyButtons' in content)
			const requests = jest.mocked(newsletter.signalRepository.encryptMessage).mock.calls.map(([request]) => request)
			expect(requests).toHaveLength(4)
			let ownDeviceCopies = 0
			for (const request of requests) {
				const decoded = proto.Message.decode(unpadRandomMax16(request.data))
				if (decoded.deviceSentMessage) {
					ownDeviceCopies++
					expect(decoded.deviceSentMessage.destinationJid).toBe(destinationJid)
					expectSelectedMessage(decoded.deviceSentMessage.message!, profile)
				} else {
					expectSelectedMessage(decoded, profile)
				}
			}

			expect(ownDeviceCopies).toBe(2)
			await new Promise(resolve => setImmediate(resolve))
			expect(upsert).toHaveBeenCalledWith({ messages: [generated], type: 'append' })
		}
	)

	it.each(generationCases)('propagates relay failure for $sampleId without emitting success', async ({ content }) => {
		const failure = new Error('Relay failed')
		newsletter.sendNode.mockRejectedValueOnce(failure)
		await expect(socket.sendMessage(destinationJid, content)).rejects.toBe(failure)
		expect(newsletter.upsertMessage).not.toHaveBeenCalled()
	})

	it('rejects invalid controls before encryption or relay', async () => {
		await expect(
			socket.sendMessage(destinationJid, {
				replyButtons: { text: 'Choose', buttons: [{ id: '', displayText: 'Choice' }] }
			})
		).rejects.toMatchObject({ output: { statusCode: 400 } })
		expect(newsletter.signalRepository.encryptMessage).not.toHaveBeenCalled()
		expect(newsletter.sendNode).not.toHaveBeenCalled()
	})

	it('propagates media preparation failure before encryption or relay', async () => {
		const failure = new Error('Media cache failed')
		const configuration: SocketConfig = {
			...DEFAULT_CONNECTION_CONFIG,
			auth: newsletter.authState,
			logger: silentLogger,
			enableRecentMessageCache: false,
			mediaCache: {
				...createFixtureMediaCache(),
				get: () => {
					throw failure
				}
			}
		}
		const failingSocket = createMessagesSocket(configuration)
		const content = generationCases.find(testCase => testCase.sampleId === 'N25')!.content
		await expect(failingSocket.sendMessage(destinationJid, content)).rejects.toBe(failure)
		expect(newsletter.signalRepository.encryptMessage).not.toHaveBeenCalled()
		expect(newsletter.sendNode).not.toHaveBeenCalled()
	})

	it('preserves custom low-level relay nodes without injecting business metadata', async () => {
		const custom: BinaryNode = { tag: 'meta', attrs: { custom: 'test' } }
		await socket.relayMessage(
			destinationJid,
			{ conversation: 'Low-level' },
			{ messageId: 'RAW_TEST', additionalNodes: [custom] }
		)
		const stanza = newsletter.sendNode.mock.calls[0]![0]
		expect(getBinaryNodeChild(stanza, 'meta')).toEqual(custom)
		expect(getBinaryNodeChild(stanza, 'biz')).toBeUndefined()
	})

	it('retains poll/event nodes, ordinary media/text and reaction/edit/delete attributes', async () => {
		interface SendRegressionCase {
			content: AnyMessageContent
			meta?: BinaryNode['attrs']
			edit?: string
		}
		const key = { remoteJid: destinationJid, fromMe: true, id: 'ORIGINAL' }
		const cases: SendRegressionCase[] = [
			{ content: { text: 'Ordinary', linkPreview: null } },
			{ content: { image: { url: 'https://example.invalid/fixtures/card-1.enc' } } },
			{ content: { poll: { name: 'Choose', values: ['A', 'B'], selectableCount: 1 } }, meta: { polltype: 'creation' } },
			{
				content: { event: { name: 'Meeting', startDate: new Date('2026-10-07T10:00:00Z') } },
				meta: { event_type: 'creation' }
			},
			{ content: { react: { key, text: 'OK' } } },
			{ content: { text: 'Edited', edit: key }, edit: '1' },
			{ content: { delete: key }, edit: '7' }
		]
		for (const testCase of cases) {
			newsletter.sendNode.mockClear()
			await socket.sendMessage(destinationJid, testCase.content)
			const stanza = newsletter.sendNode.mock.calls[0]![0]
			expect(getBinaryNodeChild(stanza, 'biz')).toBeUndefined()
			expect(getBinaryNodeChild(stanza, 'meta')?.attrs).toEqual(testCase.meta)
			expect(stanza.attrs.edit).toBe(testCase.edit)
		}

		await new Promise(resolve => setImmediate(resolve))
	})
})

describe('captured native response decode and event delivery', () => {
	it.each(nativeResponseFixtures)(
		'preserves $wireType fields for $replyMessageId through decode and buffered upsert',
		async fixture => {
			const content = proto.Message.fromObject({ [fixture.wireType]: fixture.response })
			const stanza: BinaryNode = {
				tag: 'message',
				attrs: { from: destinationJid, id: fixture.replyMessageId, t: '1791320000' },
				content: [{ tag: 'enc', attrs: { type: 'msg', v: '2' }, content: encodeWAMessage(content) }]
			}
			const decoded = decryptMessageNode(stanza, userJid, userLid, newsletter.signalRepository, silentLogger)
			await decoded.decrypt()
			expect(decoded.fullMessage.messageStubType).toBeUndefined()
			cleanMessage(decoded.fullMessage, userJid, userLid)
			const received: WAMessage[] = []
			newsletter.ev.on('messages.upsert', event => {
				received.push(...event.messages)
			})
			newsletter.ev.buffer()
			newsletter.ev.emit('messages.upsert', { messages: [decoded.fullMessage], type: 'notify' })
			newsletter.ev.flush()
			expect(received).toHaveLength(1)
			expect(received[0]!.key.id).toBe(fixture.replyMessageId)
			expect(fixtureObject(received[0]!.message!)).toEqual(fixtureObject(content))
			expect(received[0]!.message![fixture.wireType]!.contextInfo!.stanzaId).toBe(fixture.targetMessageId)
		}
	)
})
