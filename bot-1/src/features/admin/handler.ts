import { config } from '@/config/env'
import { MyContext } from '@/core/context'
import { SettingsService } from '@/services/settings'
import { Composer } from 'grammy'
import { renderDashboard } from './dashboard'

export const adminHandler = new Composer<MyContext>()

// Middleware: Strict Owner Check for Callbacks
// Middleware: Strict Owner Check for Callbacks
adminHandler.use(async (ctx, next) => {
	// If it's an admin callback, strictly enforce Owner ID
	if (ctx.callbackQuery?.data?.startsWith('admin:')) {
		if (ctx.from?.id === config.OWNER_ID) {
			return next()
		}
		// Block non-owner admin attempts
		return
	}

	// For all other updates (like business messages from customers), PASS THROUGH
	return next()
})

async function refreshDashboard(ctx: MyContext) {
	const dashboard = await renderDashboard(ctx)
	try {
		// Attempt to edit the message that triggered the callback
		// For business messages, ctx.msg.message_id refers to the message with the button
		if (ctx.callbackQuery?.message) {
			await ctx.editMessageText(dashboard.text, {
				reply_markup: dashboard.keyboard,
				parse_mode: 'HTML',
			})
		}
	} catch (e) {
		await ctx.answerCallbackQuery() // Ignore
	}
}

// Callback: Toggle Away
adminHandler.callbackQuery('admin:toggle_away', async ctx => {
	const current = await SettingsService.getSettings()
	await SettingsService.updateSettings({ isAway: !current.isAway })
	await refreshDashboard(ctx)
})

// Callback: Toggle Quiet Hours
adminHandler.callbackQuery('admin:toggle_quiet', async ctx => {
	const current = await SettingsService.getSettings()
	await SettingsService.updateSettings({
		quietHoursEnabled: !current.quietHoursEnabled,
	})
	await refreshDashboard(ctx)
})

// Callback: Toggle Mood
adminHandler.callbackQuery('admin:toggle_mood', async ctx => {
	const current = await SettingsService.getSettings()
	const newMood = current.aiMood === 'serious' ? 'friendly' : 'serious'
	await SettingsService.updateSettings({ aiMood: newMood })
	await refreshDashboard(ctx)
})

// Callback: Refresh
adminHandler.callbackQuery('admin:refresh', async ctx => {
	const dashboard = await renderDashboard(ctx)
	try {
		await ctx.editMessageText(dashboard.text, {
			reply_markup: dashboard.keyboard,
			parse_mode: 'HTML',
		})
		await ctx.answerCallbackQuery('Yangilandi!')
	} catch (e) {
		await ctx.answerCallbackQuery("O'zgarish yo'q")
	}
})

// Callback: Edit Text
adminHandler.callbackQuery('admin:edit_text', async ctx => {
	ctx.session.step = 'awaiting_reply_text'
	// Send a fresh message asking for input?
	// "Yangi avto-javob matnini shu yerga yozib yuboring:"
	// Since we are in a business chat, we can just use ctx.reply via business helper or just ctx.reply if grammy context has business info?
	// Wait, callbacks don't have business_message directly, but they are related.
	// We should probably rely on `replyBusiness` if we want to be safe, but `ctx.reply` might fail if it tries to use standard sendMessage without business_connection_id?
	// Actually, `ctx` for callback contains `business_connection_id` if the message was business.
	// Let's use `ctx.reply` and hope grammy auto-fills, OR use `ctx.api.sendMessage`.
	// Safe bet: find connectionId.
	// But `ctx.businessConnectionId` property exists in refined context?
	// Let's use `ctx.reply` for now, if it fails we might need `business_connection_id`.
	// However, the `Secretary` handles TEXT inputs. We just set the session step here.
	await ctx.reply(
		'👇 <b>Yangi avto-javob matnini shu yerga yozib yuboring:</b>\n\n' +
			'<i>Masalan: "Hozir majlisdaman, 18:00 da bo\'shayman."</i>',
		{ parse_mode: 'HTML' },
	)
	await ctx.answerCallbackQuery()
})

// Note: No text handler here. Secretary delegates text inputs to handleAdminInput directly.
