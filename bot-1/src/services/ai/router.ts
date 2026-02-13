import { executeTool } from '@/features/ai/tools/executors'
import { SYSTEM_PROMPT_UZBEK } from '@/services/ai/prompts'
import { GroqService } from '@/services/groq'
import { logger } from '@/utils/logger'

export class AIRouterService {
	/**
	 * Routes the user message to the appropriate tool or general chat
	 * @param text User's message text
	 * @param contextData Additional context (sender, isBusiness, etc.)
	 */
	static async routeAndProcess(
		text: string,
		contextData: {
			senderId: number
			isBusiness: boolean
			chatId: number
			userProfile?: {
				firstName: string
				relationshipType: string | null
				summary: string | null
			}
		},
	): Promise<string> {
		logger.info(
			`Routing message from ${contextData.senderId} (Business: ${contextData.isBusiness})`,
		)

		let systemPrompt = SYSTEM_PROMPT_UZBEK

		if (contextData.userProfile) {
			systemPrompt += `\n\nCONTEXT:\nYou are speaking to ${contextData.userProfile.firstName}, who is a ${contextData.userProfile.relationshipType || 'Unknown relation'}.\nUser Summary: ${contextData.userProfile.summary || 'No summary available.'}\nAdjust your tone accordingly.`
		}
		const messages: Array<{
			role: 'system' | 'user' | 'assistant'
			content: string
		}> = [
			{
				role: 'system',
				content: systemPrompt,
			},
			{
				role: 'user',
				content:
					(contextData.isBusiness
						? '[CONTEXT: Business Message from Client] '
						: '[CONTEXT: Personal Message] ') + text,
			},
		]

		try {
			// 2. Call LLM for Decision
			const decision = await GroqService.completeJSON(messages)

			if (!decision || !decision.tool) {
				logger.warn(
					'AI returned invalid JSON or no tool. Fallback to general chat.',
				)
				return 'I apologize, but I am having trouble processing your request right now.'
			}

			const { tool, args } = decision
			logger.info(`AI Decision: Tool="${tool}", Args=${JSON.stringify(args)}`)

			// 3. Execute Tool
			return await executeTool(tool, args || {})
		} catch (error) {
			logger.error('Router Error:', error)
			return 'An unexpected error occurred while routing your request.'
		}
	}
}
