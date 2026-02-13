export type ToolName =
	| 'get_weather'
	| 'add_task'
	| 'search_internet'
	| 'translate_text'
	| 'general_chat'

export interface Tool {
	name: ToolName
	description: string
	parameters: string
}

export const TOOLS: Tool[] = [
	{
		name: 'get_weather',
		description: 'Get the current weather for a specific city.',
		parameters: '{ "city": "string" }',
	},
	{
		name: 'add_task',
		description: "Add a new task to the user's to-do list.",
		parameters: '{ "task": "string", "time": "string (optional)" }',
	},
	{
		name: 'search_internet',
		description: 'Search the internet for real-time information.',
		parameters: '{ "query": "string" }',
	},
	{
		name: 'translate_text',
		description: 'Translate text from one language to another.',
		parameters: '{ "text": "string", "target_lang": "string" }',
	},
	{
		name: 'general_chat',
		description:
			'Handle general conversation, small talk, or questions not covered by other tools.',
		parameters: '{ "response": "string" }',
	},
]

export const SYSTEM_TOOL_PROMPT = `
You are the "Intelligent Dispatcher" for a personal Telegram bot.
Your goal is to analyze the user's message and decide which tool to use.

AVAILABLE TOOLS:
${TOOLS.map(t => `- ${t.name}: ${t.description} (Args: ${t.parameters})`).join('\n')}

INSTRUCTIONS:
1.  Analyze the user's intent.
2.  If the user asks for data (weather, search) or an action (add task, translate), use the corresponding tool.
3.  If the user just wants to chat or the request is unclear, use "general_chat".
4.  For "business_message" (professional context), use "general_chat" with a professional tone unless a tool is clearly needed.
5.  **CRITICAL**: You MUST return a VALID JSON object in the following format:
    { "tool": "tool_name", "args": { ... } }

EXAMPLE 1 (Weather):
User: "What's the weather in London?"
Output: { "tool": "get_weather", "args": { "city": "London" } }

EXAMPLE 2 (General):
User: "Hi, how are you?"
Output: { "tool": "general_chat", "args": { "response": "I'm doing well, thank you! How can I help you today?" } }

EXAMPLE 3 (Business):
User (Business Client): "What are your opening hours?"
Output: { "tool": "general_chat", "args": { "response": "Hello, thank you for your inquiry. We are open Mon-Fri from 9 AM to 5 PM." } }
`
