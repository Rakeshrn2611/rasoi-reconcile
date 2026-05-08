const { Pool, types } = require('pg');

// Return NUMERIC columns as JS floats instead of strings
types.setTypeParser(1700, val => val === null ? null : parseFloat(val));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      square_location_id TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS manager_reports (
      id SERIAL PRIMARY KEY,
      venue_id TEXT NOT NULL,
      date TEXT NOT NULL,
      cash_sales NUMERIC DEFAULT 0,
      card_sales NUMERIC DEFAULT 0,
      total_sales NUMERIC DEFAULT 0,
      grand_total NUMERIC DEFAULT 0,
      notes TEXT DEFAULT '',
      shift_notes TEXT DEFAULT '',
      image_path TEXT,
      deposits_used NUMERIC DEFAULT 0,
      gift_cards_redeemed NUMERIC DEFAULT 0,
      notes_50 INTEGER DEFAULT 0,
      notes_20 INTEGER DEFAULT 0,
      notes_10 INTEGER DEFAULT 0,
      notes_5 INTEGER DEFAULT 0,
      coins_200 INTEGER DEFAULT 0,
      coins_100 INTEGER DEFAULT 0,
      coins_50 INTEGER DEFAULT 0,
      coins_20 INTEGER DEFAULT 0,
      coins_10 INTEGER DEFAULT 0,
      coins_2 INTEGER DEFAULT 0,
      coins_1 INTEGER DEFAULT 0,
      physical_cash NUMERIC DEFAULT 0,
      petty_cash NUMERIC DEFAULT 0,
      petty_cash_notes TEXT DEFAULT '',
      staff_discount NUMERIC DEFAULT 0,
      staff_discount_notes TEXT DEFAULT '',
      fnf_discount NUMERIC DEFAULT 0,
      fnf_discount_notes TEXT DEFAULT '',
      complimentary NUMERIC DEFAULT 0,
      complimentary_notes TEXT DEFAULT '',
      card_tips NUMERIC DEFAULT 0,
      cash_tips NUMERIC DEFAULT 0,
      cash_tips_final NUMERIC,
      manager_refunds NUMERIC DEFAULT 0,
      manager_refund_notes TEXT DEFAULT '',
      actual_cash_held NUMERIC,
      actual_cash_notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS square_data (
      id SERIAL PRIMARY KEY,
      venue_id TEXT NOT NULL,
      date TEXT NOT NULL,
      cash NUMERIC DEFAULT 0,
      card NUMERIC DEFAULT 0,
      total NUMERIC DEFAULT 0,
      refunds NUMERIC DEFAULT 0,
      discounts NUMERIC DEFAULT 0,
      comps NUMERIC DEFAULT 0,
      gift_cards NUMERIC DEFAULT 0,
      raw_json TEXT,
      recon_notes TEXT DEFAULT '',
      locked INTEGER DEFAULT 0,
      card_tips NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS square_refund_details (
      id SERIAL PRIMARY KEY,
      venue_id TEXT NOT NULL,
      date TEXT NOT NULL,
      refund_id TEXT,
      payment_id TEXT,
      receipt_number TEXT DEFAULT '',
      amount NUMERIC DEFAULT 0,
      reason TEXT DEFAULT '',
      status TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS square_discount_details (
      id SERIAL PRIMARY KEY,
      venue_id TEXT NOT NULL,
      date TEXT NOT NULL,
      order_id TEXT DEFAULT '',
      payment_id TEXT DEFAULT '',
      receipt_number TEXT DEFAULT '',
      discount_name TEXT DEFAULT '',
      discount_type TEXT DEFAULT '',
      amount NUMERIC DEFAULT 0,
      percentage TEXT DEFAULT '',
      scope TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS square_comp_details (
      id SERIAL PRIMARY KEY,
      venue_id TEXT NOT NULL,
      date TEXT NOT NULL,
      order_id TEXT DEFAULT '',
      payment_id TEXT DEFAULT '',
      receipt_number TEXT DEFAULT '',
      item_name TEXT DEFAULT '',
      variation_name TEXT DEFAULT '',
      quantity TEXT DEFAULT '1',
      amount NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS square_gift_card_details (
      id SERIAL PRIMARY KEY,
      venue_id TEXT NOT NULL,
      date TEXT NOT NULL,
      activity_type TEXT DEFAULT '',
      payment_id TEXT DEFAULT '',
      receipt_number TEXT DEFAULT '',
      amount NUMERIC DEFAULT 0,
      gift_card_last4 TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS discrepancy_notes (
      id SERIAL PRIMARY KEY,
      venue_id TEXT NOT NULL,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT DEFAULT 'unresolved',
      notes TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(venue_id, date, category)
    );

    CREATE TABLE IF NOT EXISTS report_petty_cash_entries (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      amount NUMERIC DEFAULT 0,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS report_staff_discount_entries (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      amount NUMERIC DEFAULT 0,
      name TEXT DEFAULT '',
      reason TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS report_fnf_discount_entries (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      amount NUMERIC DEFAULT 0,
      name TEXT DEFAULT '',
      reason TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS report_comp_entries (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      amount NUMERIC DEFAULT 0,
      notes TEXT DEFAULT '',
      description TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_mr_date_venue ON manager_reports(date, venue_id);
    CREATE INDEX IF NOT EXISTS idx_sd_date_venue ON square_data(date, venue_id);
    CREATE INDEX IF NOT EXISTS idx_dn_date_venue ON discrepancy_notes(date, venue_id);
    CREATE INDEX IF NOT EXISTS idx_srd_date ON square_refund_details(date, venue_id);
    CREATE INDEX IF NOT EXISTS idx_sdd_date ON square_discount_details(date, venue_id);
    CREATE INDEX IF NOT EXISTS idx_rpce_report ON report_petty_cash_entries(report_id);
    CREATE INDEX IF NOT EXISTS idx_rsde_report ON report_staff_discount_entries(report_id);
    CREATE INDEX IF NOT EXISTS idx_rfde_report ON report_fnf_discount_entries(report_id);
    CREATE INDEX IF NOT EXISTS idx_rce_report  ON report_comp_entries(report_id);
  `);

  // Seed default venues
  await pool.query(`
    INSERT INTO venues (id, name, square_location_id) VALUES
      ('venue-rik', 'Rasoi Indian Kitchen', ''),
      ('venue-rw',  'Rasoi Waterfront', '')
    ON CONFLICT (id) DO NOTHING
  `);
}

module.exports = { pool, initDB };
