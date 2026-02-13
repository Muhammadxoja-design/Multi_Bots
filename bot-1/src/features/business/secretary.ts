import { config } from '@/config/env'
import { MyContext } from '@/core/context'
import { renderDashboard } from '@/features/admin/dashboard'
import { handleAdminInput } from '@/features/admin/input'
import { CRMService } from '@/services/ai/crm'
import { GroqService } from '@/services/groq'
import { HistoryService } from '@/services/history'
import { SettingsService } from '@/services/settings'
import {
	extractBusinessInfo,
	replyBusiness,
	sendBusinessChatAction,
} from '@/utils/business'
import { logger } from '@/utils/logger'
import { transformPremiumEmoji } from '@/utils/premiumEmoji'

export class Secretary {
	static async handle(ctx: MyContext) {
		logger.info('Secretary.handle called')
		const info = extractBusinessInfo(ctx)

		if (!info) {
			logger.warn('Secretary: extractBusinessInfo returned null')
			return
		}

		logger.info(
			`Secretary: Info extracted: sender=${info.senderId}, chat=${info.chatId}, connId=${info.connectionId}, canReply=${info.canReply}, isOwner=${info.isOwner}`,
		)

		const {
			senderId,
			chatId,
			connectionId,
			directMessagesTopicId,
			text,
			isOwner,
			canReply,
			messageId,
		} = info

		// 0. Check Permissions
		if (!canReply) {
			if (isOwner) {
				logger.warn(`⚠️ Business Connection ${connectionId} cannot reply!`)
			} else {
				logger.warn(
					`Secretary: Skipping customer message because canReply is false (no connectionId)`,
				)
			}
			return
		}

		// ---------------------------------------------------------
		// FLOW A: OWNER (Admin Panel)
		// ---------------------------------------------------------
		if (isOwner) {
			// 1. Check Input Mode
			if (ctx.session.step === 'awaiting_reply_text') {
				// Inject text into context for handler if needed, or just pass to function
				// handleAdminInput expects ctx.message.text usually, but here we have business text.
				// We need to patch ctx.message for handleAdminInput to work, OR refactor handleAdminInput.
				// Let's patch strictly for this call.
				;(ctx as any).message = { text }
				await handleAdminInput(ctx)
				return
			}

			// 2. Default: Show Dashboard
			// If text is "/start" or anything else, just show panel.
			const dashboard = await renderDashboard(ctx)
			try {
				const payload: {
					business_connection_id?: string
					direct_messages_topic_id?: number
					parse_mode: 'HTML'
					reply_markup: typeof dashboard.keyboard
				} = {
					parse_mode: 'HTML',
					reply_markup: dashboard.keyboard,
				}
				if (connectionId) payload.business_connection_id = connectionId
				if (typeof directMessagesTopicId === 'number') {
					payload.direct_messages_topic_id = directMessagesTopicId
				}

				const msg = await ctx.api.sendMessage(chatId, dashboard.text, payload)

				// Save dashboard ID for future edits
				await SettingsService.updateSettings({
					dashboardChatId: chatId,
					dashboardMessageId: msg.message_id,
				})
			} catch (e) {
				logger.error('Failed to send dashboard:', e)
			}
			return
		}

		// ---------------------------------------------------------
		// FLOW B: CUSTOMER (Secretary Auto-Reply)
		// ---------------------------------------------------------

		// 1. Check Settings
		const settings = await SettingsService.getSettings()

		// Quiet Hours Check
		let isQuiet = false
		if (settings.quietHoursEnabled && settings.quietFrom && settings.quietTo) {
			const now = new Date()
			const [h, m] = now
				.toLocaleTimeString('en-US', {
					hour12: false,
					timeZone: 'Asia/Tashkent',
				})
				.split(':')
			const current = parseInt(h) * 60 + parseInt(m)
			const [startH, startM] = settings.quietFrom.split(':').map(Number)
			const [endH, endM] = settings.quietTo.split(':').map(Number)
			const startMinutes = startH * 60 + startM
			const endMinutes = endH * 60 + endM

			if (startMinutes > endMinutes) {
				// Overnight
				if (current >= startMinutes || current < endMinutes) isQuiet = true
			} else {
				// Same day
				if (current >= startMinutes && current < endMinutes) isQuiet = true
			}
		}

		// Logic: Away ON + Not Quiet -> Reply.
		// Away OFF -> Silent.
		if (!settings.isAway) {
			logger.info(
				`Secretary: Skipping message from ${senderId} (Away Mode is OFF)`,
			)
			return
		}
		if (isQuiet) {
			logger.info(
				`Secretary: Skipping message from ${senderId} (Quiet Hours are ON)`,
			)
			return
		}

		// 2. Save User Message
		await HistoryService.saveMessage(senderId, 'user', text)

		// 3. Typing Status
		await sendBusinessChatAction(
			ctx,
			chatId,
			'typing',
			connectionId,
			directMessagesTopicId,
		)

		// 4. Fetch History & Context
		const historyText = await HistoryService.getRecentContext(senderId, 15)
		const profile = await CRMService.getProfile(senderId)
		const userSummary = profile?.summary || 'Yangicha suhbatdosh'
		const userCat = profile?.relationshipType || "Noma'lum"

		// 5. System Prompt (Engaging Mode)
		const systemPrompt = `
      ROLE: Sen - ${config.OWNER_NAME || "Xo'jayin"}ning aqlli va samimiy AI yordamchimisiz.
      SENING VAZIFANG: Suhbatdosh bilan qiziqarli suhbat qurish va qo'lingdan kelganicha yordam berish.
      
      📊 XO'JAYINNING HOLATI: "${settings.autoReplyText}" (Lekin bu senga gaplashishga to'sqinlik qilmaydi).
      🎭 KAYFIYAT: ${settings.aiMood} (Agar "Hazilkash" bo'lsa - ko'proq emojilar va hazil ishlat).
      👤 SUHBATDOSH: ${userSummary} (${userCat}).

      QAT'IY QOIDALAR:
      1. **Yordam Ber:** Agar suhbatdosh savol bersa (ilm-fan, tarjima, maslahat), DARHOL javob ber. "Xo'jayin band" deb bahona qilma. Sen o'zing ham aqllisan.
      2. **Chegara:** Faqat Xo'jayinning shaxsiy hayoti yoki uchrashuvlar haqida so'rasa, "Xo'jayin kelganlarida aytaman" deb javob ber.
      3. **Qiziqtir:** Suhbatni quruq qoldirma. Oxirida qiziqarli savol ber yoki mavzuga oid fakt ayt.
      4. **Tarix:** Oldingi suhbatni eslab, mantiqiy davom ettir:
      ${historyText}

      JAVOB USLUBI:
      - O'zbek tilida (Lotin yozuvida).
      - Qisqa, lo'nda va samimiy.
      - Xuddi tirik odamdek gaplash (robotdek emas).
      - Haddan tashqari bachkana bo'lib ketmasin, samimiy va foydali bo'lsin.
    `

		// 6. Generate AI Response
		// logger.info(`Secretary: Generating AI response for ${senderId}...`)
		const aiResponse = await GroqService.chat([], text, systemPrompt)
		if (!aiResponse) return

		// 7. Send Reply
		const finalRefined = transformPremiumEmoji(aiResponse)

		try {
			try {
				await replyBusiness(ctx, chatId, finalRefined, connectionId, {
					parse_mode: 'HTML',
					direct_messages_topic_id: directMessagesTopicId,
					reply_to_message_id: messageId,
				})
			} catch (firstError: any) {
				const isBusinessPeerInvalid =
					firstError?.description?.includes?.('BUSINESS_PEER_INVALID') ||
					firstError?.message?.includes?.('BUSINESS_PEER_INVALID')

				if (
					!isBusinessPeerInvalid ||
					typeof directMessagesTopicId !== 'number'
				) {
					throw firstError
				}

				logger.warn(
					`Secretary: retrying without direct_messages_topic_id for ${senderId} (chat=${chatId}, conn=${connectionId})`,
				)
				await replyBusiness(ctx, chatId, finalRefined, connectionId, {
					parse_mode: 'HTML',
					reply_to_message_id: messageId,
				})
			}

			// 8. Log to Owner's Log Group (if configured)
			if (config.LOG_GROUP_ID) {
				try {
					await ctx.api.sendMessage(
						config.LOG_GROUP_ID,
						`<b>📨 Yangi Suxbat</b>\n\n` +
							`👤 <b>Kimdan:</b> <a href="tg://user?id=${senderId}">${senderId}</a>\n` +
							`📥 <b>Xabar:</b> ${text}\n` +
							`🤖 <b>Javob:</b> ${finalRefined}`,
						{ parse_mode: 'HTML' },
					)
				} catch (logStats) {
					logger.error(`Failed to log conversation to LOG_GROUP:`, logStats)
				}
			}
		} catch (e) {
			logger.error(`Secretary: Failed to send reply to ${senderId}:`, e)
		}

		// 9. Save Assistant Message
		await HistoryService.saveMessage(senderId, 'assistant', finalRefined)
	}
}
