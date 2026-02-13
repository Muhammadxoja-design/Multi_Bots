import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Settings Table
export const settings = sqliteTable('settings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	ownerId: integer('owner_id').notNull().default(0),
	isAway: integer('is_away', { mode: 'boolean' }).notNull().default(false),
	quietHoursEnabled: integer('quiet_hours_enabled', { mode: 'boolean' })
		.notNull()
		.default(false),
	quietFrom: text('quiet_from').notNull().default('23:00'),
	quietTo: text('quiet_to').notNull().default('08:00'),
	aiMood: text('ai_mood').notNull().default('serious'), // 'serious' | 'friendly'
	autoReplyText: text('auto_reply_text')
		.notNull()
		.default('Hozir bandman, xabaringizni qoldiring.'),
	dashboardChatId: integer('dashboard_chat_id'), // Use integer, typically safe for IDs
	dashboardMessageId: integer('dashboard_message_id'),
})

// Chat History Table
export const messages = sqliteTable('messages', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	peerId: integer('peer_id').notNull(), // User or Chat ID
	role: text('role').notNull(), // 'user' | 'assistant'
	content: text('content').notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
})

// CRM Profiles Table
export const crmProfiles = sqliteTable('crm_profiles', {
	userId: integer('user_id').primaryKey(),
	firstName: text('first_name'),
	relationshipType: text('relationship_type').default('Unknown'), // 'Close Friend', 'Client', 'New'
	summary: text('summary'),
	birthday: text('birthday'),
	lastInteraction: text('last_interaction'),
})
