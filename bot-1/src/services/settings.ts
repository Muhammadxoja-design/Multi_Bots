import { db } from '@/db'
import { settings } from '@/db/schema'
import { eq } from 'drizzle-orm'

export type BotSettings = typeof settings.$inferSelect

export const SettingsService = {
	async getSettings(): Promise<BotSettings> {
		const result = await db.select().from(settings).limit(1)

		if (result.length === 0) {
			// Initialize default settings
			const [newSettings] = await db
				.insert(settings)
				.values({
					// defaults are handled by schema
				})
				.returning()
			return newSettings
		}

		return result[0]
	},

	async updateSettings(
		partialSettings: Partial<Omit<BotSettings, 'id' | 'ownerId'>>,
	) {
		const current = await this.getSettings()
		const [updated] = await db
			.update(settings)
			.set(partialSettings)
			.where(eq(settings.id, current.id))
			.returning()
		return updated
	},

	async isAway(): Promise<boolean> {
		const s = await this.getSettings()
		return s.isAway || false
	},

	async getAutoReplyText(): Promise<string> {
		const s = await this.getSettings()
		return s.autoReplyText
	},
}
