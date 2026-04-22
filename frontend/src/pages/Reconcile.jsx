import React, { useState } from 'react';
import { api } from '../api/client.js';

const FILE_TYPES = [
  { id: 'image', label: 'Image',  accept: 'image/*',       hint: 'JPG/PNG — scanned via OCR + AI', icon: '📷' },
  { id: 'csv',   label: 'CSV',    accept: '.csv',           hint: 'Comma-separated export',         icon: '📄' },
  { id: 'pdf',   label: 'PDF',    accept: '.pdf',           hint: 'PDF report, text extracted by AI',icon: '📑' },
  { id: 'excel', label: 'Excel',  accept: '.xlsx,.xls',     hint: 'Excel spreadsheet',              icon: '📊' },
];

const DETAIL_TABS = ['refunds', 'comps', 'discounts', 'gift_cards'];
const DETAIL_LABELS = { refunds: 'Refunds', comps: 'Complimentary', discounts: 'Discounts', gift_cards: 'Gift Vouchers' };

export default function Reconcile({ venues, showToast }) {
  const [venueId, setVenueId]       = useState(venues[0]?.id || '');
  const [date, setDate]             = useState(today());
  const [fileType, setFileType]     = useState('image');
  const [file, setFile]             = useState(null);
  const [manual, setManual]         = useState({ cash_sales:'', card_sales:'', total_sales:'', notes:'' });
  const [uploadMode, setUploadMode] = useState('upload');
  const [uploading, setUploading]   = useState(false);
  const [fetching, setFetching]     = useState(false);
  const [result, setResult]         = useState(null);
  const [detailTab, setDetailTab]   = useState('refunds');
  const [error, setError]           = useState('');

  const selectedVenue = venues.find(v => v.id === venueId);
  const r   = result?.reconciliation;
  const det = result?.details ?? {};
  const isOk = r?.status === 'ok';

  async function handleSubmitReport(e) {
    e.preventDefault();
    if (!venueId) return setError('Select a venue.');
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('venue_id', venueId);
      fd.append('date', date);
      if (uploadMode === 'upload' && file) {
        fd.append('file', file);
      } else {
        fd.append('cash_sales',  manual.cash_sales  || 0);
        fd.append('card_sales',  manual.card_sales  || 0);
        fd.append('total_sales', manual.total_sales || 0);
        fd.append('notes',       manual.notes       || '');
      }
      await api.submitReport(fd);
      showToast('Report submitted');
      setFile(null);
    } catch (err) { setError(err.message); }
    setUploading(false);
  }

  async function handleFetchSquare() {
    if (!venueId) return setError('Select a venue.');
    setFetching(true); setError('');
    try {
      await api.fetchSquare(venueId, date);
      showToast('Square data fetched');
      await loadReconcile();
    } catch (err) { setError(err.message); }
    setFetching(false);
  }

  async function loadReconcile() {
    try {
      setResult(await api.reconcile(venueId, date));
      setError('');
    } catch (err) { setError(err.message); setResult(null); }
  }

  return (
    <div style={s.root}>
      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <div style={s.left}>

        {/* Venue + date */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Venue & Date</h3>
          <div style={s.venueBtns}>
            {venues.map(v => (
              <button key={v.id} onClick={() => setVenueId(v.id)}
                style={{ ...s.venueBtn, ...(venueId === v.id ? s.venueBtnActive : {}) }}>
                <span style={s.venueInitial}>{v.name[0]}</span>
                {v.name}
              </button>
            ))}
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={s.input} />
        </div>

        {/* Upload */}
        <div style={s.card}>
          <div style={s.modeTabs}>
            <button style={uploadMode === 'upload' ? s.modeActive : s.modeTab} onClick={() => setUploadMode('upload')}>Upload File</button>
            <button style={uploadMode === 'manual' ? s.modeActive : s.modeTab} onClick={() => setUploadMode('manual')}>Manual Entry</button>
          </div>

          {uploadMode === 'upload' ? (
            <form onSubmit={handleSubmitReport}>
              <div style={s.ftTabs}>
                {FILE_TYPES.map(ft => (
                  <button key={ft.id} type="button" onClick={() => setFileType(ft.id)}
                    style={{ ...s.ftTab, ...(fileType === ft.id ? s.ftActive : {}) }}>
                    <span>{ft.icon}</span><span>{ft.label}</span>
                  </button>
                ))}
              </div>
              <input key={fileType} type="file" id="file-up"
                accept={FILE_TYPES.find(f => f.id === fileType)?.accept}
                onChange={e => setFile(e.target.files[0])} style={{ display: 'none' }} />
              <label htmlFor="file-up" style={{ ...s.drop, ...(file ? s.dropActive : {}) }}>
                <span style={{ fontSize: 28 }}>{file ? '✓' : FILE_TYPES.find(f => f.id === fileType)?.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{file ? file.name : 'Click to choose file'}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{FILE_TYPES.find(f => f.id === fileType)?.hint}</span>
              </label>
              {error && <p style={s.err}>{error}</p>}
              <button type="submit" disabled={uploading || !file} style={s.btn}>
                {uploading ? 'Processing…' : 'Submit Report'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmitReport}>
              <div style={s.manualGrid}>
                {[['cash_sales','Cash Sales (£)'],['card_sales','Card Sales (£)'],['total_sales','Total Sales (£)']].map(([f, lbl]) => (
                  <label key={f} style={s.fieldLabel}>
                    {lbl}
                    <input type="number" step="0.01" min="0" placeholder="0.00"
                      value={manual[f]} onChange={e => setManual(p => ({ ...p, [f]: e.target.value }))} style={s.input} />
                  </label>
                ))}
              </div>
              <label style={{ ...s.fieldLabel, gridColumn: '1/-1' }}>
                Notes
                <textarea value={manual.notes} onChange={e => setManual(p => ({ ...p, notes: e.target.value }))}
                  style={{ ...s.input, height: 56, resize: 'vertical' }} placeholder="Any comments…" />
              </label>
              {error && <p style={s.err}>{error}</p>}
              <button type="submit" disabled={uploading} style={{ ...s.btn, marginTop: 10 }}>
                {uploading ? 'Saving…' : 'Submit Report'}
              </button>
            </form>
          )}
        </div>

        {/* Square */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Square Data</h3>
          <p style={s.hint}>
            {selectedVenue?.square_location_id
              ? 'Fetch live payments, refunds, discounts, comps and gift vouchers from Square.'
              : 'No Square location ID set — add it in Settings.'}
          </p>
          <div style={s.btnRow}>
            <button onClick={handleFetchSquare} disabled={fetching || !selectedVenue?.square_location_id} style={s.btnSec}>
              {fetching ? 'Fetching…' : 'Fetch from Square'}
            </button>
            <button onClick={loadReconcile} style={s.btn}>Reconcile</button>
          </div>
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────────── */}
      <div style={s.right}>

        {/* Summary */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Reconciliation Result</h3>
          {!result ? (
            <div style={s.placeholder}>
              <span style={{ fontSize: 40 }}>⚖</span>
              <p style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center' }}>
                Submit a manager report and click <strong>Reconcile</strong>.
              </p>
            </div>
          ) : (
            <>
              <div style={{ ...s.statusBanner, background: isOk ? '#f0fdf4' : '#fffbeb', borderColor: isOk ? '#86efac' : '#fde68a' }}>
                <span style={{ fontSize: 22 }}>{isOk ? '✓' : '⚠'}</span>
                <div>
                  <p style={{ fontWeight: 700, color: isOk ? '#166534' : '#92400e' }}>
                    {isOk ? 'All figures match' : `${r.flags.length} variance${r.flags.length !== 1 ? 's' : ''} found`}
                  </p>
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {selectedVenue?.name} · {fDate(date)}
                  </p>
                </div>
              </div>

              {r.flags.map((f, i) => (
                <div key={i} style={s.flag}><span style={s.flagDot}/>{f.message}</div>
              ))}

              <div style={s.metricsHeader}>
                <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>FIELD</span>
                <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>MANAGER</span>
                <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>SQUARE</span>
                <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>VARIANCE</span>
              </div>
              <MetricRow label="Cash"  manager={result.report.cash_sales}  square={result.square.cash}  variance={r.cashVar} />
              <MetricRow label="Card"  manager={result.report.card_sales}  square={result.square.card}  variance={r.cardVar} />
              <MetricRow label="Total" manager={result.report.total_sales} square={result.square.total} variance={r.totalVar} bold />

              <div style={s.sqExtras}>
                <ExtraChip label="Refunds"   value={result.square.refunds}   warn={result.square.refunds > 0} />
                <ExtraChip label="Discounts" value={result.square.discounts} warn={result.square.discounts > 200} />
                <ExtraChip label="Comps"     value={result.square.comps}     warn={result.square.comps > 50} />
                <ExtraChip label="Gift Cards" value={result.square.gift_cards} />
              </div>

              {result.report.notes && (
                <div style={s.notes}><strong>Notes:</strong> {result.report.notes}</div>
              )}
            </>
          )}
        </div>

        {/* Detail tabs */}
        {result && (
          <div style={s.card}>
            <div style={s.detailTabRow}>
              {DETAIL_TABS.map(t => {
                const items = det[t] ?? [];
                return (
                  <button key={t} onClick={() => setDetailTab(t)}
                    style={{ ...s.dtab, ...(detailTab === t ? s.dtabActive : {}) }}>
                    {DETAIL_LABELS[t]}
                    {items.length > 0 && <span style={s.badge}>{items.length}</span>}
                  </button>
                );
              })}
            </div>

            {detailTab === 'refunds' && (
              <DetailSection
                items={det.refunds ?? []}
                empty="No refunds on this date."
                columns={['Receipt #','Amount','Reason','Status']}
                render={r => [
                  <code style={s.code}>{r.receipt_number}</code>,
                  <span style={{ color:'#ef4444', fontWeight:700 }}>£{f2(r.amount)}</span>,
                  r.reason || '—',
                  r.status,
                ]}
              />
            )}

            {detailTab === 'comps' && (
              <DetailSection
                items={det.comps ?? []}
                empty="No complimentary items on this date."
                columns={['Receipt #','Item','Variation','Qty','Value']}
                render={c => [
                  <code style={s.code}>{c.receipt_number}</code>,
                  c.item_name,
                  c.variation_name || '—',
                  c.quantity,
                  <span style={{ color:'#f59e0b', fontWeight:700 }}>£{f2(c.amount)}</span>,
                ]}
              />
            )}

            {detailTab === 'discounts' && (
              <DetailSection
                items={det.discounts ?? []}
                empty="No discounts on this date."
                columns={['Receipt #','Name','Type','Scope','Amount']}
                render={d => [
                  <code style={s.code}>{d.receipt_number}</code>,
                  d.discount_name,
                  <Tag text={d.discount_type} />,
                  <Tag text={d.scope} light />,
                  <span style={{ color:'#8b5cf6', fontWeight:700 }}>£{f2(d.amount)}</span>,
                ]}
              />
            )}

            {detailTab === 'gift_cards' && (
              <DetailSection
                items={det.gift_cards ?? []}
                empty="No gift voucher activity on this date."
                columns={['Receipt #','Card (last 4)','Type','Amount']}
                render={g => [
                  <code style={s.code}>{g.receipt_number}</code>,
                  <code style={s.code}>···· {g.gift_card_last4}</code>,
                  <Tag text={g.activity_type} />,
                  <span style={{ color:'#0ea5e9', fontWeight:700 }}>£{f2(g.amount)}</span>,
                ]}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricRow({ label, manager, square, variance, bold }) {
  const isNeg = variance < -0.01, isPos = variance > 0.01;
  return (
    <div style={{ ...s.metricRow, fontWeight: bold ? 700 : 400, borderTop: bold ? '1px solid #f1f5f9' : 'none', paddingTop: bold ? 8 : 0, marginTop: bold ? 4 : 0 }}>
      <span style={{ color: '#64748b', fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13 }}>£{f2(manager)}</span>
      <span style={{ fontSize: 13 }}>£{f2(square)}</span>
      <span style={{ fontSize: 13, color: isNeg ? '#ef4444' : isPos ? '#22c55e' : '#94a3b8' }}>
        {isNeg ? `−£${f2(Math.abs(variance))}` : isPos ? `+£${f2(variance)}` : '—'}
      </span>
    </div>
  );
}

function ExtraChip({ label, value, warn }) {
  return (
    <div style={{ ...s.chip, background: warn ? '#fef9c3' : '#f8fafc', borderColor: warn ? '#fde68a' : '#e2e8f0' }}>
      <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: warn ? '#92400e' : '#374151' }}>£{f2(value)}</span>
    </div>
  );
}

function DetailSection({ items, columns, render, empty }) {
  if (!items.length) return <p style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>{empty}</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.dtTable}>
        <thead><tr>{columns.map(c => <th key={c} style={s.dtTh}>{c}</th>)}</tr></thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              {render(item).map((cell, j) => <td key={j} style={s.dtTd}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tag({ text, light }) {
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: light ? '#f1f5f9' : '#e0e7ff', color: light ? '#64748b' : '#3730a3', fontWeight: 600 }}>{text}</span>;
}

const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
function today() { return new Date().toISOString().slice(0, 10); }

// ── styles ────────────────────────────────────────────────────────────────────
const s = {
  root:  { display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' },
  left:  { display: 'flex', flexDirection: 'column', gap: 16 },
  right: { display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 88 },

  card:      { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#0f172a' },
  hint:      { fontSize: 13, color: '#64748b' },

  venueBtns:      { display: 'flex', flexDirection: 'column', gap: 8 },
  venueBtn:       { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 9, border: '2px solid #e2e8f0', background: '#fff', fontSize: 14, color: '#374151', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
  venueBtnActive: { border: '2px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8' },
  venueInitial:   { width: 28, height: 28, borderRadius: 7, background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },

  modeTabs: { display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, padding: 3, gap: 3 },
  modeTab:  { flex: 1, padding: '7px 0', border: 'none', background: 'none', fontSize: 13, color: '#64748b', borderRadius: 6, cursor: 'pointer' },
  modeActive:{ flex: 1, padding: '7px 0', border: 'none', background: '#f8fafc', fontSize: 13, color: '#0f172a', borderRadius: 6, fontWeight: 700, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', cursor: 'pointer' },

  ftTabs:   { display: 'flex', gap: 6 },
  ftTab:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 11, color: '#64748b', cursor: 'pointer', fontWeight: 500, flex: 1 },
  ftActive: { border: '1px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8' },

  drop:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: '2px dashed #e2e8f0', borderRadius: 10, padding: '22px 16px', cursor: 'pointer', textAlign: 'center' },
  dropActive: { borderColor: '#3b82f6', background: '#eff6ff' },

  manualGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600, color: '#374151' },
  input:      { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 14, color: '#0f172a', width: '100%' },

  err:     { color: '#ef4444', fontSize: 13 },
  btnRow:  { display: 'flex', gap: 8 },
  btn:     { padding: '9px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnSec:  { padding: '9px 18px', background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer' },

  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 20px' },

  statusBanner: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid' },
  flag:         { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fef9c3', borderRadius: 7, fontSize: 13, color: '#92400e' },
  flagDot:      { width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 },

  metricsHeader: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, padding: '4px 0' },
  metricRow:     { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '3px 0' },

  sqExtras: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  chip:     { padding: '10px 12px', borderRadius: 8, border: '1px solid', display: 'flex', flexDirection: 'column', gap: 3 },

  notes: { padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#374151' },

  detailTabRow: { display: 'flex', gap: 4, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 },
  dtab:         { padding: '6px 14px', border: 'none', background: 'none', fontSize: 13, color: '#64748b', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  dtabActive:   { background: '#f1f5f9', color: '#0f172a', fontWeight: 700 },
  badge:        { fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#ef4444', color: '#fff' },

  dtTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  dtTh:    { padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #f1f5f9' },
  dtTd:    { padding: '9px 10px', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' },
  code:    { fontFamily: 'monospace', fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: '#374151' },
};
