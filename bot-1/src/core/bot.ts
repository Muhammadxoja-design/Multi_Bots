import { config } from '@/config/env'
import { MyContext } from '@/core/context'
import { Bot } from 'grammy'

export const bot = new Bot<MyContext>(config.BOT_TOKEN)
