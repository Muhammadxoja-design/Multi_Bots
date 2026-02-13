import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
	BOT_TOKEN_1: z.string().min(1, 'BOT_TOKEN_1 is required'),
	OWNER_ID_1: z.coerce
		.number()
		.int()
		.positive('OWNER_ID_1 must be a positive integer'),
	LOG_GROUP_ID_1: z.coerce
		.number()
		.int()
		.negative('LOG_GROUP_ID_1 must be a negative integer (Supergroup ID)'),
	GROQ_API_KEY_1: z.string().min(1, 'GROQ_API_KEY_1 is required'),
	GROQ_KEY_START_DATE: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'GROQ_KEY_START_DATE must be YYYY-MM-DD')
		.optional(),
	NODE_ENV: z
		.enum(['development', 'production', 'test'])
		.default('development'),
	DB_PATH: z.string().default('./bot.db'),
	OWNER_NAME: z.string().default("Xo'jayin"),
})

const env = envSchema.parse(process.env)

export const config = {
	BOT_TOKEN: env.BOT_TOKEN_1,
	OWNER_ID: env.OWNER_ID_1,
	LOG_GROUP_ID: env.LOG_GROUP_ID_1,
	GROQ_API_KEY: env.GROQ_API_KEY_1,
	GROQ_KEY_START_DATE: env.GROQ_KEY_START_DATE,
	NODE_ENV: env.NODE_ENV,
	DB_PATH: env.DB_PATH,
	OWNER_NAME: env.OWNER_NAME,
}

export type EnvConfig = z.infer<typeof envSchema>
