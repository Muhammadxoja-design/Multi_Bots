export const PREMIUM_EMOJIS: Record<string, string> = {
	joy: '5368324170671202286', // 😄 (Placeholder ID)
	think: '5368324170671202286', // 🤔
	like: '5368324170671202286', // 👍
	heart: '5368324170671202286', // ❤️
	fire: '5368324170671202286', // 🔥
}

/**
 * Injects Premium Emojis into text by replacing placeholders.
 * @param text Text containing placeholders like (joy), (think)
 * @returns Text with <tg-emoji> tags
 */
export function injectPremium(text: string): string {
	let processedText = text

	for (const [key, id] of Object.entries(PREMIUM_EMOJIS)) {
		const placeholder = `(${key})`
		const regex = new RegExp(`\\(${key}\\)`, 'gi') // Case-insensitive replace
		if (regex.test(processedText)) {
			// fallback emoji for safety (though tg-emoji handles it usually)
			// Actually, just wrap it.
			processedText = processedText.replace(
				regex,
				`<tg-emoji emoji-id="${id}">✨</tg-emoji>`,
			)
		}
	}

	return processedText
}
