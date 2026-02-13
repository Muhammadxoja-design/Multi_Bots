const { GoogleGenerativeAI } = require('@google/generative-ai')

let model

function initAI(apiKey) {
	const genAI = new GoogleGenerativeAI(apiKey)
	model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
}

async function generateResponse(userMessage, products) {
	if (!model) {
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

Mijoz xabari: "${userMessage}"
`

	try {
		const result = await model.generateContent(systemPrompt)
		const response = await result.response
		return response.text()
	} catch (error) {
		console.error('AI Error:', error)
		return "Uzr, hozir tizimda nosozlik bor. Birozdan so'ng urinib ko'ring."
	}
}

module.exports = {
	initAI,
	generateResponse,
}
