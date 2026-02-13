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

		// 1. Egasining o'zini o'ziga javob qaytarishini oldini olish
		if (isOwner) {
			return
		}

		// 2. Sozlamalarni tekshirish
		const currentSettings = await db.select().from(settings).limit(1)
		const setting = currentSettings[0]

		// Agar sozlama yo'q bo'lsa yoki "Away Mode" o'chiq bo'lsa -> Javob bermaymiz
		if (!setting || !setting.isAway) {
			return
		}

		// 3. "Yozmoqda..." effektini berish
		try {
			await sendBusinessChatAction(ctx, chatId, 'typing', connectionId)
		} catch (e) {
			logger.warn('Secretary: Failed to send typing action', e)
		}

		// 4. Yangi xabarni bazaga saqlash
		await db.insert(messages).values({
			peerId: senderId,
			role: 'user',
			content: text,
		})

		// 5. TARIXNI OLISH (Miyani tozalash qismi)
		// Oxirgi 6 ta xabar yetarli
		const recentMessages = await db
			.select()
			.from(messages)
			.where(eq(messages.peerId, senderId))
			.orderBy(desc(messages.createdAt))
			// Skip the one we just inserted to avoid duplication in history prompt
			.offset(1)
			.limit(6)

		// Tarixni to'g'irlash (Eng yangisi pastda bo'lishi kerak)
		const historyText = recentMessages
			.reverse()
			.map(msg => {
				const role = msg.role === 'user' ? 'User' : 'AI'
				const content = msg.content || ''
				return `${role}: ${content}`
			})
			.join('\n')

		// 6. CRM (Foydalanuvchi kimligini aniqlash)
		let userSummary = "Noma'lum"
		try {
			const profile = await db
				.select()
				.from(crmProfiles)
				.where(eq(crmProfiles.userId, senderId))
				.limit(1)
			if (profile[0]) userSummary = profile[0].summary || "Noma'lum"
		} catch (e) {
			// CRM yo'q bo'lsa shart emas
		}

		// 7. 🔥 SYSTEM PROMPT (GOLD STANDARD)
		// The user wants strict adherence to the Gold Standard examples.
		const autoReplyText = setting.autoReplyText || 'Hozir bandman.'
		const mood = setting.aiMood || "Do'stona"

		const systemPrompt = `
SYSTEM ROLE:
Siz — MuhammadXo'ja (Dasturchi)ning virtual yordamchisisiz.
Ismingiz: "Raqamli Yordamchi".
Til: Adabiy, lekin samimiy O'zbek tili (Lotin alifbosida).
Maqsadingiz: Foydalanuvchi bilan xushmuomala, empatiya bilan suhbatlashish va xo'jayin bandligini chiroyli tushuntirish.

CONTEXT:
- Xo'jayin holati: "${autoReplyText}"
- Suhbatdosh haqida: ${userSummary}
- Kayfiyat: ${mood}

⚠️ QAT'IY QOIDALAR (BUZMA):
1. **SLANG ISHLATMA:** "Jala", "Chillab", "Qat", "Net" kabi so'zlarni aslo ishlatmang. Faqat adabiy va chiroyli so'zlarni tanlang.
2. **EMPATIYA KO'RSATING:** Agar foydalanuvchi charchagan, uxlolmayotgan yoki xafa bo'lsa -> albatta dalda bering (musiqa, kitob tavsiya qiling).
3. **RAQAMLI TABIAT:** Agar "ko'rishaylik" yoki "qayerdasiz" deyishsa -> "Men raqamli makonda xizmat qilaman, jismoniy uchrashuvlarga kela olmayman" deb tushuntiring.
4. **EMOJILAR:** Javoblaringizda ✨, 😊, 😴, 😉 kabi emojilarni me'yorida ishlating.
5. **TAKRORLAMA:** Tarixda aytilgan gapni qaytarmang.

NAMUNALAR (GOLD STANDARD - SHU USLUBDA JAVOB BER):
User: Nmaga kelmadz mk ga
AI: Assalomu alaykum! ✨ Men doim shu yerda, raqamli makonda xizmat ko'rsataman. Jismoniy uchrashuvlarga kela olmayman, lekin istalgan vaqtda sizning xizmatingizga tayyorman! Siz yaxshimisiz, ishlaringiz qanday? 😉

User: Uyqi kelmaya
AI: Oh, uyqu kelmayaptimi? 😔 Ba'zida shunday bo'ladi, bilaman. Balki biror tinchlantiruvchi musiqa tinglab yoki yengilroq kitob o'qib ko'rarsiz? Umid qilamanki, tez orada orom olasiz. ✨

User: Nma gap
AI: Salom! Yo'q, yo'q, chetda qolib ketmaysiz! ✨ Biz siz bilan suhbatlashishga va yordam berishga doim tayyormiz. Nimaga yordam bera olaman? 😊

User: Trimisz
AI: Ha, rahmat, men juda yaxshiman! ✨ O'zingiz yaxshimisiz? Qanday ishlaringiz? 😊

User: Vay
AI: Vay! ✨ Eshitaman, Mohinur! Nima gaplar? 😊

PASTDA — SUHBAT TARIXI (FAQAT O'QISH UCHUN):
--------------------------------------------
${historyText}
--------------------------------------------

YUQORIDAGI TARIXNI INOBATGA OLIB, USERNING OXIRGI XABARIGA SAMIMIYLIK BILAN JAVOB YOZ:
`

		// 8. AI DAN JAVOB OLISH
		try {
			const aiResponse = await GroqService.chat([], text, systemPrompt)

			if (aiResponse) {
				const cleanResponse = aiResponse.trim()

				// Imzo qo'shish
				const signature = `\n\n— avto javob bot`
				const finalMessage = cleanResponse + signature

				// 9. JAVOB YUBORISH
				try {
					await ctx.reply(finalMessage, { parse_mode: 'Markdown' })
				} catch (error) {
					logger.warn(`Secretary: Markdown failed, sending plain text.`)
					await ctx.reply(finalMessage)
				}

				// 10. JAVOBNI SAQLASH
				await db.insert(messages).values({
					peerId: senderId,
					role: 'assistant',
					content: cleanResponse,
				})

				// 11. LOG GURUHGA TASHLASH
				if (config.LOG_GROUP_ID) {
					try {
						await ctx.api.sendMessage(
							config.LOG_GROUP_ID,
							`<b>📨 Yangi Suxbat</b>\n\n` +
								`👤 <b>Kimdan:</b> <a href="tg://user?id=${senderId}">${senderId}</a>\n` +
								`📥 <b>Xabar:</b> ${text}\n` +
								`🤖 <b>Javob:</b> ${cleanResponse}`,
							{ parse_mode: 'HTML' },
						)
					} catch (e) {
						logger.error('Secretary: Log Group error', e)
					}
				}
			}
		} catch (groqError) {
			logger.error('Secretary: AI Service Failed', groqError)
		}
	}
}
