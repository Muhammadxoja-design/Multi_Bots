import { config } from '@/config/env'
import { MyContext } from '@/core/context'
import { db } from '@/db'
import { messages, settings } from '@/db/schema'
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

		// 4. Save incoming User message to DB
		await db.insert(messages).values({
			peerId: senderId,
			role: 'user',
			content: text,
		})

		// 5. FETCH & CLEAN HISTORY
		// Fetch last 10 messages for this user + offset 1 (skip the message we just saved)
		// This prevents duplication of the current message in 'historyText'.
		const recentMessages = await db
			.select()
			.from(messages)
			.where(eq(messages.peerId, senderId))
			.orderBy(desc(messages.createdAt))
			// Skip the latest message we just inserted (so it doesn't appear in historyText prematurely)
			// Actually, usually we WANT the latest message in history if we are building a prompt.
			// BUT the user prompt instruction said: "Fetch last 10 messages."
			// And usually we pass current message separately to LLM.
			// Let's stick to the plan: fetch history.
			// Logic check: if we just inserted 'text', then 'recentMessages' will include it as the first item.
			// If we want 'history' to be previous messages, we should skip 1.
			// If we want 'history' to include current message, we don't skip.
			// The prompt says: "PASTDA — SUHBAT TARIXI". Currently standard is history + new message.
			// However, in step 158 I used offset(1).
			// Let's stick to offset(1) to avoid duplicating the current message if we pass it as `text` to `GroqService.chat`.
			// Wait, `GroqService.chat` takes `history` (array) and `message` (string).
			// If I pass `[]` as history to `GroqService.chat` (as done in line 163 of previous code),
			// then `GroqService` will ONLY see `systemPrompt` and `message`.
			// So `historyText` in `systemPrompt` MUST contain the PAST history.
			// So `offset(1)` is CORRECT if `recentMessages` includes the just-inserted message.
			.offset(1)
			.limit(10)

		// Reverse to correct chronological order
		const historyText = recentMessages
			.reverse()
			.map(msg => {
				const role = msg.role === 'user' ? 'User' : 'AI'
				const content = msg.content || ''
				return `${role}: ${content}`
			})
			.join('\n')

		// 6. CONSTRUCT SYSTEM PROMPT
		const autoReplyText = setting.autoReplyText
		// const mood = setting.aiMood // User instructions omitted explicit mood here.

		const systemPrompt = `
SYSTEM ROLE:
Sen — MuhammadXo'ja (Dasturchi)ning virtual yordamchisisiz.
Isming: "Yordamchi Bot".
Til: Jonli, ko'cha tili (Toshkent shevasi elementlari bilan).

CONTEXT:
- Xo'jayin holati: "${autoReplyText}"
- Tarix (pastda): Suhbatning davomi.

QAT'IY QOIDALAR (BUZMA):
1. ❌ O'z javobingni izohlama! "(Bunday gapda...)" yoki shunga o'xshash ichki o'ylaringni YOZMA.
2. ❌ Agar tarixda oxirgi bo'lib "Salom" turgan bo'lsa, yana "Salom" deb takrorlama. Mavzuni o'zgartir yoki savol ber.
3. ❌ <tg-emoji> taglarini ishlatma! Oddiy emojilar (😄, 👍, 👋) ishlat.
4. ❌ "Suhbat tarixi" degan so'zni chatga chiqarish TAQIQLANADI.
5. ✅ Qisqa va lo'nda yoz.

NAMUNALAR (FEW-SHOT):
User: Nima gap?
AI: Tinchlik, o'zizda nima gaplar?

User: Xo'jayin qachon keladi?
AI: Anig'ini bilmadim-u, lekin hozir bandlar. Xabar qoldirasizmi?

User: Salom
AI: Vaaalaykum assalom! Keling, xizmat?

PASTDA — SUHBAT TARIXI (FAQAT O'QISH UCHUN):
--------------------------------------------
${historyText}
--------------------------------------------

YUQORIDAGI TARIXNI INOBATGA OLIB, OXIRGI XABARGA JAVOB YOZ:
`

		// 7. CALL GROQ API
		// We pass [] as history because we manually injected history into the system prompt.
		const aiResponse = await GroqService.chat([], text, systemPrompt)

		// 8. SEND REPLY
		if (aiResponse) {
			const cleanResponse = aiResponse.trim()
			const signature = `\n\n— 🤖 avto-javob`
			const finalMessage = cleanResponse + signature

			try {
				await ctx.reply(finalMessage, { parse_mode: 'Markdown' })
			} catch (error) {
				logger.error(`Secretary: Failed to reply to ${senderId}`, error)
				// Fallback to HTML or plain text if Markdown fails (safer)
				try {
					await ctx.reply(finalMessage)
				} catch (e) {
					logger.error('Secretary: Retry failed', e)
				}
			}

			// 9. SAVE AI REPLY TO DB
			// Save clean AI reply without signature
			await db.insert(messages).values({
				peerId: senderId,
				role: 'assistant',
				content: cleanResponse,
			})

			// Forward to Log Group
			if (config.LOG_GROUP_ID) {
				try {
					await ctx.api.sendMessage(
						config.LOG_GROUP_ID,
						`<b>📨 Yangi Suxbat</b>\n\n` +
							`👤 <b>Kimdan:</b> <a href="tg://user?id=${senderId}">${senderId}</a>\n` +
							`📥 <b>Xabar:</b> ${text}\n` +
							`🤖 <b>Javob:</b> ${cleanResponse}`, // Log clean response
						{ parse_mode: 'HTML' },
					)
				} catch (logError) {
					logger.error('Secretary: Failed to log to group', logError)
				}
			}
		}
	}
}
