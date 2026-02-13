require('dotenv').config()
const { spawn } = require('child_process')
const path = require('path')
const express = require('express')
const startGrainBot = require('./bot-2/bot')

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (req, res) => res.send('Multi-Bot Active 🚀'))
app.get('/health', (req, res) =>
	res.json({ status: 'ok', timestamp: new Date() }),
)

// Add specific bot status endpoints if reachable, for now just generic
app.get('/bot1/health', (req, res) => res.json({ status: 'running' }))
app.get('/bot2/health', (req, res) => res.json({ status: 'running' }))

app.listen(PORT, () => console.log(`🌍 Web Server running on port ${PORT}`))

console.log('🚀 Starting Multi-Bot System...')

// --- Bot 1: Personal Assistant (Legacy Runner) ---
console.log('🤖 Launching Bot 1 (Assistant)...')
const botPath = path.join(__dirname, 'bot-1')
// Use 'start' in production, 'dev' in development
const bot1Script = process.env.NODE_ENV === 'production' ? 'start' : 'dev'
const botProcess = spawn('npm', ['run', bot1Script], {
	cwd: botPath,
	stdio: 'inherit',
})

botProcess.on('error', err => {
	console.error('❌ Bot 1 failed to start:', err)
})

// --- Bot 2: Grain Business Bot (Integrated) ---
console.log('🌾 Launching Bot 2 (Grain Business)...')
startGrainBot({
	botToken: process.env.BOT_TOKEN_2,
	groqKey: process.env.GROQ_API_KEY_2,
	orderGroupId: process.env.FORUM_CHAT_ID_2,
}).catch(err => console.error('❌ Bot 2 Error:', err))

// --- Process Management ---
const cleanup = signal => {
	console.log(`\n🛑 Received ${signal}, stopping bots...`)

	// Kill Bot 1
	if (!botProcess.killed) {
		botProcess.kill(signal)
	}

	// Bot 2 is in-process, so it will die with this process

	process.exit(0)
}

process.on('SIGINT', () => cleanup('SIGINT'))
process.on('SIGTERM', () => cleanup('SIGTERM'))

botProcess.on('exit', (code, signal) => {
	if (code) console.log(`Warning: Bot 1 exited with code ${code}`)
	if (signal) console.log(`Warning: Bot 1 killed with signal ${signal}`)
	// Don't exit main process if one bot dies, unless you want total failure
})
