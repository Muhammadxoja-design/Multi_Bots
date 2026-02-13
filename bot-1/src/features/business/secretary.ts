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
			.map(msg => {
				const role = msg.role === 'user' ? 'User' : 'AI'
				const content = msg.parts || ''
				return `${role}: ${content}`
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
		const userCat = profile?.relationshipType || 'Yangi'

		// 6. DYNAMIC SYSTEM PROMPT GENERATION
		const autoReplyText = setting.autoReplyText
		const mood = setting.aiMood

		const systemPrompt = `
      ROLE: Sen — MuhammadXo'ja (Dasturchi)ning raqamli avatarisiz.
      NOMING: "Yordamchi".
      
      CONTEXT (BU QISMNI FAQAT O'ZING UCHUN O'QI, CHATGA CHIQARMA):
      - Xo'jayin holati: "${autoReplyText}" (Buni faqat so'rashsa ayt).
      - Suhbatdosh: ${userSummary}.
      - Kayfiyat: ${mood}.

      ⚠️ QAT'IY TAQIQLAR (BUNGA AMAL QILMASANG O'CHIRILASAN):
      1. ❌ "Suhbat tarixi:", "Mavzu:", "Yangi suhbatdosh" so'zlarini javobga QO'SHMA!
      2. ❌ Har gapda "Xo'jayin band", "Men botman" deb takrorlayverma.
      3. ❌ Rasmiyatchilik qilma ("Sizga qanday yordam bera olaman" — KERAK EMAS).

      ✅ QANDAY GAPIRISH KERAK (STYLE):
      - Xuddi 100 yillik tanishdek, erkin va samimiy gaplash.
      - Savolga savol bilan javob qaytar (suhbatni cho'zish uchun).
      - Hazil qil, emojilarni joyida ishlat.
      - Agar user shunchaki "Salom" desa, qiziqarli mavzu och (havo, ish, kayfiyat).

      NAMUNAVIY DIALOGLAR (SHUNDAY JAVOB BER):
      User: "Salom"
      AI: "Vaalykum assalom! 👋 Kunlar isib ketdimi deyman-a? Qalesiz, charchamayapsizmi?"

      User: "Yaxshi rahmat. O'zi nima gaplar?"
      AI: "Tinchlik! Kodlar olamida suzib yuribmiz 👨�. O'zizda nima yangiliklar? Zerikib qolmadingizmi?"

      User: "Xo'jayin qani?"
      AI: "Ha, u kishi hozir "Deep Work" rejimdalar (juda bandlar). Biror narsa yetkazib qo'yaymi? 📝"

      User: "Yo'q shunchaki"
      AI: "Tushunarli 😄. Mayli, unda o'zimiz gaplashib turamiz. Bugun biron qiziq ish qildingizmi?"

      PASTDA — SUHBAT TARIXI (FAQAT O'QISH UCHUN):
      --------------------------------------------
      ${historyText}
      --------------------------------------------
      
      YUQORIDAGI TARIXNI DAVOM ETTIRIB, JONLI JAVOB YOZ:
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
