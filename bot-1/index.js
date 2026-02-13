import dotenv from 'dotenv'
import { Bot, InlineKeyboard } from 'grammy'

dotenv.config()

const bot1 = new Bot(process.env.BOT_TOKEN_1)

bot1.command('start', async ctx => {
	const keyboard = new InlineKeyboard().text('Option 1', 'option_1')

	await ctx.reply('Assalamualaikum!\nWelcome to our bot!\nChose Option', {
		reply_markup: keyboard,
	})
})

bot1.callbackQuery('option_1', async ctx => {
	await ctx.answerCallbackQuery()
	await ctx.reply('You chose Option 1')
})

export default bot1
