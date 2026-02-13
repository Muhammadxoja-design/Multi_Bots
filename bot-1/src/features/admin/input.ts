import { MyContext } from '@/core/context'
import { SettingsService } from '@/services/settings'
import { renderDashboard } from './dashboard'

export async function handleAdminInput(ctx: MyContext) {
	if (ctx.session.step === 'awaiting_reply_text') {
		const text = ctx.message?.text
		if (!text) return

		// 1. Update Settings
		await SettingsService.updateSettings({ autoReplyText: text })
		delete ctx.session.step // Clear session

		// 2. Delete User's Text Message (Keep chat clean)
		try {
			await ctx.deleteMessage()
		} catch (e) {
			// ignore
		}

		// 3. Update the Dashboard Message (if exists)
		const settings = await SettingsService.getSettings()
		if (settings.dashboardChatId && settings.dashboardMessageId) {
			try {
				const dashboard = await renderDashboard(ctx)
				await ctx.api.editMessageText(
					settings.dashboardChatId,
					settings.dashboardMessageId,
					dashboard.text,
					{
						parse_mode: 'HTML',
						reply_markup: dashboard.keyboard,
					},
				)
			} catch (error) {
				// If edit fails (e.g. message deleted), send a new one?
				// For now, just ignore or maybe log.
				// User can type /start to get a new dashboard.
			}
		}
	}
}
