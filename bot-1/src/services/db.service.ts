import { db } from '@/db'
import { notes, tasks } from '@/db/schema'
import { logger } from '@/utils/logger'
import { and, desc, eq } from 'drizzle-orm'

export class DbService {
	// --- NOTES ---

	static async addNote(userId: number, content: string) {
		try {
			const result = await db
				.insert(notes)
				.values({
					userId,
					content,
				})
				.returning({ id: notes.id })
			return result[0]
		} catch (error) {
			logger.error('Failed to add note', error)
			return null
		}
	}

	static async getRecentNotes(userId: number, limit = 5) {
		return db
			.select()
			.from(notes)
			.where(eq(notes.userId, userId))
			.orderBy(desc(notes.createdAt))
			.limit(limit)
	}

	// --- TASKS ---

	static async addTask(userId: number, title: string) {
		try {
			const result = await db
				.insert(tasks)
				.values({
					userId,
					title,
				})
				.returning({ id: tasks.id })
			return result[0]
		} catch (error) {
			logger.error('Failed to add task', error)
			return null
		}
	}

	static async getAllTasks(userId: number) {
		const result = await db
			.select()
			.from(tasks)
			.where(eq(tasks.userId, userId))
			.orderBy(desc(tasks.createdAt))

		// Sort: Pending first, then Completed
		return result.sort((a, b) => {
			if (a.isCompleted === b.isCompleted) return 0
			return a.isCompleted ? 1 : -1
		})
	}

	static async toggleTaskStatus(taskId: number) {
		try {
			const task = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, taskId))
				.get()
			if (!task) return null

			const newStatus = !task.isCompleted
			await db
				.update(tasks)
				.set({ isCompleted: newStatus })
				.where(eq(tasks.id, taskId))

			return newStatus
		} catch (error) {
			logger.error(`Failed to toggle task ${taskId}`, error)
			return null
		}
	}

	static async clearCompletedTasks(userId: number) {
		try {
			await db
				.delete(tasks)
				.where(and(eq(tasks.userId, userId), eq(tasks.isCompleted, true)))
			return true
		} catch (error) {
			logger.error('Failed to clear completed tasks', error)
			return false
		}
	}
}
