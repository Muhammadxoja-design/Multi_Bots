import { logger } from '@/utils/logger'
import * as fs from 'fs/promises'
import * as path from 'path'

// Define Storage interface locally since @grammyjs/session is not available
// and grammy core types might not export it directly in all versions.
export interface Storage<T> {
	read(key: string): Promise<T | undefined>
	write(key: string, value: T): Promise<void>
	delete(key: string): Promise<void>
}

export class FileAdapter<T> implements Storage<T> {
	private filePath: string
	private cache: Record<string, T> = {}

	constructor(fileName: string) {
		this.filePath = path.resolve(process.cwd(), fileName)
		this.load()
	}

	private async load() {
		try {
			const data = await fs.readFile(this.filePath, 'utf-8')
			this.cache = JSON.parse(data)
		} catch (error: any) {
			if (error.code !== 'ENOENT') {
				logger.error(`Failed to load session file: ${error.message}`)
			}
			// If file doesn't exist, start empty
			this.cache = {}
		}
	}

	private async save() {
		try {
			await fs.writeFile(this.filePath, JSON.stringify(this.cache, null, 2))
		} catch (error: any) {
			logger.error(`Failed to save session file: ${error.message}`)
		}
	}

	async read(key: string): Promise<T | undefined> {
		return this.cache[key]
	}

	async write(key: string, value: T): Promise<void> {
		this.cache[key] = value
		await this.save()
	}

	async delete(key: string): Promise<void> {
		delete this.cache[key]
		await this.save()
	}
}
