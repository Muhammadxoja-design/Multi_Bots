const { Telegraf } = require('telegraf')
const db = require('./db')
const ai = require('./ai')

module.exports = async function startGrainBot({
	botToken,
	groqKey,
	orderGroupId,
}) {
	if (!botToken || !groqKey) {
		console.error('❌ Grain Bot: Token or API Key missing!')
		return
	}

	console.log('🌾 Starting Grain Business Bot...')

	// Initialize DB and AI
	db.initDb()
	ai.initAI(groqKey)

	const bot = new Telegraf(botToken)

	// Command to set owner
	bot.command('setowner', async ctx => {
		const userId = ctx.from.id.toString()
		db.setSetting('owner_id', userId)
		await ctx.reply(
			`✅ Siz bot xo'jayini sifatida belgilandingiz! (ID: ${userId})`,
		)
		console.log(`👑 Owner set to: ${userId}`)
	})

	// Also allow /start to set owner if no owner is set yet, or just generic start
	bot.start(async ctx => {
		const ownerId = db.getSetting('owner_id')
		if (!ownerId) {
			db.setSetting('owner_id', ctx.from.id.toString())
			await ctx.reply(
				`👋 Salom! Siz birinchi bo'lib yozdingiz va bot xo'jayini sifatida belgilandingiz.`,
			)
		} else {
			await ctx.reply(`👋 Salom! Don mahsulotlari bo'yicha yordam beraman.`)
		}
	})

	// Business Message Handler
	bot.on('business_message', async ctx => {
		const message = ctx.update.business_message

		// Safety check
		if (!message || !message.from) {
			console.error('⚠️ Received business_message with invalid structure')
			return
		}

		// Ignore messages sent by us (the bot owner/admin) to avoid loops
		if (message.from.id === ctx.botInfo.id) return

		// Also good to check if it's strictly from the "user" side of the connection
		// But for a simple userbot responding to incoming DMs:
		// message.from.id is the customer.

		const userText = message.text
		if (!userText) return

		console.log(`📩 Business SMS from ${message.from.first_name}: ${userText}`)

		try {
			// 1. Get Product Data from DB
			const products = db.getProducts()

			// 2. Generate AI Response
			const replyText = await ai.generateResponse(userText, products)

			// 3. Send Reply
			await ctx.telegram.sendMessage(message.chat.id, replyText, {
				business_connection_id: message.business_connection_id,
			})

			// 4. Check for "ZAKAZ" intent
			// For Bot 2, orderGroupId is FORUM_CHAT_ID_2. But if user wants to use dynamic OWNER_ID for notifications too?
			// The requirement was just "set owner id via command".
			// If orderGroupId exists (from env), use it. If not, maybe message owner?
			// For now, adhere to existing logic but use orderGroupId or fallback to owner.
			let targetId = orderGroupId
			if (!targetId) {
				const ownerId = db.getSetting('owner_id')
				if (ownerId) targetId = ownerId
			}

			if (replyText.includes('ZAKAZ') && targetId) {
				const orderMsg = `
📣 **Yangi Buyurtma!**
👤 Mijoz: [${message.from.first_name}](tg://user?id=${message.from.id})
📝 Xabar: ${userText}
AI Javobi: ${replyText}
`
				await ctx.telegram.sendMessage(targetId, orderMsg, {
					parse_mode: 'Markdown',
				})
				console.log(`✅ Order forwarded to ${targetId}`)
			}
		} catch (err) {
			console.error('Error handling business message:', err)
		}
	})

	bot
		.launch()
		.then(() => {
			console.log('✅ Grain Bot (Business) started successfully!')
		})
		.catch(err => {
			console.error('❌ Grain Bot failed to start:', err)
		})

	// Enable graceful stop
	process.once('SIGINT', () => bot.stop('SIGINT'))
	process.once('SIGTERM', () => bot.stop('SIGTERM'))
}
