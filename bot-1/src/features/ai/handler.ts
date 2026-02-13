import { MyContext } from '@/core/context'
import { GroqService } from '@/services/groq'
import { logger } from '@/utils/logger'
import { escapeMarkdown } from '@/utils/text'
import { Composer } from 'grammy'

export const aiHandler = new Composer<MyContext>()

aiHandler.on('message:text', async ctx => {
	const userText = ctx.msg.text
	const threadId = ctx.msg.message_thread_id

	// 1. Show typing status
	await ctx.replyWithChatAction('typing', { message_thread_id: threadId })

	// 2. Prepare History (ensure it exists)
	if (!ctx.session.history) {
		ctx.session.history = []
	}

	// 3. Call Groq
	const responseText = await GroqService.chat(ctx.session.history, userText)

	if (!responseText) {
		return
	}

	// 4. Update History (Limit to last 10 turns = 20 messages)
	ctx.session.history.push({ role: 'user', parts: userText })
	ctx.session.history.push({ role: 'model', parts: responseText })

	if (ctx.session.history.length > 20) {
		ctx.session.history = ctx.session.history.slice(-20)
	}

	// 5. Reply
	// We sanitize the response for MarkdownV2 to allow basic formatting if Gemini outputs it,
	// but for safety/simplicity in V1 we might just use plain text or basic sanitization.
	// Implementation Note: Gemini often outputs Markdown (bold, lists).
	// A naive escapeMarkdown might break structure.
	// For this step, we'll try to default to Markdown parsing but catch errors, or use safe escaping.
	// Given requirement "Reply with sanitized MarkdownV2", we use the escape util.

	try {
		const safeText = escapeMarkdown(responseText)
		await ctx.reply(safeText, {
			parse_mode: 'MarkdownV2',
			message_thread_id: threadId,
		})
	} catch (error) {
		// Fallback if markdown parsing fails
		logger.warn(
			`Markdown send failed, falling back to plain text. Response: ${responseText}`,
		)
		await ctx.reply(responseText, {
			message_thread_id: threadId,
		})
	}
})
