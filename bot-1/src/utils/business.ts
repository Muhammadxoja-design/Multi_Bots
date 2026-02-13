import { config } from '@/config/env'
import { MyContext } from '@/core/context'
import { logger } from '@/utils/logger'

export interface BusinessInfo {
	senderId: number
	chatId: number
	connectionId: string
	directMessagesTopicId?: number
	text: string
	isOwner: boolean
	canReply: boolean
	messageId: number
}

const businessPeerCache = new Map<string, number>()

export function extractBusinessInfo(ctx: MyContext): BusinessInfo | null {
	// Strictly check business_message
	const bm = ctx.update.business_message || ctx.update.edited_business_message

	if (!bm) return null

	const senderId = bm.from?.id || 0
	const chatId = bm.chat.id
	const connectionId = bm.business_connection_id || ''
	const directMessagesTopicId = bm.direct_messages_topic?.topic_id
	const text = bm.text || bm.caption || '' // Handle caption for media
	const isOwner = senderId === config.OWNER_ID
	const messageId = bm.message_id

	// can_reply logic: assume true if we have connectionId, but ideally we should track connection state.
	// For now, if we have connectionId, we try.
	const canReply = !!connectionId

	return {
		senderId,
		chatId,
		connectionId,
		directMessagesTopicId,
		text,
		isOwner,
		canReply,
		messageId,
	}
}

export function rememberBusinessConnection(
	connectionId: string,
	userChatId: number,
) {
	if (!connectionId || !Number.isFinite(userChatId)) return
	businessPeerCache.set(connectionId, userChatId)
}

export async function resolveBusinessPeerChatId(
	ctx: MyContext,
	fallbackChatId: number,
	connectionId: string,
): Promise<number> {
	if (!connectionId) return fallbackChatId

	const cached = businessPeerCache.get(connectionId)
	if (cached) return cached

	try {
		const conn = await ctx.api.getBusinessConnection(connectionId)
		const peerChatId = conn.user_chat_id
		if (Number.isFinite(peerChatId)) {
			businessPeerCache.set(connectionId, peerChatId)
			return peerChatId
		}
	} catch (error) {
		logger.warn(
			`resolveBusinessPeerChatId: fallback to chatId=${fallbackChatId} for conn=${connectionId}`,
		)
	}

	return fallbackChatId
}

export async function replyBusiness(
	ctx: MyContext,
	chatId: number,
	text: string,
	connectionId: string,
	options: {
		parse_mode?: 'HTML' | 'MarkdownV2'
		direct_messages_topic_id?: number
		reply_to_message_id?: number
	} = {},
) {
	try {
		const payload: {
			business_connection_id?: string
			parse_mode?: 'HTML' | 'MarkdownV2'
			link_preview_options?: { is_disabled: boolean }
			reply_parameters?: {
				message_id: number
				chat_id?: number
			}
		} = {
			parse_mode: options.parse_mode,
			link_preview_options: { is_disabled: true },
		}

		if (connectionId) payload.business_connection_id = connectionId
		if (options.reply_to_message_id) {
			payload.reply_parameters = {
				message_id: options.reply_to_message_id,
				chat_id: chatId,
			}
		}

		// Note: direct_messages_topic_id is generally for business_message context?
		// Actually sendMessage doesn't support direct_messages_topic_id directly in generic payload types usually,
		// but if Grammy supports it blindly, we keep it.
		// However, it is not a standard sendMessage param. It is for 'sendChatAction' or others?
		// Wait, 'direct_messages_topic_id' is NOT in sendMessage. It is only in 'BusinessMessage' update.
		// Business replies usually just need connection_id and chat_id (user).
		// We will remove direct_messages_topic_id from sendMessage payload to avoid 400s if it's invalid field,
		// UNLESS we are sure it is needed.
		// Given the error was BUSINESS_PEER_INVALID, removing potential trash fields is good.

		await ctx.api.sendMessage(chatId, text, payload)
	} catch (error) {
		logger.error(
			`Failed to replyBusiness to ${chatId} (conn: ${connectionId}):`,
			error,
		)
		throw error
	}
}

export async function sendBusinessChatAction(
	ctx: MyContext,
	chatId: number,
	action: 'typing' | 'upload_photo' | 'record_voice' | 'upload_voice',
	connectionId: string,
	directMessagesTopicId?: number,
) {
	try {
		const payload: {
			business_connection_id?: string
			direct_messages_topic_id?: number
		} = {}
		if (connectionId) payload.business_connection_id = connectionId
		if (typeof directMessagesTopicId === 'number') {
			payload.direct_messages_topic_id = directMessagesTopicId
		}

		await ctx.api.sendChatAction(chatId, action, payload)
	} catch (error) {
		// Ignore typing errors (minor)
	}
}
