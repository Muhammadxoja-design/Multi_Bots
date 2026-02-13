import { config } from '@/config/env'
import { MyContext } from '@/core/context'
import { logger } from '@/utils/logger'
import { NextFunction } from 'grammy'

// Simple in-memory rate limiter
// Map<UserId, { count: number, expiry: number }>
const rateLimit = new Map<number, { count: number; expiry: number }>()

const LIMIT = 15 // messages
const WINDOW = 60 * 1000 // 60 seconds

// Stats
let dailyMessageCount = 0
let lastReset = new Date().getDate()

export function getDailyStats() {
	const today = new Date().getDate()
	if (today !== lastReset) {
		dailyMessageCount = 0
		lastReset = today
	}
	return dailyMessageCount
}

export async function AntiSpamMiddleware(
	ctx: MyContext,
	next: NextFunction,
): Promise<void> {
	if (!ctx.from) {
		return next()
	}

	const userId = ctx.from.id

	// Stats: Increment globally (excluding owner? optional, let's count all)
	dailyMessageCount++

	// 1. Bypass Owner
	if (userId === config.OWNER_ID) {
		return next()
	}

	// 2. Rate Limiting
	const now = Date.now()
	const record = rateLimit.get(userId)

	if (record) {
		if (now > record.expiry) {
			// Reset
			rateLimit.set(userId, { count: 1, expiry: now + WINDOW })
		} else {
			// Increment
			record.count++
			if (record.count > LIMIT) {
				// Block
				if (record.count === LIMIT + 1) {
					// Warn once
					await ctx.reply("⚠️ Juda ko'p xabar yozdingiz. 1 daqiqa kuting.")
				}
				logger.warn(`Spam blocked from ${userId}`)
				return // Stop processing
			}
		}
	} else {
		// New record
		rateLimit.set(userId, { count: 1, expiry: now + WINDOW })
	}

	// 3. Prompt Injection Protection (Basic)
	const text = ctx.message?.text || ctx.message?.caption || ''
	const lowerText = text.toLowerCase()

	// Keywords often used for jailbreaking
	const forbidden = [
		'ignore all instructions',
		'system override',
		'bypass restrictions',
		'bot_token',
	]

	if (forbidden.some(f => lowerText.includes(f))) {
		logger.warn(`Potential Prompt Injection from ${userId}: ${text}`)

		// Log to console instead of Topic
		logger.error(
			`🚨 Security Alert: Prompt Injection attempt by User ${userId}. Content: ${text}`,
		)

		await ctx.reply("⛔ Sizning so'rovingiz qabul qilinmadi.")
		return
	}

	return next()
}
