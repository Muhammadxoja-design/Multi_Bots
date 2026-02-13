import { logger } from '@/utils/logger'
import { ToolName } from './definitions'

export const executeTool = async (
	name: ToolName,
	args: any,
): Promise<string> => {
	logger.info(`Executing tool: ${name} with args: ${JSON.stringify(args)}`)

	try {
		switch (name) {
			case 'get_weather':
				return await getWeather(args.city)
			case 'add_task':
				return await addTask(args.task, args.time)
			case 'search_internet':
				return await searchInternet(args.query)
			case 'translate_text':
				return await translateText(args.text, args.target_lang)
			case 'general_chat':
				return args.response
			default:
				return 'Error: Unknown tool selected.'
		}
	} catch (error) {
		logger.error(`Error executing tool ${name}:`, error)
		return 'I encountered an error while processing your request.'
	}
}

// --- Individual Executors ---

async function getWeather(city: string): Promise<string> {
	// Mock: Real implementation would call API
	// Simple simulation of successful check
	return `🌤 ${city} shahrida ob-havo: +22°C, Quyoshli. (Simulyatsiya)`
}

async function addTask(task: string, time?: string): Promise<string> {
	try {
		// Log to console only, since TopicManager is removed
		logger.info(`New Task: ${task} (Time: ${time})`)
		return `✅ Vazifa qo'shildi: "${task}"`
	} catch (error) {
		logger.error('Failed to log task:', error)
		return `✅ Vazifa qo'shildi (Lekin log yozilmadi): "${task}"`
	}
}

async function searchInternet(query: string): Promise<string> {
	// Mock
	return `🔍 <b>"${query}" bo'yicha qidiruv natijalari:</b>\n\n1. ${query} haqida ma'lumot...\n2. ${query} yangiliklari...`
}

async function translateText(
	text: string,
	targetLang: string,
): Promise<string> {
	// Mock
	return `🔤 <b>Tarjima (${targetLang}):</b>\n${text} (Simulyatsiya)`
}

/**
 * Custom tool for creating notes directly (if we had a 'create_note' tool, mostly covered by general_chat or task,
 * but assuming we might add it or use addTask logic for general notes if requested)
 * For now, we update 'general_chat' to NOT be a specific function but handled by caller if simple text.
 * The executor assumes tools match definitions.
 */
