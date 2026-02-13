const Database = require('better-sqlite3')
const path = require('path')

const dbPath = path.join(__dirname, 'grain.db')
const db = new Database(dbPath)

// Initialize database
function initDb() {
	db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price INTEGER NOT NULL,
            stock INTEGER NOT NULL,
            description TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `)

	// Check if data exists, if not seed it
	const stmt = db.prepare('SELECT count(*) as count FROM products')
	const row = stmt.get()

	if (row.count === 0) {
		console.log('🌱 Seeding database...')
		const insert = db.prepare(
			'INSERT INTO products (name, price, stock, description) VALUES (?, ?, ?, ?)',
		)

		insert.run("Bug'doy", 3000, 5000, "Oliy sifatli bug'doy")
		insert.run('Arpa', 2500, 0, 'Chorva uchun arpa') // Tugagan
		insert.run('Un (1-nav)', 4000, 200, '1-navli un, 50kg qopda') // 200 ta qop
	}
}

// Get all products
function getProducts() {
	return db.prepare('SELECT * FROM products').all()
}

// Get product by name (fuzzy search/simple check)
function getProductByName(name) {
	return db.prepare('SELECT * FROM products WHERE name LIKE ?').get(`%${name}%`)
}

// Settings Helpers
function getSetting(key) {
	const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
	return row ? row.value : null
}

function setSetting(key, value) {
	db.prepare(
		'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
	).run(key, value)
}

module.exports = {
	initDb,
	getProducts,
	getProductByName,
	getSetting,
	setSetting,
}
