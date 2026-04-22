require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const XLSX    = require('xlsx');
const pdfParse = require('pdf-parse');

const db                   = require('./db');
const { fetchSquareDay }   = require('./square');
const { processManagerReport, parseWithClaude } = require('./ocr');
const { reconcile }        = require('./reconcile');

const app  = express();
const PORT = process.env.PORT || 3001;

// Upload dir — use volume path in production
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

// Serve built React frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(distPath));
  // All non-API routes serve index.html (SPA routing)
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, `report-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg','.jpeg','.png','.gif','.webp','.pdf','.csv','.xlsx','.xls'];
    cb(null, ok.includes(path.extname(file.originalname).toLowerCase()));
  },
});

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
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const from  = `${year}-${month}-01`;
  const to    = `${year}-${month}-31`;

  const totals = db.prepare(`
    SELECT COALESCE(SUM(cash_sales),0) as total_cash,
           COALESCE(SUM(card_sales),0) as total_card,
           COALESCE(SUM(total_sales),0) as total
    FROM manager_reports WHERE date>=? AND date<=?`).get(from, to);

  const reconciled = db.prepare(`
    SELECT COUNT(*) as count FROM manager_reports mr
    JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE mr.date>=? AND mr.date<=?`).get(from, to);

  const pending = db.prepare(`
    SELECT COUNT(*) as count FROM manager_reports mr
    LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE mr.date>=? AND mr.date<=? AND sd.id IS NULL`).get(from, to);

  const variance = db.prepare(`
    SELECT COALESCE(SUM(ABS(mr.cash_sales-sd.cash)),0) as total_variance
    FROM manager_reports mr
    JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    WHERE mr.date>=? AND mr.date<=?`).get(from, to);

  const recent = db.prepare(`
    SELECT mr.*, v.name as venue_name,
      CASE WHEN sd.id IS NOT NULL THEN 1 ELSE 0 END as has_square
    FROM manager_reports mr
    JOIN venues v ON v.id=mr.venue_id
    LEFT JOIN square_data sd ON sd.venue_id=mr.venue_id AND sd.date=mr.date
    ORDER BY mr.created_at DESC LIMIT 5`).all();

  // Monthly detail aggregates
  const refundTotal = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_refund_details WHERE date>=? AND date<=?`).get(from, to);
  const compTotal   = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_comp_details WHERE date>=? AND date<=?`).get(from, to);
  const discTotal   = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_discount_details WHERE date>=? AND date<=?`).get(from, to);
  const gcTotal     = db.prepare(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM square_gift_card_details WHERE activity_type='REDEEM' AND date>=? AND date<=?`).get(from, to);

  // Discount type breakdown for the month
  const discByType = db.prepare(`
    SELECT discount_name, discount_type, scope,
           COUNT(*) as occurrences, COALESCE(SUM(amount),0) as total_amount
    FROM square_discount_details WHERE date>=? AND date<=?
    GROUP BY discount_name, discount_type, scope
    ORDER BY total_amount DESC LIMIT 10`).all(from, to);

  // Recent refunds (last 10)
  const recentRefunds = db.prepare(`
    SELECT rd.*, v.name as venue_name FROM square_refund_details rd
    JOIN venues v ON v.id=rd.venue_id
    WHERE rd.date>=? AND rd.date<=? ORDER BY rd.created_at DESC LIMIT 10`).all(from, to);

  // Recent comps (last 10)
  const recentComps = db.prepare(`
    SELECT cd.*, v.name as venue_name FROM square_comp_details cd
    JOIN venues v ON v.id=cd.venue_id
    WHERE cd.date>=? AND cd.date<=? ORDER BY cd.created_at DESC LIMIT 10`).all(from, to);

  // Recent gift card redemptions (last 10)
  const recentGiftCards = db.prepare(`
    SELECT gd.*, v.name as venue_name FROM square_gift_card_details gd
    JOIN venues v ON v.id=gd.venue_id
    WHERE gd.date>=? AND gd.date<=? AND gd.activity_type='REDEEM'
    ORDER BY gd.created_at DESC LIMIT 10`).all(from, to);

  res.json({
    total_cash:    totals.total_cash,
    total_card:    totals.total_card,
    total_sales:   totals.total,
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

app.post('/api/reports', upload.single('file'), async (req, res) => {
  try {
    const { venue_id, date, cash_sales, card_sales, total_sales, notes } = req.body;
    if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date are required' });

    let parsed = {
      cash_sales:  parseFloat(cash_sales)  || 0,
      card_sales:  parseFloat(card_sales)  || 0,
      total_sales: parseFloat(total_sales) || 0,
      notes:       notes || '',
      image_path:  null,
    };

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      parsed.image_path = `/uploads/${req.file.filename}`;

      if (['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)) {
        const ocr = await processManagerReport(req.file.path);
        parsed = { ...parsed, ...ocr, image_path: parsed.image_path };
      } else if (ext === '.pdf') {
        const pdf = await pdfParse(fs.readFileSync(req.file.path));
        const ocr = await parseWithClaude(pdf.text);
        parsed = { ...parsed, ...ocr, image_path: parsed.image_path };
      } else if (['.csv','.xlsx','.xls'].includes(ext)) {
        const wb   = XLSX.readFile(req.file.path);
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const ocr  = await parseWithClaude(rows.map(r => r.join('\t')).join('\n'));
        parsed = { ...parsed, ...ocr, image_path: parsed.image_path };
      }
    }

    const result = db.prepare(`
      INSERT INTO manager_reports (venue_id,date,cash_sales,card_sales,total_sales,notes,image_path)
      VALUES (?,?,?,?,?,?,?)`).run(venue_id, date, parsed.cash_sales, parsed.card_sales, parsed.total_sales, parsed.notes, parsed.image_path);

    res.json({ id: result.lastInsertRowid, ...parsed, venue_id, date });
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
           mr.cash_sales, mr.card_sales, mr.total_sales, mr.notes,
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
      { cash_sales: row.cash_sales, card_sales: row.card_sales, total_sales: row.total_sales },
      { cash: row.sq_cash, card: row.sq_card, total: row.sq_total, refunds: row.refunds, discounts: row.discounts, comps: row.comps }
    ),
  })));
});

app.listen(PORT, () => console.log(`Reconcile API running on http://localhost:${PORT}`));
