import { Context, SessionFlavor } from 'grammy'

// Define ChatMessage here to avoid circular dependency with GroqService
export interface ChatMessage {
	role: 'user' | 'model'
	parts: string
}

export interface SessionData {
	topics: Record<string, number>
	history: ChatMessage[]
	step?: string // For multi-step interactions (e.g. admin settings)
}

export interface UserProfile {
	userId: number
	firstName: string
	relationshipType: string | null
	summary: string | null
	birthday: string | null
}

// Combine Context with SessionFlavor and our custom properties
export type MyContext = Context &
	SessionFlavor<SessionData> & {
		userProfile?: UserProfile
	}
