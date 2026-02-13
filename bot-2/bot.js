const { Telegraf } = require('telegraf')
const db = require('./db')
const ai = require('./ai')

module.exports = async function startGrainBot({
	botToken,
	geminiKey,
	orderGroupId,
}) {
	if (!botToken || !geminiKey) {
		console.error('❌ Grain Bot: Token or API Key missing!')
		return
	}

	console.log('🌾 Starting Grain Business Bot...')

	// Initialize DB and AI
	db.initDb()
	ai.initAI(geminiKey)

	const bot = new Telegraf(botToken)

	// Business Message Handler
	bot.on('business_message', async ctx => {
		const message = ctx.message

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
			await ctx.telegram.sendMessage(ctx.chat.id, replyText, {
				business_connection_id: message.business_connection_id,
			})

			// 4. Check for "ZAKAZ" intent
			if (replyText.includes('ZAKAZ') && orderGroupId) {
				const orderMsg = `
📣 **Yangi Buyurtma!**
👤 Mijoz: [${message.from.first_name}](tg://user?id=${message.from.id})
📝 Xabar: ${userText}
AI Javobi: ${replyText}
`
				await ctx.telegram.sendMessage(orderGroupId, orderMsg, {
					parse_mode: 'Markdown',
				})
				console.log('✅ Order forwarded to admin group.')
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
