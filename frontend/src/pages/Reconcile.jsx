import React, { useState } from 'react';
import { api } from '../api/client.js';

const DETAIL_TABS = ['refunds', 'comps', 'discounts', 'gift_cards'];
const DETAIL_LABELS = { refunds: 'Refunds', comps: 'Complimentary', discounts: 'Discounts', gift_cards: 'Gift Vouchers' };

export default function Reconcile({ venues, showToast }) {
  const [venueId, setVenueId]     = useState(venues[0]?.id || '');
  const [date, setDate]           = useState(today());
  const [fetching, setFetching]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [detailTab, setDetailTab] = useState('refunds');
  const [error, setError]         = useState('');

  const selectedVenue = venues.find(v => v.id === venueId);
  const r   = result?.reconciliation;
  const det = result?.details ?? {};
  const isOk = r?.status === 'ok';

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
    if (!venueId) return setError('Select a venue.');
    setLoading(true); setError('');
    try {
      setResult(await api.reconcile(venueId, date));
    } catch (err) { setError(err.message); setResult(null); }
    setLoading(false);
  }

  return (
    <div style={s.root}>
      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <div style={s.left}>

        {/* Venue + date */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Select Date & Venue</h3>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={s.input} />
          <div style={s.venueBtns}>
            {venues.map(v => (
              <button key={v.id} onClick={() => setVenueId(v.id)}
                style={{ ...s.venueBtn, ...(venueId === v.id ? s.venueBtnActive : {}) }}>
                <span style={{ ...s.venueInitial, background: v.id === 'venue-rik' ? '#c1440e' : '#2563eb' }}>{v.name[0]}</span>
                {v.name}
              </button>
            ))}
          </div>
        </div>

        {/* Square data actions */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Square Data</h3>
          <p style={s.hint}>
            {selectedVenue?.square_location_id
              ? 'Fetch live payments, refunds, discounts, comps and gift vouchers from Square.'
              : 'No Square location ID set — add it in Settings.'}
          </p>
          {error && <p style={s.err}>{error}</p>}
          <div style={s.btnRow}>
            <button onClick={handleFetchSquare} disabled={fetching || !selectedVenue?.square_location_id} style={s.btnSec}>
              {fetching ? 'Fetching…' : 'Fetch from Square'}
            </button>
            <button onClick={loadReconcile} disabled={loading} style={s.btn}>
              {loading ? 'Loading…' : 'Reconcile'}
            </button>
          </div>
        </div>

        {/* Manager report summary */}
        {result?.report && (
          <div style={s.card}>
            <h3 style={s.cardTitle}>Manager Report</h3>
            <div style={s.repGrid}>
              <RepRow label="Cash Sales"    value={result.report.cash_sales} />
              <RepRow label="Physical Cash" value={result.reconciliation?.countedCash} accent />
              <RepRow label="Card Sales"    value={result.report.card_sales} />
              <RepRow label="Deposits Used" value={result.report.deposits_used} />
              <RepRow label="Gift Vouchers" value={result.report.gift_cards_redeemed} />
              <RepRow label="Petty Cash"    value={result.report.petty_cash} />
              <RepRow label="Grand Total"   value={result.report.grand_total || result.report.total_sales} bold />
            </div>
            {result.report.petty_cash > 0 && result.report.petty_cash_notes && (
              <div style={s.noteBox}><strong>Petty cash:</strong> {result.report.petty_cash_notes}</div>
            )}
            {result.report.shift_notes && (
              <div style={s.noteBox}><strong>Shift notes:</strong> {result.report.shift_notes}</div>
            )}
          </div>
        )}

        {/* Manager discounts tracked separately */}
        {result?.report && (
          <div style={s.card}>
            <h3 style={s.cardTitle}>Tracked Separately</h3>
            <div style={s.repGrid}>
              <DiscRow label="Staff Discount"   value={result.report.staff_discount}   notes={result.report.staff_discount_notes} />
              <DiscRow label="F&F Discount"     value={result.report.fnf_discount}     notes={result.report.fnf_discount_notes} />
              <DiscRow label="Complimentary"    value={result.report.complimentary}    notes={result.report.complimentary_notes} />
              <DiscRow label="Card Tips"        value={result.report.card_tips} />
              <DiscRow label="Cash Tips"        value={result.report.cash_tips} />
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel ──────────────────────────────────────────────────── */}
      <div style={s.right}>

        {/* Reconciliation comparison */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Reconciliation Result</h3>
          {!result ? (
            <div style={s.placeholder}>
              <span style={{ fontSize: 40 }}>⚖</span>
              <p style={{ fontSize: 14, color: '#a89078', textAlign: 'center' }}>
                Select a venue and date, then click <strong>Reconcile</strong> to compare manager report against Square.
              </p>
            </div>
          ) : (
            <>
              {/* Status banner */}
              <div style={{ ...s.statusBanner, background: isOk ? '#f0f5e8' : '#fdf5e0', borderColor: isOk ? '#b5d08a' : '#f0c97a' }}>
                <span style={{ fontSize: 22 }}>{isOk ? '✓' : '⚠'}</span>
                <div>
                  <p style={{ fontWeight: 700, color: isOk ? '#4a6622' : '#7c5200', margin: 0 }}>
                    {isOk ? 'All figures match' : `${r.flags.length} variance${r.flags.length !== 1 ? 's' : ''} found`}
                  </p>
                  <p style={{ fontSize: 12, color: '#7d6553', marginTop: 2 }}>
                    {selectedVenue?.name} · {fDate(date)}
                  </p>
                </div>
              </div>

              {/* Flags */}
              {r.flags.map((f, i) => (
                <div key={i} style={s.flag}><span style={s.flagDot}/>{f.message}</div>
              ))}

              {/* Comparison table */}
              <div style={s.compHeader}>
                <span style={s.colHd}>Category</span>
                <span style={{ ...s.colHd, textAlign: 'right' }}>Square</span>
                <span style={{ ...s.colHd, textAlign: 'right' }}>Manager</span>
                <span style={{ ...s.colHd, textAlign: 'right' }}>Variance</span>
              </div>
              <CompRow label="Cash"  square={result.square.cash}  manager={r.countedCash}                           variance={r.cashVar} />
              <CompRow label="Card"  square={result.square.card}  manager={result.report.card_sales}                variance={r.cardVar} />
              <CompRow label="Total" square={result.square.total} manager={result.report.grand_total || result.report.total_sales} variance={r.totalVar} bold />

              {/* Cash breakdown */}
              {r.countedCash !== result.report.cash_sales && result.report.physical_cash > 0 && (
                <div style={s.cashBreak}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#7d6553', margin: '0 0 6px' }}>Cash Denomination Count</p>
                  <div style={s.denomGrid}>
                    {[
                      { lbl:'£50', k:'notes_50', mul:50 }, { lbl:'£20', k:'notes_20', mul:20 },
                      { lbl:'£10', k:'notes_10', mul:10 }, { lbl:'£5',  k:'notes_5',  mul:5  },
                      { lbl:'£2',  k:'coins_200',mul:2  }, { lbl:'£1',  k:'coins_100',mul:1  },
                      { lbl:'50p', k:'coins_50', mul:.5 }, { lbl:'20p', k:'coins_20', mul:.2 },
                      { lbl:'10p', k:'coins_10', mul:.1 },
                    ].filter(d => result.report[d.k] > 0).map(d => (
                      <div key={d.k} style={s.denomChip}>
                        <span style={{ fontSize: 10, color: '#7d6553' }}>{d.lbl}</span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>×{result.report[d.k]}</span>
                        <span style={{ fontSize: 11, color: '#a89078' }}>£{f2(result.report[d.k] * d.mul)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={s.totalRow}>
                    <span style={{ fontSize: 13, color: '#4a3728' }}>Physical cash counted</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#2d1f14' }}>£{f2(r.countedCash)}</span>
                  </div>
                </div>
              )}

              {/* Square extras */}
              <div style={s.sqExtras}>
                <ExtraChip label="Refunds"    value={result.square.refunds}    warn={result.square.refunds > 0} />
                <ExtraChip label="Discounts"  value={result.square.discounts}  warn={result.square.discounts > 200} />
                <ExtraChip label="Comps"      value={result.square.comps}      warn={result.square.comps > 50} />
                <ExtraChip label="Gift Cards" value={result.square.gift_cards} />
              </div>
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
                  <span style={{ color:'#c1440e', fontWeight:700 }}>£{f2(r.amount)}</span>,
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
                  <span style={{ color:'#c88a2e', fontWeight:700 }}>£{f2(c.amount)}</span>,
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
                  <span style={{ color:'#7c5c2e', fontWeight:700 }}>£{f2(d.amount)}</span>,
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
                  <span style={{ color:'#2563eb', fontWeight:700 }}>£{f2(g.amount)}</span>,
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

function CompRow({ label, square, manager, variance, bold }) {
  return (
    <div style={{ ...s.compRow, fontWeight: bold ? 700 : 400, borderTop: bold ? '1px solid #f5ede0' : 'none', paddingTop: bold ? 8 : 0, marginTop: bold ? 4 : 0 }}>
      <span style={{ color: '#7d6553', fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, textAlign: 'right' }}>£{f2(square)}</span>
      <span style={{ fontSize: 13, textAlign: 'right' }}>£{f2(manager)}</span>
      <VarBadge value={variance} />
    </div>
  );
}

function VarBadge({ value }) {
  const abs = Math.abs(value || 0);
  if (abs < 0.01) return <span style={{ fontSize: 12, color: '#5a7a30', fontWeight: 700, textAlign: 'right' }}>✓</span>;
  const neg = value < 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: neg ? '#c1440e' : '#5a7a30' }}>
      {neg ? `−£${f2(abs)}` : `+£${f2(abs)}`}
    </span>
  );
}

function RepRow({ label, value, bold, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f9f4ef', fontWeight: bold ? 700 : 400 }}>
      <span style={{ fontSize: 13, color: '#7d6553' }}>{label}</span>
      <span style={{ fontSize: 13, color: accent ? '#c1440e' : '#2d1f14' }}>£{f2(value)}</span>
    </div>
  );
}

function DiscRow({ label, value, notes }) {
  if (!value && !notes) return null;
  return (
    <div style={{ padding: '5px 0', borderBottom: '1px solid #f9f4ef' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#7d6553' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#2d1f14' }}>£{f2(value)}</span>
      </div>
      {notes && <p style={{ fontSize: 11, color: '#a89078', margin: '2px 0 0' }}>{notes}</p>}
    </div>
  );
}

function ExtraChip({ label, value, warn }) {
  return (
    <div style={{ ...s.chip, background: warn ? '#fdf5e0' : '#fefcf9', borderColor: warn ? '#e8c97a' : '#ede8e0' }}>
      <span style={{ fontSize: 10, color: '#7d6553', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: warn ? '#7c3d0e' : '#4a3728' }}>£{f2(value)}</span>
    </div>
  );
}

function DetailSection({ items, columns, render, empty }) {
  if (!items.length) return <p style={{ color: '#a89078', fontSize: 13, padding: '12px 0' }}>{empty}</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.dtTable}>
        <thead><tr>{columns.map(c => <th key={c} style={s.dtTh}>{c}</th>)}</tr></thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fefcf9' }}>
              {render(item).map((cell, j) => <td key={j} style={s.dtTd}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tag({ text, light }) {
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: light ? '#f5ede0' : '#fef3ee', color: light ? '#7d6553' : '#9a2e05', fontWeight: 600 }}>{text}</span>;
}

const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
function today() { return new Date().toISOString().slice(0, 10); }

// ── styles ────────────────────────────────────────────────────────────────────
const s = {
  root:  { display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' },
  left:  { display: 'flex', flexDirection: 'column', gap: 16 },
  right: { display: 'flex', flexDirection: 'column', gap: 16 },

  card:      { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(45,31,20,0.06)', border: '1px solid #ede8e0', display: 'flex', flexDirection: 'column', gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#2d1f14' },
  hint:      { fontSize: 13, color: '#7d6553' },

  venueBtns:      { display: 'flex', flexDirection: 'column', gap: 8 },
  venueBtn:       { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 9, border: '2px solid #ede8e0', background: '#fff', fontSize: 14, color: '#4a3728', fontWeight: 500, cursor: 'pointer' },
  venueBtnActive: { border: '2px solid #c1440e', background: '#fef3ee', color: '#9a2e05' },
  venueInitial:   { width: 28, height: 28, borderRadius: 7, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },

  input:   { padding: '8px 10px', border: '1px solid #ede8e0', borderRadius: 7, fontSize: 14, color: '#2d1f14', width: '100%', boxSizing: 'border-box' },
  err:     { color: '#c1440e', fontSize: 13, margin: 0 },
  btnRow:  { display: 'flex', gap: 8 },
  btn:     { padding: '9px 18px', background: '#c1440e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnSec:  { padding: '9px 18px', background: '#fefcf9', color: '#4a3728', border: '1px solid #ede8e0', borderRadius: 8, fontSize: 14, cursor: 'pointer' },

  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 20px' },

  statusBanner: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid' },
  flag:         { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fdf5e0', borderRadius: 7, fontSize: 13, color: '#7c3d0e' },
  flagDot:      { width: 6, height: 6, borderRadius: '50%', background: '#c88a2e', flexShrink: 0 },

  compHeader: { display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px', gap: 8, padding: '4px 0' },
  compRow:    { display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px', gap: 8, alignItems: 'center', padding: '4px 0' },
  colHd:      { color: '#a89078', fontSize: 11, fontWeight: 700 },

  repGrid: { display: 'flex', flexDirection: 'column', gap: 0 },

  cashBreak: { background: '#fefcf9', border: '1px solid #f0e8dc', borderRadius: 9, padding: 14 },
  denomGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  denomChip: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 10px', background: '#fff', border: '1px solid #ede8e0', borderRadius: 8 },
  totalRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #ede8e0', paddingTop: 8 },

  sqExtras: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  chip:     { padding: '10px 12px', borderRadius: 8, border: '1px solid', display: 'flex', flexDirection: 'column', gap: 3 },

  noteBox: { padding: '8px 12px', background: '#fefcf9', borderRadius: 7, fontSize: 12, color: '#4a3728', borderLeft: '3px solid #c1440e' },

  detailTabRow: { display: 'flex', gap: 4, borderBottom: '1px solid #f5ede0', paddingBottom: 12 },
  dtab:         { padding: '6px 14px', border: 'none', background: 'none', fontSize: 13, color: '#7d6553', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  dtabActive:   { background: '#fefcf9', color: '#2d1f14', fontWeight: 700 },
  badge:        { fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#c1440e', color: '#fff' },

  dtTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  dtTh:    { padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #f5ede0' },
  dtTd:    { padding: '9px 10px', borderBottom: '1px solid #f5ede0', verticalAlign: 'middle' },
  code:    { fontFamily: 'monospace', fontSize: 12, background: '#f5ede0', padding: '2px 6px', borderRadius: 4, color: '#4a3728' },
};
