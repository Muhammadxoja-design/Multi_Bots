import { EMOJIS } from '@/config/emojis'
import { config } from '@/config/env'
import { logger } from '@/utils/logger'
import Groq from 'groq-sdk'
import fs from 'node:fs'

import { ChatMessage } from '@/core/context'

export class GroqService {
	private static client = new Groq({
		apiKey: config.GROQ_API_KEY,
	})

	private static MODEL = 'llama-3.1-8b-instant'

	/**
	 * Sends a message to Groq (Llama 3) with history
	 * @param history Previous chat history
	 * @param message Current user message
	 * @returns The model's response text or null if failed
	 */
	static async chat(
		history: ChatMessage[],
		message: string,
		systemPrompt?: string,
	): Promise<string | null> {
		try {
			// 1. Prepare messages for Groq
			// We need to map our 'model' role to 'assistant' for Groq/OpenAI format
			const messages: Array<{
				role: 'system' | 'user' | 'assistant'
				content: string
			}> = [
				{
					role: 'system',
					content:
						systemPrompt ||
						'You are a helpful Telegram Assistant named "Nova". Keep answers concise and use Markdown. ' +
							'You have access to Premium Emojis. When you want to express joy, use {{JOY}}. ' +
							'For thinking/pondering, use {{THINK}}.',
				},
			]

			// Add history
			for (const msg of history) {
				messages.push({
					role: msg.role === 'model' ? 'assistant' : 'user',
					content: msg.parts,
				})
			}

			// Add current message
			messages.push({
				role: 'user',
				content: message,
			})

			// 2. Call Groq API
			const completion = await this.client.chat.completions.create({
				messages,
				model: this.MODEL,
				temperature: 0.7,
				max_tokens: 1024,
			})

			const responseText = completion.choices[0]?.message?.content || ''

			// 3. Post-processing: Replace Emoji Placeholders
			// We replace {{KEY}} with <tg-emoji emoji-id="ID">👍</tg-emoji>
			// Note: The inner char (👍) is a fallback if the client doesn't support the custom emoji.
			let finalResponse = responseText
				.replace(/{{JOY}}/g, `<tg-emoji emoji-id="${EMOJIS.JOY}">😄</tg-emoji>`)
				.replace(
					/{{THINK}}/g,
					`<tg-emoji emoji-id="${EMOJIS.THINKING}">🤔</tg-emoji>`,
				)

			return finalResponse
		} catch (error) {
			logger.error(`Groq API Error: ${error}`)
			return null
		}
	}

	/**
	 * Transcribes an audio file using Groq Whisper
	 * @param filePath Path to the audio file
	 * @returns The transcribed text or null
	 */
	static async transcribe(filePath: string): Promise<string | null> {
		try {
			const transcription = await this.client.audio.transcriptions.create({
				file: fs.createReadStream(filePath),
				model: 'whisper-large-v3',
				response_format: 'json',
			})
			return transcription.text
		} catch (error) {
			logger.error(`Groq Transcription Error Detailed: ${error}`)
			if (error instanceof Error) {
				logger.error(error.stack || error.message)
			}
			return null
		}
	}
	/**
	 * Sends a raw message array to Groq and expects a JSON response
	 * @param messages Array of messages
	 * @returns Parsed JSON object or null
	 */
	static async completeJSON(
		messages: Array<{
			role: 'system' | 'user' | 'assistant'
			content: string
		}>,
	): Promise<any | null> {
		try {
			const completion = await this.client.chat.completions.create({
				messages,
				model: 'llama-3.3-70b-versatile', // Use larger model for reasoning
				temperature: 0.2, // Lower temperature for more deterministic output
				max_tokens: 1024,
				response_format: { type: 'json_object' },
			})

			const responseText = completion.choices[0]?.message?.content || '{}'
			return JSON.parse(responseText)
		} catch (error) {
			logger.error(`Groq JSON API Error: ${error}`)
			return null
		}
	}
}
