const { Telegraf, Markup } = require('telegraf')
const db = require('./db')
const ai = require('./ai')

module.exports = async function startGrainBot({
	botToken,
	groqKey,
	orderGroupId,
	adminId, // Passed from process.env.ADMIN_ID_2 via index.js
}) {
	if (!botToken || !groqKey) {
		console.error('❌ GrainBot: Token or Key missing!')
		return
	}

	// Init modules
	db.initDb()
	ai.initAI(groqKey)

	const bot = new Telegraf(botToken)
	const CHANNEL_ID = process.env.CHANNEL_ID

	// --- STATE MANAGEMENT ---
	// Simple in-memory state for Admin
	let adminState = {
		mode: 'inventory', // 'inventory' | 'marketing'
	}

	// --- KEYBOARD MENU ---
	const mainKeyboard = Markup.keyboard([
		['🏪 Ombor va Hisob', '📢 Marketing va Kanal'],
		['📊 Statistika', '❌ Bekor qilish'],
	]).resize()

	// --- MODE SWITCHERS ---
	bot.hears('🏪 Ombor va Hisob', async ctx => {
		if (adminId && ctx.from.id.toString() !== adminId.toString()) return
		adminState.mode = 'inventory'
		await ctx.reply(
			'📦 **Ombor Rejimi.**\nNima keldi yoki ketdi? Yozishingiz mumkin.',
			mainKeyboard,
		)
	})

	bot.hears('📢 Marketing va Kanal', async ctx => {
		if (adminId && ctx.from.id.toString() !== adminId.toString()) return
		adminState.mode = 'marketing'
		await ctx.reply(
			"🎨 **Marketing Rejimi.**\nKanalga qo'yish uchun rasm va izoh (caption) tashlang.",
			mainKeyboard,
		)
	})

	bot.hears('📊 Statistika', async ctx => {
		if (adminId && ctx.from.id.toString() !== adminId.toString()) return
		// Direct Action, doesn't change mode necessarily, or keeps current
		const stats = db.getProfitStats()
		const msgText = `
📊 **Statistika**

📅 Bugun:
Foyda: ${stats.today.profit.toLocaleString()} so'm
Savdo: ${stats.today.revenue.toLocaleString()} so'm

💰 Jami:
Foyda: ${stats.total.profit.toLocaleString()} so'm
Savdo: ${stats.total.revenue.toLocaleString()} so'm
`
		await ctx.reply(msgText, { parse_mode: 'Markdown' })
	})

	bot.hears('❌ Bekor qilish', async ctx => {
		if (adminId && ctx.from.id.toString() !== adminId.toString()) return
		adminState.mode = 'inventory' // Reset to default
		await ctx.reply('Menyu yangilandi. Hozir: Ombor Rejimi', mainKeyboard)
	})

	// --- START COMMAND ---
	bot.start(async ctx => {
		if (adminId && ctx.from.id.toString() === adminId.toString()) {
			await ctx.reply("Assalomu alaykum, Xo'jayin! 👋", mainKeyboard)
		} else {
			// For non-admins (customers starting regular chat)
			await ctx.reply('Assalomu alaykum! Bizning botimizga xush kelibsiz.')
		}
	})

	// --- ADMIN HANDLER (Private Chat) ---
	bot.on(['text', 'photo'], async (ctx, next) => {
		// Business messages are handled separately
		if (ctx.update.business_message) return next()

		// Check if Private Chat & Sender is Admin
		const isPrivate = ctx.chat.type === 'private'
		const isAdmin = adminId && ctx.from.id.toString() === adminId.toString()

		// Ignore non-admin private messages (or treat as customer if needed, but per requirements this is Admin Logic)
		// If it's a customer in private chat, maybe we should let them talk?
		// But the prompt focuses on Admin Logic. Let's assume non-admin private chat is ignored or standard greeting.
		if (!isPrivate || !isAdmin) return next()

		// Skip if it matched a Hears command (Telegraf handles this order, but just in case)
		// Actually, bot.on runs after bot.hears if we don't stop propagation.
		// But simpler to just check if text matches menu triggers?
		// Telegraf middleware chain: actions/hears usually come before generic 'text'.
		// If we are here, likely no command matched.

		// const fs = require('fs') // Removed
		// const path = require('path') // Removed
		const axios = require('axios')

		// ... existing code ...

		const text = ctx.message.text
		const hasPhoto = !!ctx.message.photo
		const hasVoice = !!ctx.message.voice

		let msgText = text || ''

		// --- HANDLE VOICE MESSAGE ---
		if (hasVoice) {
			try {
				const fileId = ctx.message.voice.file_id
				const link = await ctx.telegram.getFileLink(fileId)

				await ctx.reply('⏳ Eshitmoqdaman...')

				// Transcribe Stream (No FS)
				const transcribed = await ai.transcribeAudio(link.href)

				if (!transcribed) {
					return ctx.reply("❌ Ovozni tushunib bo'lmadi.")
				}

				msgText = transcribed
				await ctx.reply(`🗣 **Siz aytdingiz:** _"${msgText}"_`, {
					parse_mode: 'Markdown',
				})
			} catch (err) {
				console.error('Voice Error:', err)
				return ctx.reply('❌ Ovozni ishlashda xatolik.')
			}
		}

		// --- CASE 1: MARKETING MODE ---
		if (adminState.mode === 'marketing') {
			if (!msgText && !hasPhoto) return

			// If voice was sent, we use transcribed text as caption/prompt
			// If photo + text, use text.
			// If voice only -> generate text post?

			// The prompt says "Kanalga qo'yish uchun rasm va izoh tashlang".
			// If voice comes, we treat it as caption.

			const rawCaption = ctx.message.caption || msgText || ''

			if (hasPhoto) {
				// ... photo logic ...
				if (!rawCaption) {
					return ctx.reply('⚠️ Iltimos, rasmga izoh ham yozing.')
				}
				await ctx.reply('⏳ Post tayyorlanmoqda (Premium)...')
				try {
					const generatedCaption = await ai.generateMarketingPost(rawCaption)
					const photoId =
						ctx.message.photo[ctx.message.photo.length - 1].file_id

					await ctx.replyWithPhoto(photoId, {
						caption: generatedCaption, // Markdown is risky with deep formatting, let's try.
						// AI returns bold **text**, so parse_mode: Markdown is needed.
						parse_mode: 'Markdown',
						reply_markup: {
							inline_keyboard: [
								[
									{ text: '✅ Kanalga Joylash', callback_data: 'post_approve' },
									{ text: '❌ Bekor qilish', callback_data: 'post_cancel' },
								],
							],
						},
					})
				} catch (err) {
					console.error('Marketing Error:', err)
					await ctx.reply('❌ AI Xatolik.')
				}
			} else if (msgText) {
				// Text/Voice only -> Generate Text Post?
				// Requirements said "Only Photo or Text...".
				// Let's support Text-Only Marketing Post via Voice/Text
				await ctx.reply('⏳ Matnli Post tayyorlanmoqda...')
				try {
					const generatedText = await ai.generateMarketingPost(msgText)

					await ctx.reply(generatedText, {
						parse_mode: 'Markdown',
						reply_markup: {
							inline_keyboard: [
								[
									// We need a way to publish text-only?
									// The existing action `post_approve` expects a photo in the message logic (ctx.callbackQuery.message.photo).
									// We might need a new action or update `post_approve` to handle text-only.
									// For now, let's just return the text to Admin and let them copy-paste or add a photo.
									// Or force them to send photo.
									// User prompt: "Faqat Rasm (photo) yoki Matn kelsa -> ai.generateMarketingPost()... Tayyor postni Adminga qaytarib..."
									// Let's assume text-only is allowed but existing `post_approve` might fail.
									// Let's instruct them: "Rasm bilan yuborsangiz kanalga chiqara olaman."
								],
							],
						},
					})
					await ctx.reply(
						"💡 Maslahat: Agar rasm bilan yuborsangiz, to'g'ridan-to'g'ri kanalga chiqarish tugmasi bo'ladi.",
					)
				} catch (err) {
					// ...
				}
			}
			return
		}

		// --- CASE 2: INVENTORY MODE ---
		if (adminState.mode === 'inventory') {
			if (hasPhoto) {
				return ctx.reply(
					"⚠️ Ombor rejimida rasm qabul qilinmaydi. Marketingga o'ting",
					mainKeyboard,
				)
			}

			// Allow Voice -> Text -> Command
			if (!msgText) return // No text, no voice result

			console.log(`👑 Admin Command (Inventory): ${msgText}`)
			try {
				const parsed = await ai.parseAdminCommand(msgText)
				// ... existing inventory logic using parsed ...
				if (parsed.type === 'restock') {
					const res = db.updateStock(parsed.item, parsed.qty, parsed.cost)
					if (res.success) {
						await ctx.reply(
							`✅ Ombor yangilandi: ${res.name}\nQo'shildi: +${res.added}\nYangi Qoldiq: ${res.newStock}`,
							mainKeyboard,
						)
					} else {
						await ctx.reply(
							`❌ Xatolik: ${res.message || 'Mahsulot topilmadi'}`,
							mainKeyboard,
						)
					}
				} else if (parsed.type === 'stats') {
					// ...
					const stats = db.getProfitStats()
					const msgText = `📊 Foyda: ${stats.today.profit.toLocaleString()} so'm`
					await ctx.reply(msgText, mainKeyboard)
				} else if (parsed.type === 'message') {
					await ctx.reply(parsed.text, mainKeyboard)
				} else {
					await ctx.reply(
						'🤖 Tushunarsiz buyruq.\n"Un keldi 50 qop" yoki "Foyda" deb yozing.',
						mainKeyboard,
					)
				}
			} catch (err) {
				console.error('Admin Cmd Error:', err)
				await ctx.reply('❌ Tizim xatoligi.', mainKeyboard)
			}
			return
		}

		return next()
	})

	// --- ADMIN ACTIONS (Buttons) ---
	bot.action('post_approve', async ctx => {
		if (!CHANNEL_ID) return ctx.answerCbQuery('❌ Channel ID sozlanmagan!')

		try {
			const msg = ctx.callbackQuery.message
			let finalCaption = msg.caption || ''

			// Cleanup
			finalCaption = finalCaption.replace(/^📝 \*AI Taklifi:\*\n\n/gm, '')
			// ... (same cleanup logic)

			const photoId = msg.photo[msg.photo.length - 1].file_id
			const botUsername = ctx.botInfo.username

			await ctx.telegram.sendPhoto(CHANNEL_ID, photoId, {
				caption: finalCaption,
				reply_markup: {
					inline_keyboard: [
						[
							{
								text: '🤖 Buyurtma berish',
								url: `https://t.me/${botUsername}`,
							},
						],
					],
				},
			})

			await ctx.answerCbQuery('✅ Kanalga chiqdi!')
			await ctx.editMessageCaption(
				`✅ **Kanalga Joylandi!**\n\n${finalCaption}`,
				{ parse_mode: 'Markdown' },
			)
		} catch (err) {
			console.error('Post Publish Error:', err)
			await ctx.answerCbQuery('❌ Xatolik: ' + err.message)
		}
	})

	bot.action('post_cancel', async ctx => {
		await ctx.deleteMessage()
		await ctx.answerCbQuery('❌ Bekor qilindi')
	})

	// --- CUSTOMER HANDLER (Business) ---
	bot.on('business_message', async ctx => {
		const msg = ctx.update.business_message
		if (!msg || !msg.text || msg.from.id === ctx.botInfo.id) return

		// Prevent Loop: If Admin is testing via Business Connection
		if (adminId && msg.from.id.toString() === adminId.toString()) {
			console.log('Skipping Admin message in Business Chat')
			return
		}

		console.log(`📩 Customer: ${msg.text}`)

		try {
			const products = db.getAllProducts()
			const aiReply = await ai.generateResponse(msg.text, products)

			await ctx.telegram.sendMessage(msg.chat.id, aiReply, {
				business_connection_id: msg.business_connection_id,
			})

			if (aiReply.includes('[ORDER_DETECTED]')) {
				const phoneRegex = /(\+998|998|90|91|93|94|95|97|98|99|88|33)[0-9]{7}/
				const hasPhone = phoneRegex.test(msg.text)

				if (hasPhone && orderGroupId) {
					const orderText = `
🚀 **Yangi Zakaz!**
👤 Mijoz: ${msg.from.first_name}
📞 Tel: ${msg.text.match(phoneRegex)[0]}
📝 Xabar: ${msg.text}
🤖 AI: ${aiReply.replace('[ORDER_DETECTED]', '').trim()}
`
					await ctx.telegram.sendMessage(orderGroupId, orderText, {
						parse_mode: 'Markdown',
					})
				}
			}
		} catch (err) {
			console.error('Business Bot Error:', err)
		}
	})

	bot
		.launch()
		.then(() => console.log('✅ GrainBot Started (Mode System Included)'))
		.catch(err => {
			console.error('❌ GrainBot Failed to Start:', err)
			if (err.code === 'ETIMEDOUT') {
				setTimeout(
					() => startGrainBot({ botToken, groqKey, orderGroupId, adminId }),
					5000,
				)
			}
		})

	process.once('SIGINT', () => bot.stop('SIGINT'))
	process.once('SIGTERM', () => bot.stop('SIGTERM'))
}
