import { logger } from '@/utils/logger'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

import { config } from '@/config/env'

// 1. Initialize SQLite Client
const sqlite = new Database(config.DB_PATH)

// 2. Initialize Drizzle ORM
export const db = drizzle(sqlite, { schema })

/**
 * Run migrations securely
 * For this simple bot, we'll use drizzle-kit push in dev,
 * but here is a placeholder if we wanted to run bundled migrations.
 */
export async function runMigrations() {
	try {
		// In a real prod app, you'd use migrate(db, { migrationsFolder: 'drizzle' })
		// but since we are using 'drizzle-kit push' strategy for this MVP,
		// we just log that DB is ready.
		logger.info('Database connected (bot.db)')
	} catch (error) {
		logger.error('Database migration failed', error)
		process.exit(1)
	}
}
