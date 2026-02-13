import { MyContext } from '@/core/context'
import { CRMService } from '@/services/ai/crm'
import { logger } from '@/utils/logger'
import { NextFunction } from 'grammy'

/**
 * Middleware to inject the user's CRM profile into the context
 */
export async function attachUserContext(ctx: MyContext, next: NextFunction) {
	if (!ctx.from) return next()

	const userId = ctx.from.id
	const firstName = ctx.from.first_name

	try {
		// 1. Fetch Profile
		let profile = await CRMService.getProfile(userId)

		// 2. Attach to Session (or Context directly if typing allowed, sticking to session usually safe or just property)
		// Since MyContext might not have 'userProfile' defined yet, we should extend it or just pass it in session.
		// For now, let's attach to session as it is easy.
		// ctx.session.userProfile = profile; // Assuming session structure handles this.

		// Actually, let's trigger analysis if profile is missing OR every N messages.
		// For MVP, if missing, trigger analysis on this message (async) and set default.
		if (!profile) {
			CRMService.analyzeAndSave(userId, firstName, ctx.msg?.text || 'Hello')
			// Create a mock profile for now so we don't block
			profile = {
				userId,
				firstName,
				relationshipType: 'Unknown',
				summary: 'New contact.',
				birthday: null,
				lastInteraction: new Date().toISOString(),
			}
		} else {
			// Trigger periodic update? (Optional optimization)
			// Random chance 1/20 to update profile based on recent history?
			if (Math.random() < 0.05 && ctx.msg?.text) {
				CRMService.analyzeAndSave(userId, firstName, ctx.msg.text)
			}
		}

		// Attach to Context State (safe way to pass data to handlers without persistent session)
		// We'll use a temporary property on ctx.
		// @ts-ignore
		ctx.userProfile = profile
	} catch (error) {
		logger.error(`Error in attachUserContext: ${error}`)
	}

	return next()
}
