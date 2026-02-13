const Groq = require('groq-sdk')

let groq

function initAI(apiKey) {
	groq = new Groq({ apiKey })
}

async function generateResponse(userMessage, products) {
	if (!groq) {
		throw new Error('AI not initialized. Call initAI first.')
	}

	// Format product data for the prompt
	const productContext = products
		.map(
			p =>
				`- ${p.name}: ${p.price} so'm. Qoldiq: ${p.stock > 0 ? p.stock + ' (mavjud)' : 'TUGAGAN'}. ${p.description || ''}`,
		)
		.join('\n')

	const systemPrompt = `
Sen don mahsulotlari ombori menejerisan. Isming "GrainBot".
Maqsading: Mijozlarga xushmuomala bo'lib, mahsulotlar haqida ma'lumot berish va sotish.

Ombordagi mahsulotlar narxi va qoldig'i:
${productContext}

Qoidalar:
1. Faqat yuqoridagi ro'yxatda bor narsani sot. Boshqa narsa so'rasa, "Bizda faqat don mahsulotlari bor" deb ayt.
2. Agar mahsulot qoldig'i 0 yoki "TUGAGAN" bo'lsa, mijozga "Hozirda tugagan" deb aniq ayt.
3. Javoblaring qisqa, lo'nda va tabiiy o'zbek tilida bo'lsin.
4. Agar mijoz aniq sotib olish niyatini bildirsa (masalan: "100kg bug'doy kerak", "Un olmoqchiman", "Zakaz bermoqchiman"), javobingda albatta "ZAKAZ" so'zini ishlat. (Masalan: "Tushunarli, ZAKAZ qabul qilindi. Aloqaga chiqamiz.").
5. Narxlarni so'rasa, ro'yxatdagidek aniq ayt.
`

	try {
		const completion = await groq.chat.completions.create({
			messages: [
				{
					role: 'system',
					content: systemPrompt,
				},
				{
					role: 'user',
					content: userMessage,
				},
			],
			model: 'llama-3.3-70b-versatile',
		})

		return completion.choices[0]?.message?.content || 'Uzr, javob ololmadim.'
	} catch (error) {
		console.error('Groq AI Error:', error)
		return "Uzr, hozir tizimda nosozlik bor. Birozdan so'ng urinib ko'ring."
	}
}

module.exports = {
	initAI,
	generateResponse,
}
