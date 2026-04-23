const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// In production on Railway, set DB_PATH to a volume path e.g. /data/reconcile.db
const dbPath = process.env.DB_PATH || path.join(__dirname, 'reconcile.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    square_location_id TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS manager_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_id TEXT NOT NULL,
    date TEXT NOT NULL,
    cash_sales REAL DEFAULT 0,
    card_sales REAL DEFAULT 0,
    total_sales REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    image_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES venues(id)
  );

  CREATE TABLE IF NOT EXISTS square_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_id TEXT NOT NULL,
    date TEXT NOT NULL,
    cash REAL DEFAULT 0,
    card REAL DEFAULT 0,
    total REAL DEFAULT 0,
    refunds REAL DEFAULT 0,
    discounts REAL DEFAULT 0,
    comps REAL DEFAULT 0,
    gift_cards REAL DEFAULT 0,
    raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES venues(id)
  );

  CREATE TABLE IF NOT EXISTS square_refund_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_id TEXT NOT NULL,
    date TEXT NOT NULL,
    refund_id TEXT,
    payment_id TEXT,
    receipt_number TEXT DEFAULT '',
    amount REAL DEFAULT 0,
    reason TEXT DEFAULT '',
    status TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS square_discount_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_id TEXT NOT NULL,
    date TEXT NOT NULL,
    order_id TEXT DEFAULT '',
    payment_id TEXT DEFAULT '',
    receipt_number TEXT DEFAULT '',
    discount_name TEXT DEFAULT '',
    discount_type TEXT DEFAULT '',
    amount REAL DEFAULT 0,
    percentage TEXT DEFAULT '',
    scope TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS square_comp_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_id TEXT NOT NULL,
    date TEXT NOT NULL,
    order_id TEXT DEFAULT '',
    payment_id TEXT DEFAULT '',
    receipt_number TEXT DEFAULT '',
    item_name TEXT DEFAULT '',
    variation_name TEXT DEFAULT '',
    quantity TEXT DEFAULT '1',
    amount REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS square_gift_card_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_id TEXT NOT NULL,
    date TEXT NOT NULL,
    activity_type TEXT DEFAULT '',
    payment_id TEXT DEFAULT '',
    receipt_number TEXT DEFAULT '',
    amount REAL DEFAULT 0,
    gift_card_last4 TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Schema migrations (safe – silently ignores duplicate column errors) ───────
const migrations = [
  `ALTER TABLE manager_reports ADD COLUMN deposits_used REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN gift_cards_redeemed REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN notes_50 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN notes_20 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN notes_10 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN notes_5 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN coins_200 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN coins_100 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN coins_50 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN coins_20 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN coins_10 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN coins_2 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN coins_1 INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN physical_cash REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN petty_cash REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN petty_cash_notes TEXT DEFAULT ''`,
  `ALTER TABLE manager_reports ADD COLUMN staff_discount REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN staff_discount_notes TEXT DEFAULT ''`,
  `ALTER TABLE manager_reports ADD COLUMN fnf_discount REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN fnf_discount_notes TEXT DEFAULT ''`,
  `ALTER TABLE manager_reports ADD COLUMN complimentary REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN complimentary_notes TEXT DEFAULT ''`,
  `ALTER TABLE manager_reports ADD COLUMN card_tips REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN cash_tips REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN shift_notes TEXT DEFAULT ''`,
  `ALTER TABLE manager_reports ADD COLUMN grand_total REAL DEFAULT 0`,
  `ALTER TABLE square_data ADD COLUMN recon_notes TEXT DEFAULT ''`,
  `ALTER TABLE square_data ADD COLUMN locked INTEGER DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN manager_refunds REAL DEFAULT 0`,
  `ALTER TABLE manager_reports ADD COLUMN manager_refund_notes TEXT DEFAULT ''`,
];
for (const sql of migrations) { try { db.exec(sql); } catch {} }

const venueCount = db.prepare('SELECT COUNT(*) as count FROM venues').get();
if (venueCount.count === 0) {
  const insert = db.prepare('INSERT INTO venues (id, name, square_location_id) VALUES (?, ?, ?)');
  insert.run('venue-rik', 'Rasoi Indian Kitchen', '');
  insert.run('venue-rw', 'Rasoi Waterfront', '');
}

module.exports = db;
