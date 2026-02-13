import { db } from '@/db'
import { crmProfiles } from '@/db/schema'
import { CRM_PROMPT_UZBEK } from '@/services/ai/prompts'
import { GroqService } from '@/services/groq'
import { logger } from '@/utils/logger'
import { eq } from 'drizzle-orm'

export class CRMService {
	/**
	 * Analyzes chat history and updates the user's CRM profile
	 * @param userId Telegram User ID
	 * @param history Recent chat history as text
	 * @param currentProfile Current profile (optional)
	 */
	static async analyzeAndSave(
		userId: number,
		firstName: string,
		history: string,
	) {
		// Run in background (no await here if called without await, but let's make it async and caller decides)
		// We use a try-catch to ensure it doesn't crash the bot
		try {
			logger.info(`Starting CRM analysis for user ${userId}...`)

			// ...

			const prompt = `
            ${CRM_PROMPT_UZBEK}
            
            HISTORY (User: ${firstName}, ID: ${userId}):
            ${history}
            `

			const messages: Array<{
				role: 'system' | 'user' | 'assistant'
				content: string
			}> = [
				{
					role: 'system',
					content:
						'You are a CRM Intelligence Agent. Output strictly JSON. No markdown.',
				},
				{
					role: 'user',
					content: prompt,
				},
			]

			const analysis = await GroqService.completeJSON(messages)

			if (!analysis) {
				logger.warn(`CRM Analysis failed for user ${userId}`)
				return
			}

			logger.info(
				`CRM Analysis Result for ${userId}: ${JSON.stringify(analysis)}`,
			)

			// Update DB
			await db
				.insert(crmProfiles)
				.values({
					userId,
					firstName,
					relationshipType: analysis.relationship_type || 'Unknown',
					summary: analysis.summary || '',
					birthday: analysis.birthday || null,
					lastInteraction: new Date().toISOString(),
				})
				.onConflictDoUpdate({
					target: crmProfiles.userId,
					set: {
						firstName, // Update name if changed
						relationshipType: analysis.relationship_type || 'Unknown',
						summary: analysis.summary || '',
						birthday: analysis.birthday || undefined, // Only update if found
						lastInteraction: new Date().toISOString(),
					},
				})

			// Log to Console instead of Topic
			logger.info(
				`CRM Report for ${userId}:\nRelationship: ${analysis.relationship_type}\nSummary: ${analysis.summary}`,
			)
		} catch (error) {
			logger.error(`Error in CRMService.analyzeAndSave: ${error}`)
		}
	}

	/**
	 * Retrieves the user profile from the database
	 * @param userId Telegram User ID
	 */
	static async getProfile(userId: number) {
		try {
			// DEBUG: Check if schema is loaded
			if (!crmProfiles) {
				logger.error(
					'CRITICAL: crmProfiles schema is UNDEFINED. Check src/db/schema.ts circular dependencies.',
				)
				return null
			}

			const profiles = await db
				.select()
				.from(crmProfiles)
				.where(eq(crmProfiles.userId, userId))
				.limit(1)

			return profiles[0] || null
		} catch (error) {
			logger.error(`Error fetching profile for ${userId}:`, error)
			return null
		}
	}
}
