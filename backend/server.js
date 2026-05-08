require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const XLSX    = require('xlsx');

const { pool, initDB }         = require('./db');
const { fetchSquareDay }       = require('./square');
const { reconcile }            = require('./reconcile');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sumArr(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
}

async function storeSquareDetails(venue_id, date, data) {
  await Promise.all([
    pool.query('DELETE FROM square_refund_details    WHERE venue_id=$1 AND date=$2', [venue_id, date]),
    pool.query('DELETE FROM square_discount_details  WHERE venue_id=$1 AND date=$2', [venue_id, date]),
    pool.query('DELETE FROM square_comp_details      WHERE venue_id=$1 AND date=$2', [venue_id, date]),
    pool.query('DELETE FROM square_gift_card_details WHERE venue_id=$1 AND date=$2', [venue_id, date]),
  ]);
  for (const r of data.refundDetails)
    await pool.query(
      `INSERT INTO square_refund_details (venue_id,date,refund_id,payment_id,receipt_number,amount,reason,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [venue_id, date, r.refund_id, r.payment_id, r.receipt_number, r.amount, r.reason, r.status]);
  for (const d of data.discountDetails)
    await pool.query(
      `INSERT INTO square_discount_details (venue_id,date,order_id,payment_id,receipt_number,discount_name,discount_type,amount,percentage,scope) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [venue_id, date, d.order_id, d.payment_id, d.receipt_number, d.discount_name, d.discount_type, d.amount, d.percentage, d.scope]);
  for (const c of data.compDetails)
    await pool.query(
      `INSERT INTO square_comp_details (venue_id,date,order_id,payment_id,receipt_number,item_name,variation_name,quantity,amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [venue_id, date, c.order_id, c.payment_id, c.receipt_number, c.item_name, c.variation_name, c.quantity, c.amount]);
  for (const g of data.giftCardDetails)
    await pool.query(
      `INSERT INTO square_gift_card_details (venue_id,date,activity_type,payment_id,receipt_number,amount,gift_card_last4) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [venue_id, date, g.activity_type, g.payment_id, g.receipt_number, g.amount, g.gift_card_last4]);
}

async function getSquareDetails(venue_id, date) {
  const [refunds, discounts, comps, gift_cards] = await Promise.all([
    pool.query('SELECT * FROM square_refund_details    WHERE venue_id=$1 AND date=$2 ORDER BY amount DESC', [venue_id, date]),
    pool.query('SELECT * FROM square_discount_details  WHERE venue_id=$1 AND date=$2 ORDER BY amount DESC', [venue_id, date]),
    pool.query('SELECT * FROM square_comp_details      WHERE venue_id=$1 AND date=$2 ORDER BY amount DESC', [venue_id, date]),
    pool.query('SELECT * FROM square_gift_card_details WHERE venue_id=$1 AND date=$2 ORDER BY amount DESC', [venue_id, date]),
  ]);
  return { refunds: refunds.rows, discounts: discounts.rows, comps: comps.rows, gift_cards: gift_cards.rows };
}

async function saveEntries(reportId, b) {
  await Promise.all([
    pool.query('DELETE FROM report_petty_cash_entries     WHERE report_id=$1', [reportId]),
    pool.query('DELETE FROM report_staff_discount_entries WHERE report_id=$1', [reportId]),
    pool.query('DELETE FROM report_fnf_discount_entries   WHERE report_id=$1', [reportId]),
    pool.query('DELETE FROM report_comp_entries           WHERE report_id=$1', [reportId]),
  ]);
  for (const e of (b.petty_cash_entries || [])) {
    const amt = parseFloat(e.amount) || 0;
    if (amt > 0 || (e.notes || '').trim())
      await pool.query('INSERT INTO report_petty_cash_entries (report_id,amount,notes) VALUES($1,$2,$3)',
        [reportId, amt, (e.notes || '').trim()]);
  }
  for (const e of (b.staff_discount_entries || [])) {
    const amt = parseFloat(e.amount) || 0;
    if (amt > 0 || (e.name || '').trim())
      await pool.query('INSERT INTO report_staff_discount_entries (report_id,amount,name,reason) VALUES($1,$2,$3,$4)',
        [reportId, amt, (e.name || '').trim(), (e.reason || '').trim()]);
  }
  for (const e of (b.fnf_discount_entries || [])) {
    const amt = parseFloat(e.amount) || 0;
    if (amt > 0 || (e.name || '').trim())
      await pool.query('INSERT INTO report_fnf_discount_entries (report_id,amount,name,reason) VALUES($1,$2,$3,$4)',
        [reportId, amt, (e.name || '').trim(), (e.reason || '').trim()]);
  }
  for (const e of (b.comp_entries || [])) {
    const amt = parseFloat(e.amount) || 0;
    if (amt > 0 || (e.notes || '').trim())
      await pool.query('INSERT INTO report_comp_entries (report_id,amount,notes,description) VALUES($1,$2,$3,$4)',
        [reportId, amt, (e.notes || '').trim(), (e.description || '').trim()]);
  }
}

