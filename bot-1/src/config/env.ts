import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
	BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
	OWNER_ID: z.coerce
		.number()
		.int()
		.positive('OWNER_ID must be a positive integer'),
	LOG_GROUP_ID: z.coerce
		.number()
		.int()
		.negative('LOG_GROUP_ID must be a negative integer (Supergroup ID)'),
	GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
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

export const config = envSchema.parse(process.env)

export type EnvConfig = z.infer<typeof envSchema>
