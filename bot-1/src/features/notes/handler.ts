import { MyContext } from '@/core/context'
import { DbService } from '@/services/db.service'
import { Composer } from 'grammy'

export const notesHandler = new Composer<MyContext>()

notesHandler.on('message:text', async ctx => {
	const userId = ctx.from?.id
	const content = ctx.msg.text

	if (!userId) return

	const saved = await DbService.addNote(userId, content)

	if (saved) {
		await ctx.reply(`💾 **Saved to Database!** (ID: #${saved.id})`, {
			parse_mode: 'Markdown',
			message_thread_id: ctx.msg.message_thread_id,
		})
	} else {
		await ctx.reply('❌ Failed to save note.', {
			message_thread_id: ctx.msg.message_thread_id,
		})
	}
})
