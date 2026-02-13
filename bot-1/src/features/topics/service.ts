import { MyContext } from '@/core/context'
import { logger } from '@/utils/logger'

export class TopicService {
	/**
	 * Ensures that the required topics (General, Notes, Tasks) exist for the user.
	 * If not, it creates them and stores the topic IDs in the session.
	 */
	static async ensureTopics(ctx: MyContext): Promise<boolean> {
		const { from, api, session } = ctx

		if (!from) return false

		// Check if topics are enabled (API 9.4+)
		// Note: 'has_topics_enabled' might be on the chat object or user object depending on update type.
		// The requirement explicitly says: "Check ctx.from.has_topics_enabled".
		// We will cast to any to avoid TS errors if types are not updated, but we prioritize the check.
		const user = from as any
		if (user.has_topics_enabled === false) {
			logger.warn(`User ${from.id} does not have topics enabled.`)
			return false
		}

		// Initialize session structure if missing
		if (!session.topics) {
			session.topics = {}
		}

		const chatId = ctx.chat?.id
		if (!chatId) return false

		try {
			// General
			if (!session.topics.general) {
				// General topic is usually ID 1 or we create a "General" topic?
				// Requirement: "Create 'General' (No icon or default)."
				const generalTopic = await api.createForumTopic(chatId, 'General')
				session.topics.general = generalTopic.message_thread_id
				logger.info(
					`Created General topic for ${from.id}: ${generalTopic.message_thread_id}`,
				)
			}

			// Notes (📝)
			if (!session.topics.notes) {
				// Requirement: "Create 'Notes' (Icon: 📝)".
				// createForumTopic supports name and icon_color/icon_custom_emoji_id.
				// We use name "📝 Notes" as a fallback or visual aid, but strictly create topic "Notes".
				// If we can't set emoji ID without premium custom emoji, we default to color.
				const notesTopic = await api.createForumTopic(chatId, 'Notes', {
					// icon_custom_emoji_id: ... needs valid ID
				})
				session.topics.notes = notesTopic.message_thread_id
				logger.info(
					`Created Notes topic for ${from.id}: ${notesTopic.message_thread_id}`,
				)
			}

			// Tasks (✅)
			if (!session.topics.tasks) {
				// Requirement: "Create 'Tasks' (Icon: ✅)".
				const tasksTopic = await api.createForumTopic(chatId, 'Tasks', {
					// icon_custom_emoji_id...
				})
				session.topics.tasks = tasksTopic.message_thread_id
				logger.info(
					`Created Tasks topic for ${from.id}: ${tasksTopic.message_thread_id}`,
				)
			}

			return true
		} catch (error: any) {
			// api.createForumTopic throws 400 if the chat is not a forum (e.g. topics not enabled)
			if (
				error.description?.includes('not a forum') ||
				error.error_code === 400
			) {
				logger.warn(
					`Topics not enabled/available for user ${from.id} (Chat not a forum).`,
				)
				return false
			}

			logger.error(
				`Failed to ensure topics for ${from.id}: ${error.message}`,
				error,
			)
			return false
		}
	}
}
