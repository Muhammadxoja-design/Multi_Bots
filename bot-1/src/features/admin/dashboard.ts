import { MyContext } from '@/core/context'
import { SettingsService } from '@/services/settings'
import { InlineKeyboard } from 'grammy'

export async function renderDashboard(ctx: MyContext) {
	// 1. Fetch current settings
	const settings = await SettingsService.getSettings()
	const isAway = settings.isAway
	const replyText = settings.autoReplyText
	const mood = settings.aiMood as 'serious' | 'friendly'
	const quietHours = settings.quietHoursEnabled
		? `🌙 (${settings.quietFrom}-${settings.quietTo})`
		: '☀️ O‘chiq'

	// 2. Build Message
	const text =
		`🔐 <b>Admin Boshqaruv Paneli</b>\n\n` +
		`${isAway ? '🟢 <b>Tizim: FAOL (Away)</b>' : '🔴 <b>Tizim: UXLAMOQDA</b>'}\n` +
		`🎭 <b>Mood:</b> ${mood === 'serious' ? 'Jiddiy' : 'Samimiy'}\n` +
		`🌙 <b>Tungi rejim:</b> ${quietHours}\n\n` +
		`📝 <b>Javob Matni:</b>\n<i>"${replyText}"</i>`

	// 3. Build Keyboard
	const keyboard = new InlineKeyboard()
		.text(isAway ? "🔴 Away O'chirish" : '🟢 Away Yoqish', 'admin:toggle_away')
		.row()
		.text('🌙 Tungi Rejim', 'admin:toggle_quiet')
		.text(
			mood === 'serious' ? '🎭 Samimiy Mode' : '👔 Jiddiy Mode',
			'admin:toggle_mood',
		)
		.row()
		.text("📝 Matnni O'zgartirish", 'admin:edit_text')
		.row()
		.text('🔄 Yangilash', 'admin:refresh')

	return { text, keyboard }
}
