import { MyContext } from '@/core/context'
import { aiHandler } from '@/features/ai/handler'
import { notesHandler } from '@/features/notes/handler'
import { logger } from '@/utils/logger'
import { Composer } from 'grammy'

export const mainRouter = new Composer<MyContext>()

mainRouter.on('message:text', async (ctx, next) => {
	const threadId = ctx.msg.message_thread_id
	const topics = ctx.session.topics

	// If no topics defined yet, or no thread ID, default to AI handler (General)
	if (!topics || !threadId) {
		return aiHandler.middleware()(ctx, next)
	}

	// Route based on Thread ID
	if (threadId === topics.notes) {
		logger.debug(`Routing to Notes Handler (Thread: ${threadId})`)
		return notesHandler.middleware()(ctx, next)
	}

	if (threadId === topics.general) {
		logger.debug(`Routing to AI Handler (Thread: ${threadId})`)
		return aiHandler.middleware()(ctx, next)
	}

	// Fallback for unknown topics -> AI Handler
	logger.debug(`Unknown topic (${threadId}), routing to AI Handler`)
	return aiHandler.middleware()(ctx, next)
})
