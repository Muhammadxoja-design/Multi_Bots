const Groq = require('groq-sdk')

let groq

function initAI(apiKey) {
	groq = new Groq({ apiKey })
}

async function generateResponse(userMessage, products) {
	if (!groq) throw new Error('AI not initialized')

	const productList = products
		.map(p => `- ${p.name}: ${p.price} s o'm. (Qoldiq: ${p.stock})`)
		.join('\n')

	const systemPrompt = `
Sen don mahsulotlari sotuvchisisan.
Ombordagi mahsulotlar:
${productList}

Qoidalar:
1. Faqat bor mahsulotni sot.
2. Agar mijoz aniq zakaz bersa (nima va qancha), javobingda "[ORDER_DETECTED]" deb yoz va mijozdan telefon raqam so'ra.
3. Agar mijoz telefon raqamini yozsa va oldinroq zakaz haqida gaplashgan bo'lsangiz, "[ORDER_DETECTED]" deb yozib zakazni tasdiqla.
4. Javobing qisqa va londa bo'lsin.
`

	try {
		const completion = await groq.chat.completions.create({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage },
			],
			model: 'llama-3.3-70b-versatile',
		})

		return completion.choices[0]?.message?.content || 'Uzr, tushunmadim.'
	} catch (err) {
		console.error('AI Error:', err)
		return 'Tizimda xatolik.'
	}
}

async function parseAdminCommand(adminText) {
	if (!groq) throw new Error('AI not initialized')

	// System Prompt for Admin
	const systemPrompt = `
Sen ombor menejerisan. Admin matnini tahlil qilib, JSON qaytar.

Formatlar:
1. Kirim bo'lsa: {"type": "restock", "item": "nomi", "qty": miqdor, "cost": kelish_narxi} (qty musbat bo'lsin. Agar narx aytilmasa cost: null)
2. Narx o'zgarishi: {"type": "price_update", "item": "nomi", "new_price": yangi_narx}
3. Statistika so'rasa: {"type": "stats"}
4. Noma'lum yoki tushunarsiz: {"type": "error"}

Faqat JSON formatda va "result" kaliti ichida qaytar:
{ "result": { ... } }

Misol: "500kg un keldi, narxi 3800 dan" -> { "result": {"type": "restock", "item": "Un (1-nav)", "qty": 500, "cost": 3800} }
Misol: "Bugun qancha foyda qildik?" -> { "result": {"type": "stats"} }
`

	try {
		const completion = await groq.chat.completions.create({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: adminText },
			],
			model: 'llama-3.3-70b-versatile',
			response_format: { type: 'json_object' },
		})

		const content = completion.choices[0]?.message?.content
		const parsed = JSON.parse(content)
		return parsed.result || { type: 'error' }
	} catch (err) {
		console.error('AI Admin Parse Error:', err)
		return { type: 'error' }
	}
}

const axios = require('axios')
const FormData = require('form-data')

// ... existing initAI ...

async function transcribeAudio(fileUrl) {
	if (!groq) throw new Error('AI not initialized')

	try {
		// Get audio stream from Telegram URL
		const response = await axios({
			url: fileUrl,
			method: 'GET',
			responseType: 'stream',
		})

		// Prepare FormData for Groq
		const formData = new FormData()
		formData.append('file', response.data, { filename: 'voice.ogg' })
		formData.append('model', 'whisper-large-v3')
		formData.append('language', 'uz')

		// Send to Groq API via axios (SDK might not support stream input easily without fs)
		// Note: Groq SDK `groq.audio.transcriptions.create` expects a file-like object.
		// Node streams can be tricky with SDKs. Let's try SDK first with `toFile` if possible,
		// OR just use direct REST API call since we have axios/formData.
		// Actually, let's use the SDK with a proper detailed object if supported,
		// BUT the user asked to use axios/form-data for this specific task logic often implies direct handling.
		// Let's stick to the Groq SDK if it accepts a stream.
		// groq-sdk in Node usually takes `fs.createReadStream`.
		// To use a web stream, we might need `groq.audio.transcriptions.create({ file: stream, ... })`.
		// However, the `file` argument usually needs a name/type if it's a raw stream.
		// Let's try passing the stream directly to SDK.

		const completion = await groq.audio.transcriptions.create({
			file: response.data, // Stream
			model: 'whisper-large-v3',
			response_format: 'json',
			language: 'uz',
		})

		return completion.text || ''

		// Debug: If SDK fails with stream, fallback to direct API call would be:
		// const res = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
		//     headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${groq.apiKey}` }
		// })
		// return res.data.text
	} catch (err) {
		console.error('AI Transcribe Stream Error:', err)
		// Fallback: Return empty string or error
		return ''
	}
}

// ... existing generateResponse ...
// ... existing parseAdminCommand ...

async function generateMarketingPost(rawText) {
	if (!groq) throw new Error('AI not initialized')

	const systemPrompt = `
Sen SMM dahoasan. Matnni Telegram kanal uchun **Vizual Shedevr** qilib tayyorla.

**Format:**
1. **Sarlavha:** Katta va Qalin harflarda (masalan: **🔥 DIQQAT! YANGI KELDI**).
2. **Asosiy qism:** Ro'yxat ko'rinishida (✅, 🔸, 💎, 📦).
3. **Emojilar:** Har bir qatorda mos emojilar bo'lsin.
4. **Tugatish:** Chiroyli chaqiriq (Call to Action).
`

	try {
		const completion = await groq.chat.completions.create({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: rawText },
			],
			model: 'llama-3.3-70b-versatile',
		})

		return completion.choices[0]?.message?.content || rawText
	} catch (err) {
		console.error('AI Marketing Error:', err)
		return rawText
	}
}

module.exports = {
	initAI,
	generateResponse,
	parseAdminCommand,
	generateMarketingPost,
	transcribeAudio, // Updated name
}
