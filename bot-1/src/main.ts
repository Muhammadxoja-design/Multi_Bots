import { config } from '@/config/env'
import { bot } from '@/core/bot'
import { FileAdapter } from '@/core/storage'
import { renderDashboard } from '@/features/admin/dashboard' // Added
import { adminHandler } from '@/features/admin/handler'
import { Secretary } from '@/features/business/secretary'
import { AntiSpamMiddleware } from '@/features/security/antispam'
// import { tasksCallbacks } from '@/features/tasks/callbacks' // Removed
// import { unifiedRouter } from '@/features/router/handler' // Removed
import { SettingsService } from '@/services/settings' // Added
import { rememberBusinessConnection } from '@/utils/business'
import { logger } from '@/utils/logger'
import { checkApiKeyStatus } from '@/utils/monitor'
import { session } from 'grammy'

async function main() {
	// 1. Session Middleware
	bot.use(
		session({
			initial: () => ({
				topics: {},
				history: [],
				step: undefined, // For admin input
			}),
			storage: new FileAdapter('sessions.json'),
		}),
	)

	// 2. Security (Anti-Spam)
	bot.use(async (ctx, next) => {
		const updateType = Object.keys(ctx.update).filter(k => k !== 'update_id')[0]
		logger.info(`📨 UPDATE received: ${updateType} | From: ${ctx.from?.id}`)
		await next()
	})
	bot.use(AntiSpamMiddleware)

	// 3. Admin Callbacks (Owner Buttons)
	bot.use(adminHandler)

	// 4. Business Connection Logging
	bot.on('business_connection', ctx => {
		const conn = ctx.businessConnection
		rememberBusinessConnection(conn.id, conn.user_chat_id)
		logger.info(
			`🔌 Business Connection Update: ${conn.id} | User: ${conn.user.id} | UserChat: ${conn.user_chat_id} | Enabled: ${conn.is_enabled} | CanReply: ${!!conn.rights?.can_reply}`,
		)
		if (!conn.rights?.can_reply) {
			logger.warn(
				`⚠️ Business Connection ${conn.id} restriction: can_reply=false. Please enable text replies in Telegram Settings.`,
			)
		}
	})

	// 5. Owner Admin Panel via DM (Standard Message)
	bot.on('message', async (ctx, next) => {
		// Only allow Owner
		if (ctx.from.id !== config.OWNER_ID) return

		// Show Dashboard
		const dashboard = await renderDashboard(ctx)
		try {
			const msg = await ctx.reply(dashboard.text, {
				parse_mode: 'HTML',
				reply_markup: dashboard.keyboard,
			})

			// Save dashboard info
			await SettingsService.updateSettings({
				dashboardChatId: ctx.chat.id,
				dashboardMessageId: msg.message_id,
			})
		} catch (e) {
			logger.error('Failed to send dashboard via DM:', e)
		}
	})

	// 6. Main Business Logic (Secretary)
	// Handle strict business messages and edits (if needed)
	bot.on(['business_message', 'edited_business_message'], Secretary.handle)

	// 7. Global Error Handling
	bot.catch(err => {
		logger.error(`Global error in bot: ${err.message}`, err)
	})

	// 8. Graceful Shutdown
	const stop = () => bot.stop()
	process.once('SIGINT', stop)
	process.once('SIGTERM', stop)

	// 9. Start Bot
	logger.info(`Starting Business Bot in ${config.NODE_ENV} mode...`)
	logger.info('Mode: Business + Owner DM')

	await checkApiKeyStatus(bot)

	await bot.start({
		onStart: botInfo => {
			logger.info(`Bot @${botInfo.username} started!`)
			logger.info(`Owner ID: ${config.OWNER_ID}`)
		},
		allowed_updates: [
			'message', // Allow standard messages for Owner DM
			'callback_query',
			'business_connection',
			'business_message',
			'edited_business_message',
			'deleted_business_messages',
		],
	})
}

main().catch(err => {
	logger.error('Fatal error in main:', err)
	process.exit(1)
})