async function loadEntries(reportId) {
  const [pc, sd, fnf, comp] = await Promise.all([
    pool.query('SELECT id,amount,notes FROM report_petty_cash_entries WHERE report_id=$1 ORDER BY id', [reportId]),
    pool.query('SELECT id,amount,name,reason FROM report_staff_discount_entries WHERE report_id=$1 ORDER BY id', [reportId]),
    pool.query('SELECT id,amount,name,reason FROM report_fnf_discount_entries WHERE report_id=$1 ORDER BY id', [reportId]),
    pool.query('SELECT id,amount,notes,description FROM report_comp_entries WHERE report_id=$1 ORDER BY id', [reportId]),
  ]);
  return { petty_cash_entries: pc.rows, staff_discount_entries: sd.rows, fnf_discount_entries: fnf.rows, comp_entries: comp.rows };
}

// ── Venues ────────────────────────────────────────────────────────────────────

app.get('/api/venues', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM venues ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/venues', async (req, res) => {
  try {
    const { name, square_location_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = `venue-${Date.now()}`;
    await pool.query('INSERT INTO venues (id,name,square_location_id) VALUES ($1,$2,$3)', [id, name, square_location_id || '']);
    res.json({ id, name, square_location_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/venues/:id', async (req, res) => {
  try {
    const { name, square_location_id } = req.body;
    await pool.query('UPDATE venues SET name=$1,square_location_id=$2 WHERE id=$3', [name, square_location_id || '', req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const { venue_id, from, to } = req.query;
    const now = new Date();
    const f = from || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const t = to   || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;

    const p = [f, t];
    const vc   = venue_id ? ` AND venue_id=$${p.length+1}` : '';
    const mrvc = venue_id ? ` AND mr.venue_id=$${p.length+1}` : '';
    if (venue_id) p.push(venue_id);

    const [totals, reconciled, pending, variance, recent, refundTotal, compTotal, discTotal, gcTotal, discByType, recentRefunds, recentComps, recentGiftCards] =
      await Promise.all([
        pool.query(`SELECT COALESCE(SUM(cash_sales),0) as total_cash, COALESCE(SUM(card_sales),0) as total_card,
          COALESCE(SUM(total_sales),0) as total, COALESCE(SUM(deposits_used),0) as total_deposits,
          COALESCE(SUM(gift_cards_redeemed),0) as total_gifts, COALESCE(SUM(petty_cash),0) as total_petty
          FROM manager_reports WHERE date>=$1 AND date<=$2${vc}`, p),
        pool.query(`SELECT COUNT(*) as count FROM manager_reports mr
          JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
          WHERE mr.date>=$1 AND mr.date<=$2${mrvc}`, p),
        pool.query(`SELECT COUNT(*) as count FROM manager_reports mr
          LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
          WHERE mr.date>=$1 AND mr.date<=$2${mrvc} AND sd.id IS NULL`, p),
        pool.query(`SELECT COALESCE(SUM(ABS(mr.cash_sales-sd.cash)),0) as total_variance
          FROM manager_reports mr JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
          WHERE mr.date>=$1 AND mr.date<=$2${mrvc}`, p),
        pool.query(`SELECT mr.*, v.name as venue_name,
          CASE WHEN sd.id IS NOT NULL THEN 1 ELSE 0 END as has_square
          FROM manager_reports mr JOIN venues v ON v.id=mr.venue_id
          LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
          ${venue_id ? `WHERE mr.venue_id=$${p.length}` : ''}
          ORDER BY mr.created_at DESC LIMIT 10`, venue_id ? [venue_id] : []),
        pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_refund_details WHERE date>=$1 AND date<=$2${vc}`, p),
        pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_comp_details WHERE date>=$1 AND date<=$2${vc}`, p),
        pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_discount_details WHERE date>=$1 AND date<=$2${vc}`, p),
        pool.query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_gift_card_details WHERE activity_type='REDEEM' AND date>=$1 AND date<=$2${vc}`, p),
        pool.query(`SELECT discount_name, discount_type, scope, COUNT(*) as occurrences, COALESCE(SUM(amount),0) as total_amount
          FROM square_discount_details WHERE date>=$1 AND date<=$2${vc}
          GROUP BY discount_name, discount_type, scope ORDER BY total_amount DESC LIMIT 10`, p),
        pool.query(`SELECT rd.*, v.name as venue_name FROM square_refund_details rd
          JOIN venues v ON v.id=rd.venue_id WHERE rd.date>=$1 AND rd.date<=$2${vc.replace('venue_id', 'rd.venue_id')} ORDER BY rd.created_at DESC LIMIT 10`, p),
        pool.query(`SELECT cd.*, v.name as venue_name FROM square_comp_details cd
          JOIN venues v ON v.id=cd.venue_id WHERE cd.date>=$1 AND cd.date<=$2${vc.replace('venue_id', 'cd.venue_id')} ORDER BY cd.created_at DESC LIMIT 10`, p),
        pool.query(`SELECT gd.*, v.name as venue_name FROM square_gift_card_details gd
          JOIN venues v ON v.id=gd.venue_id WHERE gd.date>=$1 AND gd.date<=$2${vc.replace('venue_id', 'gd.venue_id')} AND gd.activity_type='REDEEM' ORDER BY gd.created_at DESC LIMIT 10`, p),
      ]);

    const t0 = totals.rows[0];
    res.json({
      total_cash: t0.total_cash, total_card: t0.total_card, total_sales: t0.total,
      total_deposits: t0.total_deposits, total_gifts: t0.total_gifts, total_petty: t0.total_petty,
      reconciled: parseInt(reconciled.rows[0].count),
      pending:    parseInt(pending.rows[0].count),
      cash_variance: variance.rows[0].total_variance,
      recent: recent.rows,
      monthly: {
        refunds:    { total: refundTotal.rows[0].total, count: parseInt(refundTotal.rows[0].count) },
        comps:      { total: compTotal.rows[0].total,   count: parseInt(compTotal.rows[0].count) },
        discounts:  { total: discTotal.rows[0].total,   count: parseInt(discTotal.rows[0].count) },
        gift_cards: { total: gcTotal.rows[0].total,     count: parseInt(gcTotal.rows[0].count) },
      },
      detail: { discByType: discByType.rows, recentRefunds: recentRefunds.rows, recentComps: recentComps.rows, recentGiftCards: recentGiftCards.rows },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Manager Reports ───────────────────────────────────────────────────────────

app.get('/api/reports', async (req, res) => {
  try {
    const { venue_id, date, from, to } = req.query;
    let q = `SELECT mr.*, v.name as venue_name,
      CASE WHEN sd.id IS NOT NULL THEN 1 ELSE 0 END as has_square,
      COALESCE(sd.locked, 0) as locked
      FROM manager_reports mr JOIN venues v ON v.id=mr.venue_id
      LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
      WHERE 1=1`;
    const p = [];
    if (venue_id) { q += ` AND mr.venue_id=$${p.length+1}`; p.push(venue_id); }
    if (date)     { q += ` AND mr.date=$${p.length+1}`;      p.push(date); }
    if (from)     { q += ` AND mr.date>=$${p.length+1}`;     p.push(from); }
    if (to)       { q += ` AND mr.date<=$${p.length+1}`;     p.push(to); }
    q += ' ORDER BY mr.date DESC';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reports', async (req, res) => {
  try {
    const b = req.body;
    if (!b.venue_id || !b.date) return res.status(400).json({ error: 'venue_id and date are required' });
    const n = v => parseFloat(v) || 0;
    const t = v => (v || '').toString().trim();

    const notes_50=n(b.notes_50); const notes_20=n(b.notes_20); const notes_10=n(b.notes_10); const notes_5=n(b.notes_5);
    const coins_200=n(b.coins_200); const coins_100=n(b.coins_100); const coins_50=n(b.coins_50); const coins_20=n(b.coins_20);
    const coins_10=n(b.coins_10); const coins_2=n(b.coins_2); const coins_1=n(b.coins_1);

    const physical_cash = notes_50*50 + notes_20*20 + notes_10*10 + notes_5*5 +
      coins_200*2 + coins_100*1 + coins_50*0.5 + coins_20*0.2 + coins_10*0.1 + coins_2*0.02 + coins_1*0.01;

    const cash_sales = n(b.cash_sales); const card_sales = n(b.card_sales);
    const deposits_used = n(b.deposits_used); const gift_cards_redeemed = n(b.gift_cards_redeemed);
    const petty_cash     = sumArr(b.petty_cash_entries)     ?? n(b.petty_cash);
    const staff_discount = sumArr(b.staff_discount_entries) ?? n(b.staff_discount);
    const fnf_discount   = sumArr(b.fnf_discount_entries)   ?? n(b.fnf_discount);
    const complimentary  = sumArr(b.comp_entries)           ?? n(b.complimentary);
    const grand_total = cash_sales + card_sales + deposits_used + gift_cards_redeemed + petty_cash;
    const total_sales = cash_sales + card_sales;

    const firstPettyNote = Array.isArray(b.petty_cash_entries) && b.petty_cash_entries[0] ? (b.petty_cash_entries[0].notes||'') : t(b.petty_cash_notes);
    const firstStaffNote = Array.isArray(b.staff_discount_entries) && b.staff_discount_entries[0] ? (b.staff_discount_entries[0].name||'') : t(b.staff_discount_notes);
    const firstFnfNote   = Array.isArray(b.fnf_discount_entries)   && b.fnf_discount_entries[0]   ? (b.fnf_discount_entries[0].name||'')   : t(b.fnf_discount_notes);
    const firstCompNote  = Array.isArray(b.comp_entries)           && b.comp_entries[0]           ? (b.comp_entries[0].notes||'')          : t(b.complimentary_notes);

    const { rows } = await pool.query(`
      INSERT INTO manager_reports
        (venue_id,date,cash_sales,card_sales,total_sales,grand_total,notes,shift_notes,
         deposits_used,gift_cards_redeemed,
         notes_50,notes_20,notes_10,notes_5,coins_200,coins_100,coins_50,coins_20,coins_10,coins_2,coins_1,
         physical_cash,petty_cash,petty_cash_notes,staff_discount,staff_discount_notes,
         fnf_discount,fnf_discount_notes,complimentary,complimentary_notes,
         card_tips,cash_tips,manager_refunds,manager_refund_notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
      RETURNING id`,
      [b.venue_id, b.date, cash_sales, card_sales, total_sales, grand_total,
       t(b.notes), t(b.shift_notes), deposits_used, gift_cards_redeemed,
       notes_50, notes_20, notes_10, notes_5, coins_200, coins_100, coins_50, coins_20, coins_10, coins_2, coins_1,
       physical_cash, petty_cash, firstPettyNote, staff_discount, firstStaffNote,
       fnf_discount, firstFnfNote, complimentary, firstCompNote,
       n(b.card_tips), n(b.cash_tips), n(b.manager_refunds), t(b.manager_refund_notes)]);

    const newId = rows[0].id;
    await saveEntries(newId, b);
    res.json({ id: newId, venue_id: b.venue_id, date: b.date, cash_sales, card_sales, total_sales, grand_total, physical_cash, petty_cash });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.put('/api/reports/:id', async (req, res) => {
  try {
    const b = req.body;
    const { rows: existing } = await pool.query(`
      SELECT mr.id, COALESCE(sd.locked, 0) as locked
      FROM manager_reports mr LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
      WHERE mr.id=$1`, [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Report not found' });
    if (existing[0].locked) return res.status(400).json({ error: 'Cannot edit a locked report' });

    const n = v => parseFloat(v) || 0;
    const t = v => (v || '').toString().trim();

    const notes_50=n(b.notes_50); const notes_20=n(b.notes_20); const notes_10=n(b.notes_10); const notes_5=n(b.notes_5);
    const coins_200=n(b.coins_200); const coins_100=n(b.coins_100); const coins_50=n(b.coins_50); const coins_20=n(b.coins_20);
    const coins_10=n(b.coins_10); const coins_2=n(b.coins_2); const coins_1=n(b.coins_1);

    const physical_cash = notes_50*50 + notes_20*20 + notes_10*10 + notes_5*5 +
      coins_200*2 + coins_100*1 + coins_50*0.5 + coins_20*0.2 + coins_10*0.1 + coins_2*0.02 + coins_1*0.01;

    const cash_sales = n(b.cash_sales); const card_sales = n(b.card_sales);
    const deposits_used = n(b.deposits_used); const gift_cards_redeemed = n(b.gift_cards_redeemed);
    const petty_cash     = sumArr(b.petty_cash_entries)     ?? n(b.petty_cash);
    const staff_discount = sumArr(b.staff_discount_entries) ?? n(b.staff_discount);
    const fnf_discount   = sumArr(b.fnf_discount_entries)   ?? n(b.fnf_discount);
    const complimentary  = sumArr(b.comp_entries)           ?? n(b.complimentary);
    const grand_total = cash_sales + card_sales + deposits_used + gift_cards_redeemed + petty_cash;
    const total_sales = cash_sales + card_sales;

    const firstPettyNote = Array.isArray(b.petty_cash_entries) && b.petty_cash_entries[0] ? (b.petty_cash_entries[0].notes||'') : t(b.petty_cash_notes);
    const firstStaffNote = Array.isArray(b.staff_discount_entries) && b.staff_discount_entries[0] ? (b.staff_discount_entries[0].name||'') : t(b.staff_discount_notes);
    const firstFnfNote   = Array.isArray(b.fnf_discount_entries)   && b.fnf_discount_entries[0]   ? (b.fnf_discount_entries[0].name||'')   : t(b.fnf_discount_notes);
    const firstCompNote  = Array.isArray(b.comp_entries)           && b.comp_entries[0]           ? (b.comp_entries[0].notes||'')          : t(b.complimentary_notes);

    await pool.query(`
      UPDATE manager_reports SET
        venue_id=$1, date=$2, cash_sales=$3, card_sales=$4, total_sales=$5, grand_total=$6,
        notes=$7, shift_notes=$8, deposits_used=$9, gift_cards_redeemed=$10,
        notes_50=$11, notes_20=$12, notes_10=$13, notes_5=$14,
        coins_200=$15, coins_100=$16, coins_50=$17, coins_20=$18, coins_10=$19, coins_2=$20, coins_1=$21,
        physical_cash=$22, petty_cash=$23, petty_cash_notes=$24,
        staff_discount=$25, staff_discount_notes=$26,
        fnf_discount=$27, fnf_discount_notes=$28,
        complimentary=$29, complimentary_notes=$30,
        card_tips=$31, cash_tips=$32, manager_refunds=$33, manager_refund_notes=$34
      WHERE id=$35`,
      [b.venue_id, b.date, cash_sales, card_sales, total_sales, grand_total,
       t(b.notes), t(b.shift_notes), deposits_used, gift_cards_redeemed,
       notes_50, notes_20, notes_10, notes_5, coins_200, coins_100, coins_50, coins_20, coins_10, coins_2, coins_1,
       physical_cash, petty_cash, firstPettyNote, staff_discount, firstStaffNote,
       fnf_discount, firstFnfNote, complimentary, firstCompNote,
       n(b.card_tips), n(b.cash_tips), n(b.manager_refunds), t(b.manager_refund_notes), req.params.id]);

    await saveEntries(req.params.id, b);
    res.json({ ok: true, grand_total, physical_cash });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.delete('/api/reports/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await Promise.all([
      pool.query('DELETE FROM report_petty_cash_entries     WHERE report_id=$1', [id]),
      pool.query('DELETE FROM report_staff_discount_entries WHERE report_id=$1', [id]),
      pool.query('DELETE FROM report_fnf_discount_entries   WHERE report_id=$1', [id]),
      pool.query('DELETE FROM report_comp_entries           WHERE report_id=$1', [id]),
    ]);
    await pool.query('DELETE FROM manager_reports WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/:id/entries', async (req, res) => {
  try { res.json(await loadEntries(req.params.id)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Square ────────────────────────────────────────────────────────────────────

app.post('/api/square/fetch', async (req, res) => {
  try {
    const { venue_id, date } = req.body;
    if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date are required' });

    const { rows: venues } = await pool.query('SELECT * FROM venues WHERE id=$1', [venue_id]);
    const venue = venues[0];
    if (!venue?.square_location_id) return res.status(400).json({ error: 'No Square location ID set for this venue — add it in Settings' });

    const data = await fetchSquareDay(venue.square_location_id, date);
    const s    = data.summary;

    const { rows: existing } = await pool.query('SELECT id FROM square_data WHERE venue_id=$1 AND date=$2', [venue_id, date]);
    if (existing[0]) {
      await pool.query(`UPDATE square_data SET cash=$1,card=$2,total=$3,refunds=$4,discounts=$5,comps=$6,gift_cards=$7,raw_json=$8 WHERE venue_id=$9 AND date=$10`,
        [s.cash, s.card, s.total, s.refunds, s.discounts, s.comps, s.gift_cards, data.raw_json, venue_id, date]);
    } else {
      await pool.query(`INSERT INTO square_data (venue_id,date,cash,card,total,refunds,discounts,comps,gift_cards,raw_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [venue_id, date, s.cash, s.card, s.total, s.refunds, s.discounts, s.comps, s.gift_cards, data.raw_json]);
    }
    await storeSquareDetails(venue_id, date, data);
    res.json({ summary: s, ...(await getSquareDetails(venue_id, date)) });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/square/details', async (req, res) => {
  try {
    const { venue_id, date } = req.query;
    if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date are required' });
    res.json(await getSquareDetails(venue_id, date));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reconciliation ────────────────────────────────────────────────────────────

app.get('/api/reconcile', async (req, res) => {
  try {
    const { venue_id, date } = req.query;
    if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date are required' });

    const [{ rows: reports }, { rows: squares }] = await Promise.all([
      pool.query('SELECT * FROM manager_reports WHERE venue_id=$1 AND date=$2 ORDER BY created_at DESC LIMIT 1', [venue_id, date]),
      pool.query('SELECT * FROM square_data WHERE venue_id=$1 AND date=$2', [venue_id, date]),
    ]);
    if (!reports[0]) return res.status(404).json({ error: 'No manager report found for this date' });
    if (!squares[0]) return res.status(404).json({ error: 'No Square data found — fetch it first' });

    res.json({
      report: reports[0],
      square: squares[0],
      reconciliation: reconcile(reports[0], squares[0]),
      details: await getSquareDetails(venue_id, date),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reconcile/summary', async (req, res) => {
  try {
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
      FROM manager_reports mr JOIN venues v ON v.id=mr.venue_id
      ${joinType} WHERE 1=1`;
    const p = [];
    if (venue_id) { q += ` AND mr.venue_id=$${p.length+1}`; p.push(venue_id); }
    if (from)     { q += ` AND mr.date>=$${p.length+1}`;    p.push(from); }
    if (to)       { q += ` AND mr.date<=$${p.length+1}`;    p.push(to); }
    q += ' ORDER BY mr.date DESC';

    const { rows } = await pool.query(q, p);
    res.json(rows.map(row => ({
      ...row,
      reconciliation: row.sq_total == null ? null : reconcile(
        { cash_sales: row.cash_sales, card_sales: row.card_sales, total_sales: row.total_sales,
          physical_cash: row.physical_cash, petty_cash: row.petty_cash, grand_total: row.grand_total },
        { cash: row.sq_cash, card: row.sq_card, total: row.sq_total, refunds: row.refunds, discounts: row.discounts, comps: row.comps }
      ),
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Detail list endpoints ─────────────────────────────────────────────────────

app.get('/api/refunds', async (req, res) => {
  try {
    const { venue_id, from, to, approved_only } = req.query;
    const lockJoin = approved_only === '1' ? ' INNER JOIN square_data sd ON sd.venue_id=rd.venue_id AND sd.date=rd.date AND sd.locked=1' : '';
    let q = `SELECT rd.*, v.name as venue_name FROM square_refund_details rd JOIN venues v ON v.id=rd.venue_id${lockJoin} WHERE 1=1`;
    const p = [];
    if (venue_id) { q += ` AND rd.venue_id=$${p.length+1}`; p.push(venue_id); }
    if (from)     { q += ` AND rd.date>=$${p.length+1}`;    p.push(from); }
    if (to)       { q += ` AND rd.date<=$${p.length+1}`;    p.push(to); }
    q += ' ORDER BY rd.date DESC, rd.amount DESC';
    res.json((await pool.query(q, p)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/comps', async (req, res) => {
  try {
    const { venue_id, from, to, approved_only } = req.query;
    const lockJoin = approved_only === '1' ? ' INNER JOIN square_data sd ON sd.venue_id=cd.venue_id AND sd.date=cd.date AND sd.locked=1' : '';
    let q = `SELECT cd.*, v.name as venue_name FROM square_comp_details cd JOIN venues v ON v.id=cd.venue_id${lockJoin} WHERE 1=1`;
    const p = [];
    if (venue_id) { q += ` AND cd.venue_id=$${p.length+1}`; p.push(venue_id); }
    if (from)     { q += ` AND cd.date>=$${p.length+1}`;    p.push(from); }
    if (to)       { q += ` AND cd.date<=$${p.length+1}`;    p.push(to); }
    q += ' ORDER BY cd.date DESC, cd.amount DESC';
    res.json((await pool.query(q, p)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/discounts', async (req, res) => {
  try {
    const { venue_id, from, to, approved_only } = req.query;
    const lockJoin = approved_only === '1' ? ' INNER JOIN square_data sd ON sd.venue_id=dd.venue_id AND sd.date=dd.date AND sd.locked=1' : '';
    let q = `SELECT dd.*, v.name as venue_name FROM square_discount_details dd JOIN venues v ON v.id=dd.venue_id${lockJoin} WHERE 1=1`;
    const p = [];
    if (venue_id) { q += ` AND dd.venue_id=$${p.length+1}`; p.push(venue_id); }
    if (from)     { q += ` AND dd.date>=$${p.length+1}`;    p.push(from); }
    if (to)       { q += ` AND dd.date<=$${p.length+1}`;    p.push(to); }
    q += ' ORDER BY dd.date DESC, dd.amount DESC';
    res.json((await pool.query(q, p)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/gift-cards', async (req, res) => {
  try {
    const { venue_id, from, to, approved_only } = req.query;
    const lockJoin = approved_only === '1' ? ' INNER JOIN square_data sd ON sd.venue_id=gd.venue_id AND sd.date=gd.date AND sd.locked=1' : '';
    let q = `SELECT gd.*, v.name as venue_name FROM square_gift_card_details gd JOIN venues v ON v.id=gd.venue_id${lockJoin} WHERE 1=1`;
    const p = [];
    if (venue_id) { q += ` AND gd.venue_id=$${p.length+1}`; p.push(venue_id); }
    if (from)     { q += ` AND gd.date>=$${p.length+1}`;    p.push(from); }
    if (to)       { q += ` AND gd.date<=$${p.length+1}`;    p.push(to); }
    q += ' ORDER BY gd.date DESC, gd.amount DESC';
    res.json((await pool.query(q, p)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/square/notes', async (req, res) => {
  try {
    const { venue_id, date, recon_notes } = req.body;
    if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date required' });
    await pool.query('UPDATE square_data SET recon_notes=$1 WHERE venue_id=$2 AND date=$3', [recon_notes || '', venue_id, date]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/square/lock', async (req, res) => {
  try {
    const { venue_id, date } = req.body;
    if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date required' });
    const { rows } = await pool.query('SELECT id FROM square_data WHERE venue_id=$1 AND date=$2', [venue_id, date]);
    if (!rows[0]) return res.status(400).json({ error: 'No Square data — fetch and reconcile before locking' });
    await pool.query('UPDATE square_data SET locked=1 WHERE venue_id=$1 AND date=$2', [venue_id, date]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/square/unlock', async (req, res) => {
  try {
    const { venue_id, date } = req.body;
    if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date required' });
    await pool.query('UPDATE square_data SET locked=0 WHERE venue_id=$1 AND date=$2', [venue_id, date]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Actual Cash Held ──────────────────────────────────────────────────────────

app.patch('/api/reports/:id/actual-cash', async (req, res) => {
  try {
    const { actual_cash_held, actual_cash_notes } = req.body;
    const val = actual_cash_held != null && actual_cash_held !== '' ? parseFloat(actual_cash_held) : null;
    await pool.query('UPDATE manager_reports SET actual_cash_held=$1, actual_cash_notes=$2 WHERE id=$3',
      [val, actual_cash_notes || '', req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Tips ──────────────────────────────────────────────────────────────────────

app.get('/api/tips', async (req, res) => {
  try {
    const { venue_id, from, to } = req.query;
    const now = new Date();
    const f = from || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const t = to   || now.toISOString().slice(0, 10);
    let q = `SELECT mr.id, mr.date, mr.venue_id, v.name as venue_name,
             mr.card_tips, mr.cash_tips, mr.cash_tips_final,
             COALESCE(sd.card_tips, 0) as sq_card_tips
      FROM manager_reports mr JOIN venues v ON v.id=mr.venue_id
      LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
      WHERE mr.date>=$1 AND mr.date<=$2`;
    const p = [f, t];
    if (venue_id) { q += ` AND mr.venue_id=$${p.length+1}`; p.push(venue_id); }
    q += ' ORDER BY mr.date DESC LIMIT 500';
    res.json((await pool.query(q, p)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/reports/:id/cash-tips-final', async (req, res) => {
  try {
    const { cash_tips_final } = req.body;
    const val = cash_tips_final != null && cash_tips_final !== '' ? parseFloat(cash_tips_final) : null;
    await pool.query('UPDATE manager_reports SET cash_tips_final=$1 WHERE id=$2', [val, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Discrepancies ─────────────────────────────────────────────────────────────

app.get('/api/discrepancies', async (req, res) => {
  try {
    const { venue_id, from, to, category, status } = req.query;
    const now = new Date();
    const f = from || `${now.getFullYear() - 1}-01-01`;
    const t = to   || now.toISOString().slice(0, 10);

    let q = `SELECT mr.id, mr.date, mr.venue_id, v.name as venue_name,
      mr.cash_sales, mr.card_sales, mr.grand_total,
      mr.actual_cash_held, mr.petty_cash, mr.manager_refunds,
      sd.cash as sq_cash, sd.card as sq_card, sd.total as sq_total, sd.refunds as sq_refunds
      FROM manager_reports mr JOIN venues v ON v.id=mr.venue_id
      LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
      WHERE mr.date>=$1 AND mr.date<=$2
        AND (sd.total IS NOT NULL OR mr.actual_cash_held IS NOT NULL)`;
    const p = [f, t];
    if (venue_id) { q += ` AND mr.venue_id=$${p.length+1}`; p.push(venue_id); }
    q += ' ORDER BY mr.date DESC LIMIT 500';

    const { rows } = await pool.query(q, p);

    const statusMap = {};
    if (rows.length) {
      const sRows = (await pool.query('SELECT * FROM discrepancy_notes WHERE date>=$1 AND date<=$2', [f, t])).rows;
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
        discrepancies.push({ ...base, category: cat, expected, actual, difference: diff, abs_difference: Math.abs(diff),
          severity: Math.abs(diff) > 5 ? 'major' : 'minor', status: st.status, notes: st.notes });
      };
      if (row.actual_cash_held != null)
        push('Cash — Mgr vs Actual', row.actual_cash_held, row.cash_sales);
      if (row.sq_cash != null) {
        const adminCash = (row.actual_cash_held ?? row.cash_sales) + (row.petty_cash || 0);
        push('Cash vs Square', row.sq_cash, adminCash);
      }
      if (row.sq_card != null) push('Card vs Square', row.sq_card, row.card_sales);
      if (row.sq_total != null) push('Total vs Square', row.sq_total, row.grand_total);
      if ((row.sq_refunds || 0) > 0) {
        const st = getStatus('Refunds');
        discrepancies.push({ ...base, category: 'Refunds', expected: 0, actual: row.sq_refunds,
          difference: row.sq_refunds, abs_difference: row.sq_refunds,
          severity: row.sq_refunds > 20 ? 'major' : 'minor', status: st.status, notes: st.notes });
      }
    }

    let result = discrepancies;
    if (category && category !== 'all') result = result.filter(d => d.category === category);
    if (status   && status !== 'all')   result = result.filter(d => d.status === status);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/discrepancies/status', async (req, res) => {
  try {
    const { venue_id, date, category, status, notes } = req.body;
    if (!venue_id || !date || !category) return res.status(400).json({ error: 'venue_id, date, category required' });
    await pool.query(`
      INSERT INTO discrepancy_notes (venue_id, date, category, status, notes, updated_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT(venue_id, date, category) DO UPDATE SET
        status=EXCLUDED.status, notes=EXCLUDED.notes, updated_at=NOW()`,
      [venue_id, date, category, status || 'unresolved', notes || '']);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Excel Export ──────────────────────────────────────────────────────────────

app.get('/api/export/excel', async (req, res) => {
  try {
    const { venue_id, from, to } = req.query;
    const now = new Date();
    const f = from || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const t = to   || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;

    let q = `SELECT mr.date, v.name as venue, mr.cash_sales, mr.petty_cash, mr.physical_cash,
             mr.card_sales, mr.deposits_used, mr.gift_cards_redeemed, mr.grand_total,
             mr.staff_discount, mr.fnf_discount, mr.complimentary,
             mr.card_tips, mr.cash_tips, mr.shift_notes,
             CASE WHEN sd.id IS NOT NULL THEN 'Reconciled' ELSE 'Pending' END as status,
             COALESCE(sd.recon_notes,'') as recon_notes
      FROM manager_reports mr JOIN venues v ON v.id=mr.venue_id
      LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
      WHERE mr.date>=$1 AND mr.date<=$2`;
    const p = [f, t];
    if (venue_id) { q += ` AND mr.venue_id=$${p.length+1}`; p.push(venue_id); }
    q += ' ORDER BY mr.date DESC';
    const rows = (await pool.query(q, p)).rows;

    // Entry details — 4 separate queries, merged
    const entryP = venue_id ? [f, t, venue_id] : [f, t];
    const vf = venue_id ? ` AND mr.venue_id=$3` : '';
    const [pc, sd2, fnf, comp] = await Promise.all([
      pool.query(`SELECT mr.date, v.name as venue, 'Petty Cash' as category, e.amount, e.notes as detail, '' as reason
        FROM report_petty_cash_entries e JOIN manager_reports mr ON mr.id=e.report_id JOIN venues v ON v.id=mr.venue_id
        WHERE mr.date>=$1 AND mr.date<=$2${vf}`, entryP),
      pool.query(`SELECT mr.date, v.name as venue, 'Staff Discount' as category, e.amount, e.name as detail, e.reason
        FROM report_staff_discount_entries e JOIN manager_reports mr ON mr.id=e.report_id JOIN venues v ON v.id=mr.venue_id
        WHERE mr.date>=$1 AND mr.date<=$2${vf}`, entryP),
      pool.query(`SELECT mr.date, v.name as venue, 'F&F Discount' as category, e.amount, e.name as detail, e.reason
        FROM report_fnf_discount_entries e JOIN manager_reports mr ON mr.id=e.report_id JOIN venues v ON v.id=mr.venue_id
        WHERE mr.date>=$1 AND mr.date<=$2${vf}`, entryP),
      pool.query(`SELECT mr.date, v.name as venue, 'Complimentary' as category, e.amount, e.notes as detail, e.description as reason
        FROM report_comp_entries e JOIN manager_reports mr ON mr.id=e.report_id JOIN venues v ON v.id=mr.venue_id
        WHERE mr.date>=$1 AND mr.date<=$2${vf}`, entryP),
    ]);
    const entryRows = [...pc.rows, ...sd2.rows, ...fnf.rows, ...comp.rows]
      .sort((a, b) => a.date.localeCompare(b.date));

    const wsData = [
      ['Date','Venue','Cash Sales','Petty Cash','Physical Cash','Card Sales','Deposits Used',
       'Gift Vouchers','Grand Total','Staff Discount','F&F Discount','Complimentary',
       'Card Tips','Cash Tips','Total Tips','Status','Shift Notes','Recon Notes'],
      ...rows.map(r => [
        r.date, r.venue, r.cash_sales||0, r.petty_cash||0, r.physical_cash||0,
        r.card_sales||0, r.deposits_used||0, r.gift_cards_redeemed||0, r.grand_total||0,
        r.staff_discount||0, r.fnf_discount||0, r.complimentary||0,
        r.card_tips||0, r.cash_tips||0, (r.card_tips||0)+(r.cash_tips||0),
        r.status, r.shift_notes||'', r.recon_notes||'',
      ]),
    ];
    const wsEntries = [
      ['Date','Venue','Category','Amount','Detail / Name','Reason'],
      ...entryRows.map(r => [r.date, r.venue, r.category, r.amount||0, r.detail||'', r.reason||'']),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData),    'Sales Report');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsEntries), 'Entry Details');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="rasoi-sales-${f}-to-${t}.xlsx"`);
    res.send(buf);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────

initDB()
  .then(() => app.listen(PORT, () => console.log(`Reconcile API running on http://localhost:${PORT}`)))
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
