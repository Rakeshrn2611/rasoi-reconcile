require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const XLSX    = require('xlsx');

const db                   = require('./db');
const { fetchSquareDay }   = require('./square');
const { reconcile }        = require('./reconcile');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve built React frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(distPath));
  // All non-API routes serve index.html (SPA routing)
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function storeSquareDetails(venue_id, date, data) {
  db.prepare('DELETE FROM square_refund_details   WHERE venue_id=? AND date=?').run(venue_id, date);
  db.prepare('DELETE FROM square_discount_details WHERE venue_id=? AND date=?').run(venue_id, date);
  db.prepare('DELETE FROM square_comp_details     WHERE venue_id=? AND date=?').run(venue_id, date);
  db.prepare('DELETE FROM square_gift_card_details WHERE venue_id=? AND date=?').run(venue_id, date);

  const insRefund = db.prepare(`INSERT INTO square_refund_details
    (venue_id,date,refund_id,payment_id,receipt_number,amount,reason,status) VALUES(?,?,?,?,?,?,?,?)`);
  for (const r of data.refundDetails)
    insRefund.run(venue_id, date, r.refund_id, r.payment_id, r.receipt_number, r.amount, r.reason, r.status);

  const insDiscount = db.prepare(`INSERT INTO square_discount_details
    (venue_id,date,order_id,payment_id,receipt_number,discount_name,discount_type,amount,percentage,scope) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  for (const d of data.discountDetails)
    insDiscount.run(venue_id, date, d.order_id, d.payment_id, d.receipt_number, d.discount_name, d.discount_type, d.amount, d.percentage, d.scope);

  const insComp = db.prepare(`INSERT INTO square_comp_details
    (venue_id,date,order_id,payment_id,receipt_number,item_name,variation_name,quantity,amount) VALUES(?,?,?,?,?,?,?,?,?)`);
  for (const c of data.compDetails)
    insComp.run(venue_id, date, c.order_id, c.payment_id, c.receipt_number, c.item_name, c.variation_name, c.quantity, c.amount);

  const insGC = db.prepare(`INSERT INTO square_gift_card_details
    (venue_id,date,activity_type,payment_id,receipt_number,amount,gift_card_last4) VALUES(?,?,?,?,?,?,?)`);
  for (const g of data.giftCardDetails)
    insGC.run(venue_id, date, g.activity_type, g.payment_id, g.receipt_number, g.amount, g.gift_card_last4);
}

function getSquareDetails(venue_id, date) {
  return {
    refunds:    db.prepare('SELECT * FROM square_refund_details   WHERE venue_id=? AND date=? ORDER BY amount DESC').all(venue_id, date),
    discounts:  db.prepare('SELECT * FROM square_discount_details WHERE venue_id=? AND date=? ORDER BY amount DESC').all(venue_id, date),
    comps:      db.prepare('SELECT * FROM square_comp_details     WHERE venue_id=? AND date=? ORDER BY amount DESC').all(venue_id, date),
    gift_cards: db.prepare('SELECT * FROM square_gift_card_details WHERE venue_id=? AND date=? ORDER BY amount DESC').all(venue_id, date),
  };
}

// ── Venues ────────────────────────────────────────────────────────────────────

app.get('/api/venues', (req, res) => {
  res.json(db.prepare('SELECT * FROM venues ORDER BY name').all());
});

app.post('/api/venues', (req, res) => {
  const { name, square_location_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = `venue-${Date.now()}`;
  db.prepare('INSERT INTO venues (id,name,square_location_id) VALUES (?,?,?)').run(id, name, square_location_id || '');
  res.json({ id, name, square_location_id });
});

app.put('/api/venues/:id', (req, res) => {
  const { name, square_location_id } = req.body;
  db.prepare('UPDATE venues SET name=?,square_location_id=? WHERE id=?').run(name, square_location_id || '', req.params.id);
  res.json({ ok: true });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

app.get('/api/dashboard/stats', (req, res) => {
  const now = new Date();
  const { venue_id, from, to } = req.query;

  const f = from || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const t = to   || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;

  const vc   = venue_id ? ' AND venue_id=?'    : '';
  const mrvc = venue_id ? ' AND mr.venue_id=?' : '';
  const vp   = venue_id ? [venue_id] : [];

  const totals = db.prepare(`
    SELECT COALESCE(SUM(cash_sales),0)         as total_cash,
           COALESCE(SUM(card_sales),0)         as total_card,
           COALESCE(SUM(total_sales),0)        as total,
           COALESCE(SUM(deposits_used),0)      as total_deposits,
           COALESCE(SUM(gift_cards_redeemed),0) as total_gifts,
           COALESCE(SUM(petty_cash),0)         as total_petty
    FROM manager_reports WHERE date>=? AND date<=?${vc}`).get(f, t, ...vp);

  const reconciled = db.prepare(`
    SELECT COUNT(*) as count FROM manager_reports mr
    JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE mr.date>=? AND mr.date<=?${mrvc}`).get(f, t, ...vp);

  const pending = db.prepare(`
    SELECT COUNT(*) as count FROM manager_reports mr
    LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE mr.date>=? AND mr.date<=?${mrvc} AND sd.id IS NULL`).get(f, t, ...vp);

  const variance = db.prepare(`
    SELECT COALESCE(SUM(ABS(mr.cash_sales-sd.cash)),0) as total_variance
    FROM manager_reports mr
    JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE mr.date>=? AND mr.date<=?${mrvc}`).get(f, t, ...vp);

  const recent = db.prepare(`
    SELECT mr.*, v.name as venue_name,
      CASE WHEN sd.id IS NOT NULL THEN 1 ELSE 0 END as has_square
    FROM manager_reports mr
    JOIN venues v ON v.id=mr.venue_id
    LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    ${venue_id ? 'WHERE mr.venue_id=?' : ''}
    ORDER BY mr.created_at DESC LIMIT 10
  `).all(...(venue_id ? [venue_id] : []));

  // Monthly detail aggregates
  const refundTotal = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_refund_details WHERE date>=? AND date<=?${vc}`).get(f, t, ...vp);
  const compTotal   = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_comp_details WHERE date>=? AND date<=?${vc}`).get(f, t, ...vp);
  const discTotal   = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_discount_details WHERE date>=? AND date<=?${vc}`).get(f, t, ...vp);
  const gcTotal     = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_gift_card_details WHERE activity_type='REDEEM' AND date>=? AND date<=?${vc}`).get(f, t, ...vp);

  // Discount type breakdown for the period
  const discByType = db.prepare(`
    SELECT discount_name, discount_type, scope,
           COUNT(*) as occurrences, COALESCE(SUM(amount),0) as total_amount
    FROM square_discount_details WHERE date>=? AND date<=?${vc}
    GROUP BY discount_name, discount_type, scope
    ORDER BY total_amount DESC LIMIT 10`).all(f, t, ...vp);

  // Recent refunds (last 10)
  const recentRefunds = db.prepare(`
    SELECT rd.*, v.name as venue_name FROM square_refund_details rd
    JOIN venues v ON v.id=rd.venue_id
    WHERE rd.date>=? AND rd.date<=?${vc.replace('venue_id', 'rd.venue_id')} ORDER BY rd.created_at DESC LIMIT 10`).all(f, t, ...vp);

  // Recent comps (last 10)
  const recentComps = db.prepare(`
    SELECT cd.*, v.name as venue_name FROM square_comp_details cd
    JOIN venues v ON v.id=cd.venue_id
    WHERE cd.date>=? AND cd.date<=?${vc.replace('venue_id', 'cd.venue_id')} ORDER BY cd.created_at DESC LIMIT 10`).all(f, t, ...vp);

  // Recent gift card redemptions (last 10)
  const recentGiftCards = db.prepare(`
    SELECT gd.*, v.name as venue_name FROM square_gift_card_details gd
    JOIN venues v ON v.id=gd.venue_id
    WHERE gd.date>=? AND gd.date<=?${vc.replace('venue_id', 'gd.venue_id')} AND gd.activity_type='REDEEM'
    ORDER BY gd.created_at DESC LIMIT 10`).all(f, t, ...vp);

  res.json({
    total_cash:     totals.total_cash,
    total_card:     totals.total_card,
    total_sales:    totals.total,
    total_deposits: totals.total_deposits,
    total_gifts:    totals.total_gifts,
    total_petty:    totals.total_petty,
    reconciled:    reconciled.count,
    pending:       pending.count,
    cash_variance: variance.total_variance,
    recent,
    monthly: {
      refunds:    { total: refundTotal.total,  count: refundTotal.count },
      comps:      { total: compTotal.total,    count: compTotal.count },
      discounts:  { total: discTotal.total,    count: discTotal.count },
      gift_cards: { total: gcTotal.total,      count: gcTotal.count },
    },
    detail: {
      discByType,
      recentRefunds,
      recentComps,
      recentGiftCards,
    },
  });
});

// ── Manager Reports ───────────────────────────────────────────────────────────

app.get('/api/reports', (req, res) => {
  const { venue_id, date, from, to } = req.query;
  let q = `SELECT mr.*, v.name as venue_name FROM manager_reports mr JOIN venues v ON v.id=mr.venue_id WHERE 1=1`;
  const p = [];
  if (venue_id) { q += ' AND mr.venue_id=?'; p.push(venue_id); }
  if (date)     { q += ' AND mr.date=?';      p.push(date); }
  if (from)     { q += ' AND mr.date>=?';     p.push(from); }
  if (to)       { q += ' AND mr.date<=?';     p.push(to); }
  q += ' ORDER BY mr.date DESC';
  res.json(db.prepare(q).all(...p));
});

app.post('/api/reports', async (req, res) => {
  try {
    const b = req.body;
    if (!b.venue_id || !b.date) return res.status(400).json({ error: 'venue_id and date are required' });
    const n = v => parseFloat(v) || 0;
    const t = v => (v || '').toString().trim();

    const notes_50  = n(b.notes_50);  const notes_20  = n(b.notes_20);
    const notes_10  = n(b.notes_10);  const notes_5   = n(b.notes_5);
    const coins_200 = n(b.coins_200); const coins_100 = n(b.coins_100);
    const coins_50  = n(b.coins_50);  const coins_20  = n(b.coins_20);
    const coins_10  = n(b.coins_10);  const coins_2   = n(b.coins_2);
    const coins_1   = n(b.coins_1);

    const physical_cash =
      notes_50 * 50 + notes_20 * 20 + notes_10 * 10 + notes_5 * 5 +
      coins_200 * 2 + coins_100 * 1 + coins_50 * 0.5 + coins_20 * 0.2 +
      coins_10 * 0.1 + coins_2 * 0.02 + coins_1 * 0.01;

    const cash_sales          = n(b.cash_sales);
    const card_sales          = n(b.card_sales);
    const deposits_used       = n(b.deposits_used);
    const gift_cards_redeemed = n(b.gift_cards_redeemed);
    const petty_cash          = n(b.petty_cash);

    const grand_total = cash_sales + card_sales + deposits_used + gift_cards_redeemed + petty_cash;
    const total_sales = cash_sales + card_sales;

    const result = db.prepare(`
      INSERT INTO manager_reports
        (venue_id, date, cash_sales, card_sales, total_sales, grand_total, notes, shift_notes,
         deposits_used, gift_cards_redeemed,
         notes_50, notes_20, notes_10, notes_5,
         coins_200, coins_100, coins_50, coins_20, coins_10, coins_2, coins_1,
         physical_cash, petty_cash, petty_cash_notes,
         staff_discount, staff_discount_notes,
         fnf_discount, fnf_discount_notes,
         complimentary, complimentary_notes,
         card_tips, cash_tips)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      b.venue_id, b.date, cash_sales, card_sales, total_sales, grand_total,
      t(b.notes), t(b.shift_notes),
      deposits_used, gift_cards_redeemed,
      notes_50, notes_20, notes_10, notes_5,
      coins_200, coins_100, coins_50, coins_20, coins_10, coins_2, coins_1,
      physical_cash, petty_cash, t(b.petty_cash_notes),
      n(b.staff_discount), t(b.staff_discount_notes),
      n(b.fnf_discount), t(b.fnf_discount_notes),
      n(b.complimentary), t(b.complimentary_notes),
      n(b.card_tips), n(b.cash_tips)
    );
    return res.json({ id: result.lastInsertRowid, venue_id: b.venue_id, date: b.date,
      cash_sales, card_sales, total_sales, grand_total, physical_cash, petty_cash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reports/:id', (req, res) => {
  db.prepare('DELETE FROM manager_reports WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Square ────────────────────────────────────────────────────────────────────

app.post('/api/square/fetch', async (req, res) => {
  try {
    const { venue_id, date } = req.body;
    if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date are required' });

    const venue = db.prepare('SELECT * FROM venues WHERE id=?').get(venue_id);
    if (!venue?.square_location_id) return res.status(400).json({ error: 'No Square location ID set for this venue — add it in Settings' });

    const data = await fetchSquareDay(venue.square_location_id, date);
    const s    = data.summary;

    const existing = db.prepare('SELECT id FROM square_data WHERE venue_id=? AND date=?').get(venue_id, date);
    if (existing) {
      db.prepare(`UPDATE square_data SET cash=?,card=?,total=?,refunds=?,discounts=?,comps=?,gift_cards=?,raw_json=?
                  WHERE venue_id=? AND date=?`)
        .run(s.cash, s.card, s.total, s.refunds, s.discounts, s.comps, s.gift_cards, data.raw_json, venue_id, date);
    } else {
      db.prepare(`INSERT INTO square_data (venue_id,date,cash,card,total,refunds,discounts,comps,gift_cards,raw_json)
                  VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(venue_id, date, s.cash, s.card, s.total, s.refunds, s.discounts, s.comps, s.gift_cards, data.raw_json);
    }

    storeSquareDetails(venue_id, date, data);
    res.json({ summary: s, ...getSquareDetails(venue_id, date) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/square/details', (req, res) => {
  const { venue_id, date } = req.query;
  if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date are required' });
  res.json(getSquareDetails(venue_id, date));
});

// ── Reconciliation ────────────────────────────────────────────────────────────

app.get('/api/reconcile', (req, res) => {
  const { venue_id, date } = req.query;
  if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date are required' });

  const report = db.prepare('SELECT * FROM manager_reports WHERE venue_id=? AND date=? ORDER BY created_at DESC LIMIT 1').get(venue_id, date);
  const square = db.prepare('SELECT * FROM square_data WHERE venue_id=? AND date=?').get(venue_id, date);

  if (!report) return res.status(404).json({ error: 'No manager report found for this date' });
  if (!square) return res.status(404).json({ error: 'No Square data found — fetch it first' });

  res.json({
    report,
    square,
    reconciliation: reconcile(report, square),
    details:        getSquareDetails(venue_id, date),
  });
});

app.get('/api/reconcile/summary', (req, res) => {
  const { venue_id, from, to } = req.query;
  let q = `
    SELECT mr.date, mr.venue_id, v.name as venue_name,
           mr.cash_sales, mr.card_sales, mr.total_sales, mr.grand_total,
           mr.physical_cash, mr.petty_cash, mr.notes,
           mr.deposits_used, mr.gift_cards_redeemed, mr.card_tips, mr.cash_tips,
           mr.staff_discount, mr.fnf_discount, mr.complimentary,
           mr.petty_cash_notes, mr.shift_notes,
           sd.cash as sq_cash, sd.card as sq_card, sd.total as sq_total,
           sd.refunds, sd.discounts, sd.comps
    FROM manager_reports mr
    JOIN venues v ON v.id=mr.venue_id
    LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE 1=1`;
  const p = [];
  if (venue_id) { q += ' AND mr.venue_id=?'; p.push(venue_id); }
  if (from)     { q += ' AND mr.date>=?';    p.push(from); }
  if (to)       { q += ' AND mr.date<=?';    p.push(to); }
  q += ' ORDER BY mr.date DESC';

  res.json(db.prepare(q).all(...p).map(row => ({
    ...row,
    reconciliation: row.sq_total == null ? null : reconcile(
      { cash_sales: row.cash_sales, card_sales: row.card_sales, total_sales: row.total_sales,
        physical_cash: row.physical_cash, petty_cash: row.petty_cash, grand_total: row.grand_total },
      { cash: row.sq_cash, card: row.sq_card, total: row.sq_total, refunds: row.refunds, discounts: row.discounts, comps: row.comps }
    ),
  })));
});

// ── Detail list endpoints ─────────────────────────────────────────────────────

app.get('/api/refunds', (req, res) => {
  const { venue_id, from, to } = req.query;
  let q = `SELECT rd.*, v.name as venue_name FROM square_refund_details rd JOIN venues v ON v.id=rd.venue_id WHERE 1=1`;
  const p = [];
  if (venue_id) { q += ' AND rd.venue_id=?'; p.push(venue_id); }
  if (from)     { q += ' AND rd.date>=?';    p.push(from); }
  if (to)       { q += ' AND rd.date<=?';    p.push(to); }
  q += ' ORDER BY rd.date DESC, rd.amount DESC';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/comps', (req, res) => {
  const { venue_id, from, to } = req.query;
  let q = `SELECT cd.*, v.name as venue_name FROM square_comp_details cd JOIN venues v ON v.id=cd.venue_id WHERE 1=1`;
  const p = [];
  if (venue_id) { q += ' AND cd.venue_id=?'; p.push(venue_id); }
  if (from)     { q += ' AND cd.date>=?';    p.push(from); }
  if (to)       { q += ' AND cd.date<=?';    p.push(to); }
  q += ' ORDER BY cd.date DESC, cd.amount DESC';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/discounts', (req, res) => {
  const { venue_id, from, to } = req.query;
  let q = `SELECT dd.*, v.name as venue_name FROM square_discount_details dd JOIN venues v ON v.id=dd.venue_id WHERE 1=1`;
  const p = [];
  if (venue_id) { q += ' AND dd.venue_id=?'; p.push(venue_id); }
  if (from)     { q += ' AND dd.date>=?';    p.push(from); }
  if (to)       { q += ' AND dd.date<=?';    p.push(to); }
  q += ' ORDER BY dd.date DESC, dd.amount DESC';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/gift-cards', (req, res) => {
  const { venue_id, from, to } = req.query;
  let q = `SELECT gd.*, v.name as venue_name FROM square_gift_card_details gd JOIN venues v ON v.id=gd.venue_id WHERE 1=1`;
  const p = [];
  if (venue_id) { q += ' AND gd.venue_id=?'; p.push(venue_id); }
  if (from)     { q += ' AND gd.date>=?';    p.push(from); }
  if (to)       { q += ' AND gd.date<=?';    p.push(to); }
  q += ' ORDER BY gd.date DESC, gd.amount DESC';
  res.json(db.prepare(q).all(...p));
});

app.patch('/api/square/notes', (req, res) => {
  const { venue_id, date, recon_notes } = req.body;
  if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date required' });
  db.prepare('UPDATE square_data SET recon_notes=? WHERE venue_id=? AND date=?').run(recon_notes || '', venue_id, date);
  res.json({ ok: true });
});

// ── Excel Export ──────────────────────────────────────────────────────────────

app.get('/api/export/excel', (req, res) => {
  const { venue_id, from, to } = req.query;
  const now = new Date();
  const f = from || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const t = to   || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;

  let q = `
    SELECT mr.date, v.name as venue,
           mr.cash_sales, mr.petty_cash, mr.physical_cash,
           mr.card_sales, mr.deposits_used, mr.gift_cards_redeemed,
           mr.grand_total, mr.staff_discount, mr.fnf_discount, mr.complimentary,
           mr.card_tips, mr.cash_tips, mr.shift_notes,
           CASE WHEN sd.id IS NOT NULL THEN 'Reconciled' ELSE 'Pending' END as status,
           COALESCE(sd.recon_notes,'') as recon_notes
    FROM manager_reports mr
    JOIN venues v ON v.id = mr.venue_id
    LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE mr.date>=? AND mr.date<=?`;
  const p = [f, t];
  if (venue_id) { q += ' AND mr.venue_id=?'; p.push(venue_id); }
  q += ' ORDER BY mr.date DESC';

  const rows = db.prepare(q).all(...p);

  const wsData = [
    ['Date','Venue','Cash Sales','Petty Cash','Physical Cash','Card Sales','Deposits Used',
     'Gift Vouchers','Grand Total','Staff Discount','F&F Discount','Complimentary',
     'Card Tips','Cash Tips','Total Tips','Status','Shift Notes','Recon Notes'],
    ...rows.map(r => [
      r.date, r.venue,
      r.cash_sales||0, r.petty_cash||0, r.physical_cash||0,
      r.card_sales||0, r.deposits_used||0, r.gift_cards_redeemed||0,
      r.grand_total||0, r.staff_discount||0, r.fnf_discount||0, r.complimentary||0,
      r.card_tips||0, r.cash_tips||0, (r.card_tips||0)+(r.cash_tips||0),
      r.status, r.shift_notes||'', r.recon_notes||'',
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = `rasoi-sales-${f}-to-${t}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
});

app.listen(PORT, () => console.log(`Reconcile API running on http://localhost:${PORT}`));
