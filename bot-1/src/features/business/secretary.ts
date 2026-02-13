import { config } from '@/config/env'
import { MyContext } from '@/core/context'
import { db } from '@/db'
import { crmProfiles, messages, settings } from '@/db/schema'
import { GroqService } from '@/services/groq'
import { extractBusinessInfo, sendBusinessChatAction } from '@/utils/business'
import { logger } from '@/utils/logger'
import { desc, eq } from 'drizzle-orm'

export class Secretary {
	static async handle(ctx: MyContext) {
		const info = extractBusinessInfo(ctx)
		if (!info) return

		const { senderId, chatId, connectionId, text, isOwner } = info

		// 1. Validation & Loop Prevention
		if (isOwner) {
			logger.warn(`Secretary: Skipping owner message to prevent loops.`)
			return
		}

		// 2. Check "is_away" status from DB
		const currentSettings = await db.select().from(settings).limit(1)
		const setting = currentSettings[0]

		if (!setting || !setting.isAway) {
			logger.info(`Secretary: Auto-reply is OFF. Skipping.`)
			return
		}

		// 3. Send "typing..." action
		await sendBusinessChatAction(ctx, chatId, 'typing', connectionId)

		// 4. MEMORY FETCHING STRATEGY
		// Fetch last 15 messages for this user
		const recentMessages = await db
			.select()
			.from(messages)
			.where(eq(messages.peerId, senderId))
			.orderBy(desc(messages.createdAt))
			.limit(15)

		// Reverse to correct chronological order
		const history = recentMessages.reverse().map(msg => ({
			role: msg.role as 'user' | 'assistant' | 'system',
			parts: msg.content,
		}))

		const historyText = history
			.map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.parts}`)
			.join('\n')

		// 5. Save incoming user message to DB
		await db.insert(messages).values({
			peerId: senderId,
			role: 'user',
			content: text,
		})

		// Fetch User Profile
		const profiles = await db
			.select()
			.from(crmProfiles)
			.where(eq(crmProfiles.userId, senderId))
			.limit(1)
		const profile = profiles[0]
		const userSummary = profile?.summary || 'Nomaʼlum suhbatdosh'
		const userCat = profile?.relationshipType || 'Yangi'

		// 6. DYNAMIC SYSTEM PROMPT GENERATION
		const autoReplyText = setting.autoReplyText
		const mood = setting.aiMood

		const systemPrompt = `
      ROLE: Sen — MuhammadXo'ja (Dasturchi)ning virtual yordamchisisiz.
      ISMING: "Yordamchi Bot".
      
      CONTEXT:
      - Xo'jayin (MuhammadXo'ja) hozir band. Status: "${autoReplyText}".
      - Suhbatdosh: ${userSummary} (Kategoriya: ${userCat}).
      - Kayfiyat: ${mood}.

      QAT'IY QOIDALAR (BUZMA):
      1. ❌ "Siz kimdan bo'lsiz?", "Xush kelibsiz", "Qo'llab-quvvatlayman" degan g'alati gaplarni ISHLATMA!
      2. ✅ Odamga o'xshab gapir (Toshkent shevasi aralash adabiy). "Assalomu alaykum", "Qalesiz", "Tinchmisiz" so'zlarini ishlat.
      3. ✅ Agar suhbatdosh "Men Muhammadxo'jaman" desa, va u haqiqiy xo'jayin bo'lmasa: "Hazillashyapsizmi? Xo'jayin bitta, u ham bo'lsa kod yozib o'tiribdi 😁" deb hazil qil.
      4. ✅ Agar oddiy gap ("Salom", "Qalesan") yozsa, hol-ahvol so'ra, mavzuni burib yubor (masalan, havo haqida, ish haqida).
      5. ✅ Suhbat tarixini albatta o'qi va davom ettir.
      
      NAMUNAVIY DIALOGLAR (SHUNDAY JAVOB QAYTAR):
{{ ... }}
      ${historyText}

      JAVOB YOZISH (Faqat javob matnini yoz, ortiqcha izohsiz):
    `

		// 7. CALL GROQ
		// We pass empty history array to chat because we already injected history into prompt manually
		// to have full control over formatting.
		const aiResponse = await GroqService.chat([], text, systemPrompt)

		if (aiResponse) {
			const signature = `\n\n— 🤖 avto-javob`
			const finalMessage = aiResponse + signature

			// 8. SEND REPLY
			try {
				// Use ctx.reply for automatic business handling
				await ctx.reply(finalMessage, { parse_mode: 'Markdown' })
			} catch (error) {
				logger.error(`Secretary: Failed to reply to ${senderId}`, error)
				// Fallback to HTML if Markdown fails (safer)
				try {
					await ctx.reply(finalMessage, { parse_mode: 'HTML' })
				} catch (e) {
					logger.error('Secretary: Retry failed', e)
				}
			}

			// 9. LOGGING & SAVING
			// Save clean AI reply to DB
			await db.insert(messages).values({
				peerId: senderId,
				role: 'assistant',
				content: aiResponse, // Store without signature
			})

			// Forward to Log Group
			if (config.LOG_GROUP_ID) {
				try {
					await ctx.api.sendMessage(
						config.LOG_GROUP_ID,
						`<b>📨 Yangi Suxbat</b>\n\n` +
							`👤 <b>Kimdan:</b> <a href="tg://user?id=${senderId}">${senderId}</a>\n` +
							`📥 <b>Xabar:</b> ${text}\n` +
							`🤖 <b>Javob:</b> ${aiResponse}`, // Log clean response
						{ parse_mode: 'HTML' },
					)
				} catch (logError) {
					logger.error('Secretary: Failed to log to group', logError)
				}
			}
		}
	}
}
