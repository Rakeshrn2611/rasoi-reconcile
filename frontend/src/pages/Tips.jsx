import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const today      = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };
const yearStart  = () => `${new Date().getFullYear()}-01-01`;

export default function Tips({ selectedVenue, venues, showToast }) {
  const isMobile = useIsMobile();
  const [from, setFrom]   = useState(monthStart());
  const [to, setTo]       = useState(today());
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(true);

  const venueName = selectedVenue === 'all' ? 'All Venues' : venues.find(v => v.id === selectedVenue)?.name ?? '';

  useEffect(() => { load(); }, [selectedVenue, from, to]);

  async function load() {
    setLoading(true);
    try {
      const p = { from, to };
      if (selectedVenue !== 'all') p.venue_id = selectedVenue;
      const data = await api.getTips(p);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) { showToast(err.message, 'error'); }
    setLoading(false);
  }

  function setPreset(preset) {
    const now = new Date();
    if (preset === 'month') { setFrom(monthStart()); setTo(today()); }
    else if (preset === 'last') {
      const d    = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(d.toISOString().slice(0, 10));
      setTo(last.toISOString().slice(0, 10));
    }
    else if (preset === 'year') { setFrom(yearStart()); setTo(today()); }
    else { setFrom('2022-01-01'); setTo(today()); }
  }

  function updateRow(id, field, val) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  }

  const totals = useMemo(() => rows.reduce((a, r) => {
    const cardMgr   = r.card_tips || 0;
    const sqCard    = r.sq_card_tips != null ? Number(r.sq_card_tips) : null;
    const cashMgr   = r.cash_tips || 0;
    const cashFinal = r.cash_tips_final != null ? Number(r.cash_tips_final) : null;
    const totalCard = cardMgr;
    const totalCash = cashFinal ?? cashMgr;
    return {
      cardMgr:       a.cardMgr       + cardMgr,
      sqCard:        a.sqCard        + (sqCard ?? 0),
      sqCardEntries: a.sqCardEntries + (sqCard != null ? 1 : 0),
      cashMgr:       a.cashMgr       + cashMgr,
      cashFinal:     a.cashFinal     + (cashFinal ?? cashMgr),
      totalTips:     a.totalTips     + totalCard + totalCash,
    };
  }, { cardMgr:0, sqCard:0, sqCardEntries:0, cashMgr:0, cashFinal:0, totalTips:0 }), [rows]);

  const cardDiscrepancy = totals.sqCardEntries > 0 ? totals.cardMgr - totals.sqCard : null;

  function doExportCSV() {
    const csvRows = rows.map(r => ({
      Date:                      r.date,
      Venue:                     r.venue_name,
      'Card Tips (Manager)':     f2(r.card_tips),
      'Card Tips (Square)':      r.sq_card_tips != null ? f2(r.sq_card_tips) : 'N/A',
      'Card Tips Discrepancy':   r.sq_card_tips != null ? f2((r.card_tips||0) - Number(r.sq_card_tips)) : '—',
      'Cash Tips (Manager)':     f2(r.cash_tips),
      'Cash Tips (Accounts)':    r.cash_tips_final != null ? f2(r.cash_tips_final) : 'Not entered',
      'Total Tips':              f2((r.card_tips||0) + (r.cash_tips_final ?? r.cash_tips ?? 0)),
    }));
    const keys = Object.keys(csvRows[0] || {});
    const csv  = [keys.join(','), ...csvRows.map(r => keys.map(k => `"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `tips-${from}-${to}.csv` });
    a.click();
  }

  return (
    <div style={s.root}>
      {/* Filter bar */}
      <div style={s.filterBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={s.venueBadge}>📍 {venueName}</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={s.dateInput} />
          <span style={{ color: '#a89078', fontSize: 13 }}>–</span>
          <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={s.dateInput} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['month','This Month'],['last','Last Month'],['year','This Year'],['all','All Time']].map(([v,l]) => (
            <button key={v} onClick={() => setPreset(v)} style={s.presetBtn}>{l}</button>
          ))}
        </div>
        <button onClick={doExportCSV} style={s.exportBtn}>↓ CSV</button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5,1fr)', gap: 10 }}>
        <KPI label="Card Tips (Manager)"       value={totals.cardMgr}   color="#2563eb" />
        <KPI label="Card Tips (Square)"        value={totals.sqCardEntries > 0 ? totals.sqCard : null} color="#4a6622" empty="Not available" />
        <KPI label="Card Tips Discrepancy"     value={cardDiscrepancy}  diff color="#7c5200" />
        <KPI label="Cash Tips (Manager)"       value={totals.cashMgr}   color="#5a7a30" />
        <KPI label="Cash Tips (Accounts Final)" value={totals.cashFinal} color="#c1440e" accent />
      </div>

      {/* Total tips banner */}
      <div style={s.totalBanner}>
        <div>
          <p style={{ fontSize: 11, color: '#a89078', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Total Tips (Card + Cash)</p>
          <p style={{ fontSize: 11, color: '#7d6553', margin: '2px 0 0' }}>{fDate(from)} – {fDate(to)}</p>
        </div>
        <span style={{ fontSize: 32, fontWeight: 800, color: '#c1440e', letterSpacing: '-1px' }}>£{f2(totals.totalTips)}</span>
      </div>

      {/* Tips note */}
      <div style={s.noteBox}>
        <strong>Tips data flow:</strong> Card Tips are entered by managers and can be verified against Square when available.
        Cash Tips entered by accounts team represent the final verified amount (overrides manager entry for totals).
      </div>

      {/* Daily table */}
      <div style={s.tableCard}>
        <div style={s.tableHdr}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>Daily Tips Breakdown</span>
          <span style={{ fontSize: 12, color: '#a89078' }}>{rows.length} entries — click Accounts Cash Tips to edit</span>
        </div>
        {loading ? <p style={s.empty}>Loading…</p>
        : !rows.length ? <p style={s.empty}>No tip data for this period.</p>
        : isMobile
          ? rows.map((r, i) => <MobileCard key={i} row={r} showToast={showToast} onUpdate={updateRow} />)
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Date','Venue','Card Tips (Mgr)','Card Tips (Square)','Card Disc.','Cash Tips (Mgr)','Cash Tips (Accounts)','Total Tips'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => <DesktopRow key={i} row={r} idx={i} showToast={showToast} onUpdate={updateRow} />)}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── Inline editable Cash Tips Final cell ─────────────────────────────────────

function EditableCashTips({ row, showToast, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(row.cash_tips_final != null ? String(row.cash_tips_final) : '');
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setVal(row.cash_tips_final != null ? String(row.cash_tips_final) : '');
  }, [row.cash_tips_final]);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function save() {
    if (val === '') { setEditing(false); return; }
    const num = parseFloat(val);
    if (isNaN(num)) { setEditing(false); return; }
    setSaving(true);
    try {
      await api.setCashTipsFinal(row.id, num);
      onUpdate(row.id, 'cash_tips_final', num);
      showToast('Cash tips saved');
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="number" step="0.01" min="0"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={save}
          style={{ width: 80, padding: '3px 6px', border: '1.5px solid #c9a87c', borderRadius: 5, fontSize: 13 }}
        />
        {saving && <span style={{ fontSize: 11, color: '#a89078' }}>…</span>}
      </span>
    );
  }

  const hasVal = row.cash_tips_final != null;
  return (
    <span onClick={() => setEditing(true)} title="Click to enter/edit" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {hasVal
        ? <span style={{ fontWeight: 600 }}>£{f2(row.cash_tips_final)}</span>
        : <span style={{ fontSize: 11, color: '#c88a2e', fontStyle: 'italic' }}>Enter ✎</span>
      }
      <span style={{ fontSize: 10, color: '#c9a87c' }}>✎</span>
    </span>
  );
}

// ── Desktop row ───────────────────────────────────────────────────────────────

function DesktopRow({ row, idx, showToast, onUpdate }) {
  const cardMgr   = row.card_tips || 0;
  const sqCard    = row.sq_card_tips != null ? Number(row.sq_card_tips) : null;
  const cardDisc  = sqCard != null ? cardMgr - sqCard : null;
  const cashMgr   = row.cash_tips || 0;
  const cashFinal = row.cash_tips_final != null ? Number(row.cash_tips_final) : null;
  const total     = cardMgr + (cashFinal ?? cashMgr);
  const isMajor   = cardDisc != null && Math.abs(cardDisc) > 5;

  return (
    <tr style={{ background: isMajor ? '#fff5f5' : idx % 2 === 0 ? '#fff' : '#fefcf9' }}>
      <td style={s.td}>{fDate(row.date)}</td>
      <td style={s.td}><VenuePill name={row.venue_name} /></td>
      <td style={{ ...s.td, textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>£{f2(cardMgr)}</td>
      <td style={{ ...s.td, textAlign: 'right' }}>
        {sqCard != null ? `£${f2(sqCard)}` : <span style={{ fontSize: 11, color: '#a89078' }}>N/A</span>}
      </td>
      <td style={{ ...s.td, textAlign: 'right' }}>
        <DiffCell value={cardDisc} />
      </td>
      <td style={{ ...s.td, textAlign: 'right', color: '#5a7a30', fontWeight: 600 }}>£{f2(cashMgr)}</td>
      <td style={s.td}>
        <EditableCashTips row={row} showToast={showToast} onUpdate={onUpdate} />
      </td>
      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#c1440e' }}>£{f2(total)}</td>
    </tr>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function MobileCard({ row, showToast, onUpdate }) {
  const cardMgr   = row.card_tips || 0;
  const sqCard    = row.sq_card_tips != null ? Number(row.sq_card_tips) : null;
  const cardDisc  = sqCard != null ? cardMgr - sqCard : null;
  const cashMgr   = row.cash_tips || 0;
  const cashFinal = row.cash_tips_final != null ? Number(row.cash_tips_final) : null;
  const total     = cardMgr + (cashFinal ?? cashMgr);

  return (
    <div style={s.mCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#2d1f14' }}>{fDate(row.date)}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#c1440e' }}>£{f2(total)}</span>
      </div>
      <VenuePill name={row.venue_name} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <MCell label="Card Tips (Manager)"  value={`£${f2(cardMgr)}`}  color="#2563eb" />
        <MCell label="Card Tips (Square)"   value={sqCard != null ? `£${f2(sqCard)}` : 'N/A'} color={sqCard != null ? '#4a6622' : '#a89078'} />
        {cardDisc != null && (
          <MCell label="Card Discrepancy" value={<DiffCell value={cardDisc} />} />
        )}
        <MCell label="Cash Tips (Manager)"  value={`£${f2(cashMgr)}`}  color="#5a7a30" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: '#a89078', fontWeight: 600, textTransform: 'uppercase' }}>Cash Tips (Accounts)</span>
          <EditableCashTips row={row} showToast={showToast} onUpdate={onUpdate} />
        </div>
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function KPI({ label, value, color, diff, empty, accent }) {
  let display = value != null ? `£${f2(value)}` : (empty || '—');
  let displayColor = color;
  if (diff && value != null) {
    const abs = Math.abs(value);
    if (abs < 0.01) { display = '✓ Match'; displayColor = '#4a6622'; }
    else { display = value > 0 ? `+£${f2(abs)}` : `−£${f2(abs)}`; displayColor = abs > 5 ? '#991b1b' : '#7c5200'; }
  }
  return (
    <div style={{ background: accent ? '#fef3ee' : '#fff', border: `1.5px solid ${accent ? '#f5c9a8' : '#ede8e0'}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#a89078', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: value != null ? displayColor : '#a89078' }}>{display}</span>
    </div>
  );
}

function DiffCell({ value }) {
  if (value == null) return <span style={{ color: '#a89078', fontSize: 11 }}>—</span>;
  const abs = Math.abs(value);
  if (abs < 0.01) return <span style={{ color: '#4a6622', fontWeight: 700, fontSize: 12 }}>✓</span>;
  const color = abs > 5 ? '#991b1b' : '#7c5200';
  const bg    = abs > 5 ? '#fef2f2' : '#fffbeb';
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, background: bg, padding: '2px 6px', borderRadius: 5 }}>
      {value > 0 ? `+£${f2(abs)}` : `−£${f2(abs)}`}
    </span>
  );
}

