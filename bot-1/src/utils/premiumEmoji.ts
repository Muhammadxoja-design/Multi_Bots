/**
 * Premium Emoji Mapper
 * Since bots cannot send actual premium emojis without a premium subscription (which is rare for bots),
 * or specific entities, we often use <tg-emoji> tag if the bot has access, or fallback to standard emojis.
 *
 * Format from AI: (premium:ok) -> custom_emoji_id or fallback
 */

const EMOJI_MAP: Record<string, string> = {
	ok: '👌',
	heart: '❤️',
	fire: '🔥',
	star: '⭐',
	check: '✅',
	warn: '⚠️',
	smile: '😊',
	sad: '😔',
	thinking: '🤔',
	party: '🎉',
	// Add more mappings as needed
}

export function transformPremiumEmoji(text: string): string {
	return text.replace(/\(premium:(\w+)\)/g, (_, name) => {
		// In a real scenario, if you have custom_emoji_id, you'd use:
		// <tg-emoji emoji-id="123456">👍</tg-emoji>
		// For now, we fallback to standard emojis to ensure visibility.
		return EMOJI_MAP[name] || ''
	})
}
