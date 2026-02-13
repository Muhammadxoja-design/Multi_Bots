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

		// TARIXNI SAMARALI FORMATLASH
		// history is already reversed (chronological) from lines 45-48
		const historyText = history
			.map(m => {
				const role = m.role === 'user' ? 'User' : 'AI'
				return `${role}: ${m.parts || ''}`
			})
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

		// 6. DYNAMIC SYSTEM PROMPT GENERATION
		const autoReplyText = setting.autoReplyText
		const mood = setting.aiMood

		const systemPrompt = `
      ROLE: Sen — MuhammadXo'ja (Dasturchi)ning o'ta aqlli yordamchisisiz.
      NOMING: "Yordamchi".
      
      CONTEXT (BU QISMNI FAQAT O'QI):
      - Xo'jayin holati: "${autoReplyText}".
      - Suhbatdosh: ${userSummary}.
      - Kayfiyat: ${mood}.

      ⚠️ QAT'IY TAQIQLAR (BUZMA):
      1. ❌ O'z javobingni izohlama! "(Bunday gapda...)" degan narsalarni YOZMA.
      2. ❌ Agar tarixda "Salom" bo'lsa, yana "Salom" deb takrorlama.
      3. ❌ <tg-emoji> taglarini ishlatma! Oddiy emojilar (😄, 👍, 👋) ishlat.
      4. ❌ "Suhbat tarixi" degan so'zni chatga chiqarish TAQIQLANADI.

      ✅ QANDAY GAPIRISH KERAK (STYLE):
      - Qisqa va lo'nda. Uzun doston yozma.
      - Jonli O'zbek tili (Toshkent shevasi aralash).
      - Agar user "Yo'q" yoki "Rahmat" desa, majburlama. "Mayli", "O'zingiz bilasiz" deb qisqa javob qil.

      MANTIQIY NAMUNALAR:
      
      (Holat: User rad etdi)
      User: "Yo'q rahmat"
      AI: "Tushunarli. Agar biror narsa kerak bo'lsa yozarsiz. Tinch bo'ling! 👋"

      (Holat: User hol-ahvol so'radi)
      User: "Qalesan"
      AI: "Yaxshi rahmat, o'zizchi? Charchamayapsizmi?"

      (Holat: User salom berdi)
      User: "Assalomu alaykum"
      AI: "Vaalykum assalom! Xush ko'rdik. Xizmat?"

      PASTDA — SUHBAT TARIXI (FAQAT O'QISH UCHUN):
      --------------------------------------------
      ${historyText}
      --------------------------------------------
      
      YUQORIDAGI TARIXNI DAVOM ETTIRIB, FAQAT JAVOB MATNINI YOZ (IZOHSIZ):
    `

		// 7. CALL GROQ
		const aiResponse = await GroqService.chat(
			[{ role: 'user', parts: text }],
			systemPrompt,
		)

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
