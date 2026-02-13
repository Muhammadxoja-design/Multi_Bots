/**
 * Escapes special characters for HTML parse mode in Telegram.
 * @param text The raw text to escape.
 * @returns The escaped text safe for HTML parsing.
 */
export function escapeHtml(text: string): string {
	if (!text) return ''
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;')
}
