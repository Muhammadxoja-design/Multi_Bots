import { config } from '@/config/env'
import { db } from '@/db'
import { crmProfiles } from '@/db/schema'
import { GroqService } from '@/services/groq'
import { logger } from '@/utils/logger'
import { eq } from 'drizzle-orm'
import { Api } from 'grammy'

export class BirthdayScheduler {
	private static api: Api
	private static intervalId: NodeJS.Timeout | null = null

	/**
	 * Starts the birthday scheduler
	 * @param api Telegram Bot API instance
	 */
	static start(api: Api) {
		this.api = api
		// Check every hour to see if it's 8 AM
		// For robustness, in production use node-cron or similar.
		// Here we allow a simple interval that checks current time.
		this.intervalId = setInterval(
			() => {
				const now = new Date()
				// Check if it's 08:00 AM (local time)
				if (now.getHours() === 8 && now.getMinutes() === 0) {
					this.checkBirthdays()
				}
			},
			60 * 1000, // Check every minute
		)

		logger.info('Birthday Scheduler started (checks daily at 08:00)')
	}

	static stop() {
		if (this.intervalId) clearInterval(this.intervalId)
	}

	private static async checkBirthdays() {
		logger.info('Checking for birthdays...')
		try {
			const today = new Date()
			const month = String(today.getMonth() + 1).padStart(2, '0')
			const day = String(today.getDate()).padStart(2, '0')
			const todayString = `${month}-${day}`

			const birthdays = await db
				.select()
				.from(crmProfiles)
				.where(eq(crmProfiles.birthday, todayString))

			for (const profile of birthdays) {
				await this.sendBirthdayWish(profile)
			}
		} catch (error) {
			logger.error('Error checking birthdays:', error)
		}
	}

	private static async sendBirthdayWish(
		profile: typeof crmProfiles.$inferSelect,
	) {
		try {
			// Generate wish
			const prompt = `
            Generate a birthday wish for ${profile.firstName}.
            Relationship: ${profile.relationshipType}.
            Context: ${profile.summary}.
            
            Tone:
            - Client: Professional, polite, appreciative.
            - Friend/Family: Warm, casual, maybe funny.
            
            Output ONLY the message text.
            `

			const messages: Array<{
				role: 'system' | 'user' | 'assistant'
				content: string
			}> = [
				{
					role: 'system',
					content: 'You are a helpful assistant writing birthday wishes.',
				},
				{
					role: 'user',
					content: prompt,
				},
			]

			const wish =
				(await GroqService.chat(
					[], // No history needed
					prompt,
				)) || `Happy Birthday, ${profile.firstName}! 🎂`

			// Send message
			await this.api.sendMessage(profile.userId, wish)
			logger.info(`Sent birthday wish to ${profile.userId}`)

			// Notify owner
			if (config.OWNER_ID) {
				await this.api.sendMessage(
					config.OWNER_ID,
					`ℹ️ <b>Birthday Wisher</b>\nSent wish to ${profile.firstName} (${profile.relationshipType}):\n"${wish}"`,
					{ parse_mode: 'HTML' },
				)
			}
		} catch (error) {
			logger.error(`Error sending birthday wish to ${profile.userId}:`, error)
		}
	}
}
