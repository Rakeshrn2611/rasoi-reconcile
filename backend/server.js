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
  let q = `SELECT mr.*, v.name as venue_name,
    CASE WHEN sd.id IS NOT NULL THEN 1 ELSE 0 END as has_square,
    COALESCE(sd.locked, 0) as locked
    FROM manager_reports mr JOIN venues v ON v.id=mr.venue_id
    LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE 1=1`;
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
         card_tips, cash_tips,
         manager_refunds, manager_refund_notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
      n(b.card_tips), n(b.cash_tips),
      n(b.manager_refunds), t(b.manager_refund_notes)
    );
    return res.json({ id: result.lastInsertRowid, venue_id: b.venue_id, date: b.date,
      cash_sales, card_sales, total_sales, grand_total, physical_cash, petty_cash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/reports/:id', async (req, res) => {
  try {
    const b = req.body;
    const existing = db.prepare(`
      SELECT mr.id, COALESCE(sd.locked, 0) as locked
      FROM manager_reports mr
      LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
      WHERE mr.id=?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Report not found' });
    if (existing.locked) return res.status(400).json({ error: 'Cannot edit a locked report' });

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

    db.prepare(`
      UPDATE manager_reports SET
        venue_id=?, date=?, cash_sales=?, card_sales=?, total_sales=?, grand_total=?,
        notes=?, shift_notes=?, deposits_used=?, gift_cards_redeemed=?,
        notes_50=?, notes_20=?, notes_10=?, notes_5=?,
        coins_200=?, coins_100=?, coins_50=?, coins_20=?, coins_10=?, coins_2=?, coins_1=?,
        physical_cash=?, petty_cash=?, petty_cash_notes=?,
        staff_discount=?, staff_discount_notes=?,
        fnf_discount=?, fnf_discount_notes=?,
        complimentary=?, complimentary_notes=?,
        card_tips=?, cash_tips=?,
        manager_refunds=?, manager_refund_notes=?
      WHERE id=?
    `).run(
      b.venue_id || b.venue_id, b.date, cash_sales, card_sales, total_sales, grand_total,
      t(b.notes), t(b.shift_notes),
      deposits_used, gift_cards_redeemed,
      notes_50, notes_20, notes_10, notes_5,
      coins_200, coins_100, coins_50, coins_20, coins_10, coins_2, coins_1,
      physical_cash, petty_cash, t(b.petty_cash_notes),
      n(b.staff_discount), t(b.staff_discount_notes),
      n(b.fnf_discount), t(b.fnf_discount_notes),
      n(b.complimentary), t(b.complimentary_notes),
      n(b.card_tips), n(b.cash_tips),
      n(b.manager_refunds), t(b.manager_refund_notes),
      req.params.id
    );
    res.json({ ok: true, grand_total, physical_cash });
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
  const { venue_id, from, to, approved_only } = req.query;
  const joinType = approved_only === '1'
    ? 'INNER JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date AND sd.locked=1'
    : 'LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date';
  let q = `
    SELECT mr.id, mr.date, mr.venue_id, v.name as venue_name,
           mr.cash_sales, mr.card_sales, mr.total_sales, mr.grand_total,
           mr.physical_cash, mr.petty_cash, mr.notes,
           mr.deposits_used, mr.gift_cards_redeemed, mr.card_tips, mr.cash_tips, mr.cash_tips_final,
           mr.staff_discount, mr.fnf_discount, mr.complimentary,
           mr.petty_cash_notes, mr.shift_notes,
           mr.notes_50, mr.notes_20, mr.notes_10, mr.notes_5,
           mr.coins_200, mr.coins_100, mr.coins_50, mr.coins_20, mr.coins_10, mr.coins_2, mr.coins_1,
           mr.manager_refunds, mr.manager_refund_notes,
           mr.actual_cash_held, mr.actual_cash_notes,
           sd.cash as sq_cash, sd.card as sq_card, sd.total as sq_total,
           sd.refunds, sd.discounts, sd.comps, sd.recon_notes,
           COALESCE(sd.locked, 0) as sq_locked,
           COALESCE(sd.card_tips, 0) as sq_card_tips
    FROM manager_reports mr
    JOIN venues v ON v.id=mr.venue_id
    ${joinType}
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
  const { venue_id, from, to, approved_only } = req.query;
  const lockJoin = approved_only === '1' ? ' INNER JOIN square_data sd ON sd.venue_id=rd.venue_id AND sd.date=rd.date AND sd.locked=1' : '';
  let q = `SELECT rd.*, v.name as venue_name FROM square_refund_details rd JOIN venues v ON v.id=rd.venue_id${lockJoin} WHERE 1=1`;
  const p = [];
  if (venue_id) { q += ' AND rd.venue_id=?'; p.push(venue_id); }
  if (from)     { q += ' AND rd.date>=?';    p.push(from); }
  if (to)       { q += ' AND rd.date<=?';    p.push(to); }
  q += ' ORDER BY rd.date DESC, rd.amount DESC';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/comps', (req, res) => {
  const { venue_id, from, to, approved_only } = req.query;
  const lockJoin = approved_only === '1' ? ' INNER JOIN square_data sd ON sd.venue_id=cd.venue_id AND sd.date=cd.date AND sd.locked=1' : '';
  let q = `SELECT cd.*, v.name as venue_name FROM square_comp_details cd JOIN venues v ON v.id=cd.venue_id${lockJoin} WHERE 1=1`;
  const p = [];
  if (venue_id) { q += ' AND cd.venue_id=?'; p.push(venue_id); }
  if (from)     { q += ' AND cd.date>=?';    p.push(from); }
  if (to)       { q += ' AND cd.date<=?';    p.push(to); }
  q += ' ORDER BY cd.date DESC, cd.amount DESC';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/discounts', (req, res) => {
  const { venue_id, from, to, approved_only } = req.query;
  const lockJoin = approved_only === '1' ? ' INNER JOIN square_data sd ON sd.venue_id=dd.venue_id AND sd.date=dd.date AND sd.locked=1' : '';
  let q = `SELECT dd.*, v.name as venue_name FROM square_discount_details dd JOIN venues v ON v.id=dd.venue_id${lockJoin} WHERE 1=1`;
  const p = [];
  if (venue_id) { q += ' AND dd.venue_id=?'; p.push(venue_id); }
  if (from)     { q += ' AND dd.date>=?';    p.push(from); }
  if (to)       { q += ' AND dd.date<=?';    p.push(to); }
  q += ' ORDER BY dd.date DESC, dd.amount DESC';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/gift-cards', (req, res) => {
  const { venue_id, from, to, approved_only } = req.query;
  const lockJoin = approved_only === '1' ? ' INNER JOIN square_data sd ON sd.venue_id=gd.venue_id AND sd.date=gd.date AND sd.locked=1' : '';
  let q = `SELECT gd.*, v.name as venue_name FROM square_gift_card_details gd JOIN venues v ON v.id=gd.venue_id${lockJoin} WHERE 1=1`;
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

app.patch('/api/square/lock', (req, res) => {
  const { venue_id, date } = req.body;
  if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date required' });
  const sq = db.prepare('SELECT id FROM square_data WHERE venue_id=? AND date=?').get(venue_id, date);
  if (!sq) return res.status(400).json({ error: 'No Square data — fetch and reconcile before locking' });
  db.prepare('UPDATE square_data SET locked=1 WHERE venue_id=? AND date=?').run(venue_id, date);
  res.json({ ok: true });
});

app.patch('/api/square/unlock', (req, res) => {
  const { venue_id, date } = req.body;
  if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date required' });
  db.prepare('UPDATE square_data SET locked=0 WHERE venue_id=? AND date=?').run(venue_id, date);
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

// ── Actual Cash Held ──────────────────────────────────────────────────────────

app.patch('/api/reports/:id/actual-cash', (req, res) => {
  const { actual_cash_held, actual_cash_notes } = req.body;
  const val = actual_cash_held != null && actual_cash_held !== '' ? parseFloat(actual_cash_held) : null;
  db.prepare('UPDATE manager_reports SET actual_cash_held=?, actual_cash_notes=? WHERE id=?')
    .run(val, actual_cash_notes || '', req.params.id);
  res.json({ ok: true });
});

// ── Discrepancies ─────────────────────────────────────────────────────────────

app.get('/api/discrepancies', (req, res) => {
  const { venue_id, from, to, category, status } = req.query;
  const now = new Date();
  const f = from || `${now.getFullYear() - 1}-01-01`;
  const t = to   || now.toISOString().slice(0, 10);

  let q = `
    SELECT mr.id, mr.date, mr.venue_id, v.name as venue_name,
      mr.cash_sales, mr.card_sales, mr.grand_total,
      mr.actual_cash_held, mr.petty_cash, mr.manager_refunds,
      sd.cash as sq_cash, sd.card as sq_card, sd.total as sq_total,
      sd.refunds as sq_refunds
    FROM manager_reports mr
    JOIN venues v ON v.id=mr.venue_id
    LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE mr.date>=? AND mr.date<=?
      AND (sd.total IS NOT NULL OR mr.actual_cash_held IS NOT NULL)`;
  const p = [f, t];
  if (venue_id) { q += ' AND mr.venue_id=?'; p.push(venue_id); }
  q += ' ORDER BY mr.date DESC LIMIT 500';

  const rows = db.prepare(q).all(...p);

  // Load status overrides
  const statusMap = {};
  if (rows.length) {
    const sRows = db.prepare(`SELECT * FROM discrepancy_notes WHERE date>=? AND date<=?`).all(f, t);
    for (const s of sRows) statusMap[`${s.venue_id}:${s.date}:${s.category}`] = s;
  }

  const THRESHOLD = 0.01;
  const discrepancies = [];

  for (const row of rows) {
    const base = { date: row.date, venue_id: row.venue_id, venue_name: row.venue_name };
    const getStatus = (cat) => {
      const s = statusMap[`${row.venue_id}:${row.date}:${cat}`];
      return { status: s?.status || 'unresolved', notes: s?.notes || '' };
    };
    const push = (cat, expected, actual) => {
      const diff = actual - expected;
      if (Math.abs(diff) <= THRESHOLD) return;
      const st = getStatus(cat);
      discrepancies.push({
        ...base, category: cat,
        expected, actual, difference: diff, abs_difference: Math.abs(diff),
        severity: Math.abs(diff) > 5 ? 'major' : 'minor',
        status: st.status, notes: st.notes,
      });
    };

    // 1. Cash: Manager vs Actual Cash Held
    if (row.actual_cash_held != null)
      push('Cash — Mgr vs Actual', row.actual_cash_held, row.cash_sales);

    // 2. Total Cash (actual/mgr + petty) vs Square Cash
    if (row.sq_cash != null) {
      const adminCash = (row.actual_cash_held ?? row.cash_sales) + (row.petty_cash || 0);
      push('Cash vs Square', row.sq_cash, adminCash);
    }

    // 3. Card vs Square
    if (row.sq_card != null)
      push('Card vs Square', row.sq_card, row.card_sales);

    // 4. Total vs Square
    if (row.sq_total != null)
      push('Total vs Square', row.sq_total, row.grand_total);

    // 5. Square Refunds flagged for review
    if ((row.sq_refunds || 0) > 0) {
      const st = getStatus('Refunds');
      discrepancies.push({
        ...base, category: 'Refunds',
        expected: 0, actual: row.sq_refunds, difference: row.sq_refunds,
        abs_difference: row.sq_refunds,
        severity: row.sq_refunds > 20 ? 'major' : 'minor',
        status: st.status, notes: st.notes,
      });
    }
  }

  let result = discrepancies;
  if (category && category !== 'all') result = result.filter(d => d.category === category);
  if (status   && status !== 'all')   result = result.filter(d => d.status === status);
  res.json(result);
});

// ── Tips ──────────────────────────────────────────────────────────────────────

app.get('/api/tips', (req, res) => {
  const { venue_id, from, to } = req.query;
  const now = new Date();
  const f = from || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const t = to   || now.toISOString().slice(0, 10);
  let q = `
    SELECT mr.id, mr.date, mr.venue_id, v.name as venue_name,
           mr.card_tips, mr.cash_tips, mr.cash_tips_final,
           COALESCE(sd.card_tips, 0) as sq_card_tips
    FROM manager_reports mr
    JOIN venues v ON v.id=mr.venue_id
    LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE mr.date>=? AND mr.date<=?`;
  const p = [f, t];
  if (venue_id) { q += ' AND mr.venue_id=?'; p.push(venue_id); }
  q += ' ORDER BY mr.date DESC LIMIT 500';
  res.json(db.prepare(q).all(...p));
});

app.patch('/api/reports/:id/cash-tips-final', (req, res) => {
  const { cash_tips_final } = req.body;
  const val = cash_tips_final != null && cash_tips_final !== '' ? parseFloat(cash_tips_final) : null;
  db.prepare('UPDATE manager_reports SET cash_tips_final=? WHERE id=?').run(val, req.params.id);
  res.json({ ok: true });
});

app.patch('/api/discrepancies/status', (req, res) => {
  const { venue_id, date, category, status, notes } = req.body;
  if (!venue_id || !date || !category) return res.status(400).json({ error: 'venue_id, date, category required' });
  try {
    db.prepare(`INSERT INTO discrepancy_notes (venue_id, date, category, status, notes, updated_at)
      VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(venue_id, date, category) DO UPDATE SET
        status=excluded.status, notes=excluded.notes, updated_at=excluded.updated_at`)
      .run(venue_id, date, category, status || 'unresolved', notes || '');
  } catch {
    // Fallback if ON CONFLICT not supported
    const ex = db.prepare('SELECT id FROM discrepancy_notes WHERE venue_id=? AND date=? AND category=?').get(venue_id, date, category);
    if (ex) db.prepare('UPDATE discrepancy_notes SET status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status||'unresolved',notes||'',ex.id);
    else db.prepare('INSERT INTO discrepancy_notes(venue_id,date,category,status,notes) VALUES(?,?,?,?,?)').run(venue_id,date,category,status||'unresolved',notes||'');
  }
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Reconcile API running on http://localhost:${PORT}`));
