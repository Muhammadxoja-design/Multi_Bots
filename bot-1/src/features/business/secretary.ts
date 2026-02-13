import { config } from '@/config/env'
import { MyContext } from '@/core/context' // Yoki sizdagi context path
import { db } from '@/db'
import { crm_profiles, messages, settings } from '@/db/schema' // crm_profiles qo'shildi
import { GroqService } from '@/services/groq'
import { extractBusinessInfo, sendBusinessChatAction } from '@/utils/business' // Yoki utils path
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
		// Xatolik bo'lsa ham kod to'xtamasligi uchun try/catch
		try {
			await sendBusinessChatAction(ctx, chatId, 'typing', connectionId)
		} catch (e) {
			logger.warn('Secretary: Failed to send typing action', e)
		}

		// 4. Yangi xabarni bazaga saqlash
		await db.insert(messages).values({
			peerId: senderId, // Yoki user_id (sizning schema'ga qarab)
			role: 'user',
			content: text,
			createdAt: new Date(), // Agar default bo'lmasa
		})

		// 5. TARIXNI OLISH (Miyani tozalash qismi)
		// Oxirgi 6 ta xabar yetarli, ko'pi AIni chalg'itadi
		const recentMessages = await db
			.select()
			.from(messages)
			.where(eq(messages.peerId, senderId))
			.orderBy(desc(messages.createdAt))
			.limit(6)

		// Tarixni to'g'irlash (Eng yangisi pastda bo'lishi kerak)
		// Va eng muhimi: Hozirgi yozgan xabarimizni tarix ichidan olib tashlaymiz,
		// chunki uni alohida 'text' sifatida beramiz.
		const historyText = recentMessages
			.reverse()
			.filter(msg => msg.content !== text) // Hozirgi xabarni takrorlamaslik uchun
			.map(msg => {
				const role = msg.role === 'user' ? 'User' : 'Assistant'
				const content = msg.content || ''
				return `${role}: ${content}`
			})
			.join('\n')

		// 6. CRM (Foydalanuvchi kimligini aniqlash)
		// Agar crm_profiles jadvali bo'lsa, undan ma'lumot olamiz
		let userSummary = "Noma'lum"
		try {
			const profile = await db
				.select()
				.from(crm_profiles)
				.where(eq(crm_profiles.peerId, senderId))
				.limit(1)
			if (profile[0]) userSummary = profile[0].summary || "Noma'lum"
		} catch (e) {
			// CRM yo'q bo'lsa shart emas
		}

		// 7. 🔥 SYSTEM PROMPT (ENG MUHIM QISM)
		const autoReplyText = setting.autoReplyText || 'Hozir bandman.'
		const mood = setting.aiMood || "Do'stona"

		const systemPrompt = `
      ROLE: Sen — MuhammadXo'ja (Dasturchi)ning aqlli yordamchisisan.
      VAZIFA: Odamlar bilan xuddi tirik insondek, erkin suhbatlashish.
      
      CONTEXT:
      - Xo'jayin holati: "${autoReplyText}"
      - Suhbatdosh haqida: ${userSummary}
      - Kayfiyat: ${mood}

      ⚠️ QAT'IY TAQIQLAR (BUZMA):
      1. **ROBOT BO'LMA:** "Sizni ko'rdik", "Anig'ini bilasizmi", "Xizmat ko'rsatishga tayyorman" kabi g'alati gaplarni ISHLATMA.
      2. **TAKRORLAMA:** Agar tarixda (pastda) sen "Salom" degan bo'lsang, yana "Salom" dema. Boshqa gap top.
      3. **IZOHLAMA:** "(Bunday gapda...)" deb o'z javobingni tushuntirma. Faqat javobni yoz.
      4. **MAVZU:** Agar user savol bersa, javob ber. Agar shunchaki yozsa, hol-ahvol so'ra.
      5. **SADDA GAPIR:** Ko'cha tili va jonli O'zbek tilida gapir (Lotin alifbosida).

      NAMUNALAR (SHUNDAY JAVOB BER):
      User: Salom
      Assistant: Vaalaykum assalom! Xush kelibsiz. Xizmat?

      User: Yaxshimisiz
      Assistant: Rahmat, zo'r! O'ziz tinchmisiz? Xo'jayin kod yozish bilan band edilar.

      User: Nima gap
      Assistant: Tinchlik, sekin ishlab o'tiribmiz. O'zizda nima yangiliklar?

      PASTDA — SUHBAT TARIXI (FAQAT O'QISH UCHUN):
      --------------------------------------------
      ${historyText}
      --------------------------------------------
      
      Yuqoridagi tarixga qara. Userning oxirgi xabariga mantiqiy, qisqa va samimiy javob yoz:
    `

		// 8. AI DAN JAVOB OLISH
		// GroqService tarixni [] deb oladi, chunki tarixni biz systemPrompt ichiga tiqdik.
		// Bu AIni chalg'itmaslik uchun eng yaxshi usul.
		try {
			const aiResponse = await GroqService.chat([], text, systemPrompt)

			if (aiResponse) {
				const cleanResponse = aiResponse.trim() // Bo'shliqlarni olib tashlash

				// Imzo qo'shish
				const signature = `\n\n— 🤖 avto-javob`
				const finalMessage = cleanResponse + signature

				// 9. JAVOB YUBORISH (Xavfsiz)
				try {
					// Avval Markdown bilan urinib ko'ramiz
					await ctx.reply(finalMessage, { parse_mode: 'Markdown' })
				} catch (error) {
					// Agar Markdown xato bersa (masalan, _ yoki * belgilarida), oddiy matn yuboramiz
					logger.warn(`Secretary: Markdown failed, sending plain text.`)
					await ctx.reply(finalMessage)
				}

				// 10. JAVOBNI SAQLASH (Imzosiz versiyasini)
				await db.insert(messages).values({
					peerId: senderId,
					role: 'assistant',
					content: cleanResponse,
					createdAt: new Date(),
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
						// Logga yozolmasa bot to'xtab qolmasin
						logger.error('Secretary: Log Group error', e)
					}
				}
			}
		} catch (groqError) {
			logger.error('Secretary: AI Service Failed', groqError)
		}
	}
}
