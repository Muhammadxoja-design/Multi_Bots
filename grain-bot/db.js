const Database = require('better-sqlite3')
const path = require('path')

const dbPath = path.join(__dirname, 'grain.db')
const db = new Database(dbPath)

function initDb() {
	// 1. Products Table
	db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price INTEGER NOT NULL,
            stock INTEGER NOT NULL,
            description TEXT,
            cost_price INTEGER DEFAULT 0
        );
    `)

	// 2. Sales Table
	db.exec(`
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            total_price INTEGER NOT NULL,
            profit INTEGER NOT NULL,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `)

	// 3. Migration: Check if cost_price exists in products (for existing DBs)
	try {
		const tableInfo = db.prepare('PRAGMA table_info(products)').all()
		const hasCostPrice = tableInfo.some(col => col.name === 'cost_price')
		if (!hasCostPrice) {
			console.log('🔄 Migrating DB: Adding cost_price column...')
			db.prepare(
				'ALTER TABLE products ADD COLUMN cost_price INTEGER DEFAULT 0',
			).run()
		}
	} catch (err) {
		console.error('Migration Error:', err)
	}

	// Seed Data
	const stmt = db.prepare('SELECT count(*) as count FROM products')
	const row = stmt.get()

	if (row.count === 0) {
		console.log('🌱 Seeding database...')
		const insert = db.prepare(
			'INSERT INTO products (name, price, stock, description, cost_price) VALUES (?, ?, ?, ?, ?)',
		)

		insert.run("Bug'doy", 3500, 5000, "Oliy sifatli bug'doy", 3000)
		insert.run('Un (1-nav)', 4200, 200, '50kg qopda', 3800)
		insert.run('Arpa', 3000, 0, 'Chorva uchun arpa', 2500)
	}
}

function getAllProducts() {
	return db.prepare('SELECT * FROM products').all()
}

function getProductByName(name) {
	// Fuzzy search
	return db.prepare('SELECT * FROM products WHERE name LIKE ?').get(`%${name}%`)
}

// Admin: Update Stock (Restock or Manual Correction)
function updateStock(productName, quantity, costPrice = null) {
	const product = getProductByName(productName)
	if (!product) return { success: false, message: 'Mahsulot topilmadi' }

	let newStock = product.stock + quantity

	// If restock (positive qty) and costPrice provided, update cost_price (weighted average logic could be complex, for now simple update or keep old if not provided)
	// Requirement is simple: "Kirim bo'lsa: cost: kelish_narxi". Let's update it to newest cost price or just set it.
	// For simplicity: Update cost_price if provided.

	let stmt
	if (costPrice && quantity > 0) {
		stmt = db.prepare(
			'UPDATE products SET stock = ?, cost_price = ? WHERE id = ?',
		)
		stmt.run(newStock, costPrice, product.id)
	} else {
		stmt = db.prepare('UPDATE products SET stock = ? WHERE id = ?')
		stmt.run(newStock, product.id)
	}

	return {
		success: true,
		name: product.name,
		added: quantity,
		newStock,
		newCost: costPrice || product.cost_price,
	}
}

// Logic: Log Sale
function logSale(productName, quantity, soldPrice) {
	const product = getProductByName(productName)
	if (!product) return false

	// Profit = (SoldPrice - CostPrice) * Quantity
	// Usually soldPrice is Unit Price or Total?
	// Let's assume soldPrice is TOTAL price for the batch.
	// Wait, usually price is per unit. "Narxi 3000 dan".
	// Let's assume Sales Log needs Total Price.
	// Profit = TotalPrice - (CostPrice * Quantity)

	const totalPrice = quantity * soldPrice // soldPrice here is UNIT price
	const totalCost = quantity * product.cost_price
	const profit = totalPrice - totalCost

	db.prepare(
		'INSERT INTO sales (product_name, quantity, total_price, profit) VALUES (?, ?, ?, ?)',
	).run(product.name, quantity, totalPrice, profit)

	// Decrement stock
	updateStock(productName, -quantity)

	return true
}

// Stats
function getProfitStats() {
	// Today
	const today = db
		.prepare(
			`
        SELECT SUM(profit) as profit, SUM(total_price) as revenue 
        FROM sales 
        WHERE date >= date('now', 'start of day', 'localtime')
    `,
		)
		.get()

	// Total
	const total = db
		.prepare(
			`
        SELECT SUM(profit) as profit, SUM(total_price) as revenue 
        FROM sales
    `,
		)
		.get()

	return {
		today: today || { profit: 0, revenue: 0 },
		total: total || { profit: 0, revenue: 0 },
	}
}

module.exports = {
	initDb,
	getAllProducts,
	getProductByName,
	updateStock,
	logSale,
	getProfitStats,
}