function MCell({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: '#a89078', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || '#2d1f14' }}>{value}</span>
    </div>
  );
}

function VenuePill({ name }) {
  const c = name?.includes('Waterfront') ? '#2563eb' : '#c1440e';
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: c + '18', color: c }}>{name}</span>;
}

const s = {
  root:        { display: 'flex', flexDirection: 'column', gap: 16 },
  filterBar:   { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1px solid #ede8e0' },
  venueBadge:  { fontSize: 13, fontWeight: 600, color: '#c1440e', background: '#fef3ee', padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' },
  dateInput:   { padding: '6px 10px', border: '1px solid #ede8e0', borderRadius: 7, fontSize: 13, color: '#2d1f14', background: '#fff' },
  presetBtn:   { padding: '5px 12px', background: '#faf7f2', border: '1px solid #ede8e0', borderRadius: 6, fontSize: 12, color: '#7d6553', cursor: 'pointer', whiteSpace: 'nowrap' },
  exportBtn:   { marginLeft: 'auto', padding: '7px 14px', background: '#2d1f14', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  totalBanner: { background: '#fff', borderRadius: 14, border: '2px solid #f5c9a8', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  noteBox:     { background: '#fefcf9', border: '1px solid #ede8e0', borderRadius: 9, padding: '10px 14px', fontSize: 12, color: '#7d6553' },
  tableCard:   { background: '#fff', borderRadius: 12, border: '1px solid #ede8e0', overflow: 'hidden' },
  tableHdr:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f5ede0' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f5ede0', whiteSpace: 'nowrap' },
  td:          { padding: '10px 12px', fontSize: 13, color: '#4a3728', borderBottom: '1px solid #faf5ee', verticalAlign: 'middle' },
  empty:       { padding: 40, textAlign: 'center', color: '#a89078', fontSize: 14 },
  mCard:       { padding: '14px 16px', borderBottom: '1px solid #f5ede0', display: 'flex', flexDirection: 'column', gap: 10 },
};
