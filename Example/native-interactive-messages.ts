import type { InteractiveMessageContent, WAMediaUpload } from '../src/index'

export interface NativeInteractiveExample {
	name: string
	content: InteractiveMessageContent
}

/**
 * Builds five controls without uploading or sending anything. Supply fresh media
 * and a distinct choicePrefix for each authorized iOS-first/Web-first run.
 * N47 carousel selection remains disabled on the tested iOS client; horizontal
 * navigation is unconfirmed and no callback was captured for N47 itself.
 */
export const createNativeInteractiveExamples = (
	firstImage: WAMediaUpload,
	secondImage: WAMediaUpload,
	choicePrefix: string
): NativeInteractiveExample[] => [
	{
		name: 'Text replies',
		content: {
			replyButtons: {
				text: 'Choose an option',
				footer: 'Interactive example',
				buttons: [
					{ id: `${choicePrefix}_text_a`, displayText: 'Option A' },
					{ id: `${choicePrefix}_text_b`, displayText: 'Option B' }
				]
			}
		}
	},
	{
		name: 'Image reply card',
		content: {
			replyButtons: {
				text: 'Choose an image option',
				image: firstImage,
				buttons: [
					{ id: `${choicePrefix}_image_a`, displayText: 'Option A' },
					{ id: `${choicePrefix}_image_b`, displayText: 'Option B' }
				]
			}
		}
	},
	{
		name: 'URL action',
		content: {
			urlButton: {
				text: 'Open the repository',
				displayText: 'Open Baileys',
				url: 'https://github.com/WhiskeySockets/Baileys'
			}
		}
	},
	{
		name: 'Single-select list',
		content: {
			list: {
				title: 'Choose an option',
				description: 'Open the list to choose',
				buttonText: 'Open list',
				sections: [
					{
						title: 'Options',
						rows: [
							{ rowId: `${choicePrefix}_list_a`, title: 'Option A', description: 'First option' },
							{ rowId: `${choicePrefix}_list_b`, title: 'Option B', description: 'Second option' }
						]
					}
				]
			}
		}
	},
	{
		name: 'Image carousel (iOS selection limitation)',
		content: {
			carousel: {
				text: 'Choose a card',
				cards: [
					{
						image: firstImage,
						title: 'Card 1',
						text: 'First image',
						buttons: [{ id: `${choicePrefix}_card_1`, displayText: 'Choose card 1' }]
					},
					{
						image: secondImage,
						title: 'Card 2',
						text: 'Second image',
						buttons: [{ id: `${choicePrefix}_card_2`, displayText: 'Choose card 2' }]
					}
				]
			}
		}
	}
]
