import { db } from '@/db'
import { messages } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'

export class HistoryService {
	/**
	 * Saves a message to the database.
	 * @param peerId The Telegram User ID or Chat ID.
	 * @param role 'user' or 'assistant'.
	 * @param content The text content.
	 */
	static async saveMessage(
		peerId: number,
		role: 'user' | 'assistant',
		content: string,
	) {
		await db.insert(messages).values({
			peerId,
			role,
			content,
		})
	}

	/**
	 * Retrieves the last N messages for a user, formatted for the LLM.
	 * @param peerId The Telegram User ID or Chat ID.
	 * @param limit Number of messages to retrieve (default 10).
	 * @returns A formatted string of the conversation history.
	 */
	static async getRecentContext(peerId: number, limit = 10): Promise<string> {
		const history = await db
			.select()
			.from(messages)
			.where(eq(messages.peerId, peerId))
			.orderBy(desc(messages.createdAt))
			.limit(limit)

		// Reverse to chronological order
		history.reverse()

		if (history.length === 0) return ''

		return history
			.map(msg => {
				const roleName = msg.role === 'user' ? 'User' : 'Assistant'
				return `${roleName}: ${msg.content}`
			})
			.join('\n')
	}
}
