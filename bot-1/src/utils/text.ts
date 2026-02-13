/**
 * Escapes special characters for Telegram MarkdownV2.
 *
 * Telegram MarkdownV2 requires the following characters to be escaped:
 * _ * [ ] ( ) ~ ` > # + - = | { } . !
 *
 * @param text The raw text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export const escapeMarkdown = (text: string): string => {
	return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}
