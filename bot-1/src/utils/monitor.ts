import { config } from '@/config/env'
import { MyContext } from '@/core/context'
import { logger } from '@/utils/logger'
import { Bot } from 'grammy'

/**
 * Checks if the Groq API key is nearing its 90-day expiration.
 * Warns the owner if <= 7 days left.
 * Alerts if expired.
 */
export async function checkApiKeyStatus(bot: Bot<MyContext>) {
	try {
		if (!config.GROQ_KEY_START_DATE) {
			logger.warn(
				'Groq API Key Status: GROQ_KEY_START_DATE is not set. Skipping expiry check.',
			)
			return
		}

		const startDate = new Date(config.GROQ_KEY_START_DATE)
		if (Number.isNaN(startDate.getTime())) {
			logger.warn(
				`Groq API Key Status: invalid GROQ_KEY_START_DATE (${config.GROQ_KEY_START_DATE}). Expected YYYY-MM-DD.`,
			)
			return
		}
		const today = new Date()

		// Calculate difference in milliseconds
		const diffTime = Math.abs(today.getTime() - startDate.getTime())
		// Convert to days
		const daysUsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
		const daysLeft = 90 - daysUsed

		logger.info(
			`Groq API Key Status: ${daysUsed} days used, ${daysLeft} days remaining.`,
		)

		const ownerId = config.OWNER_ID

		if (daysLeft <= 0) {
			const msg = `🚨 *API Key EXPIRED!* \n\nYour Groq API key is older than 90 days. Bot AI features may stop working or have stopped. \n\nPlease generate a new key and update \`GROQ_API_KEY\` and \`GROQ_KEY_START_DATE\`.`
			await bot.api.sendMessage(ownerId, msg, { parse_mode: 'Markdown' })
			logger.warn('Groq API Key EXPIRED notification sent to owner.')
		} else if (daysLeft <= 7) {
			const msg = `⚠️ *Groq API Key Expiration Warning* \n\nYour API key expires in *${daysLeft} days*. \n\nPlease generate a new key soon to avoid service interruption.`
			await bot.api.sendMessage(ownerId, msg, { parse_mode: 'Markdown' })
			logger.warn('Groq API Key expiration warning sent to owner.')
		}
	} catch (error) {
		logger.error(`Failed to check API key status: ${error}`)
	}
}
