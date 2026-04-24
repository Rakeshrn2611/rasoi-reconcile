import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const today      = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };
const yearStart  = () => `${new Date().getFullYear()}-01-01`;

export default function CashSales({ selectedVenue, venues, showToast }) {
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
      const data = await api.getSummary(p);
      setRows(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }

  function setPreset(preset) {
    const now = new Date();
    if (preset === 'month') { setFrom(monthStart()); setTo(today()); }
    else if (preset === 'last') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(d.toISOString().slice(0, 10));
      setTo(last.toISOString().slice(0, 10));
    }
    else if (preset === 'year') { setFrom(yearStart()); setTo(today()); }
    else { setFrom('2022-01-01'); setTo(today()); }
  }

  function updateRowCash(id, val) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, actual_cash_held: val } : r));
  }

  const totals = useMemo(() => rows.reduce((a, r) => {
    const actual    = r.actual_cash_held != null ? Number(r.actual_cash_held) : null;
    const petty     = r.petty_cash || 0;
    const mgr       = r.physical_cash || 0;
    const totalCash = actual != null ? actual + petty : null;
    const sqCash    = r.sq_cash != null ? Number(r.sq_cash) : null;
    return {
      managerCash:    a.managerCash    + mgr,
      actualCash:     a.actualCash     + (actual ?? 0),
      actualEntries:  a.actualEntries  + (actual != null ? 1 : 0),
      petty:          a.petty          + petty,
      totalCash:      a.totalCash      + (totalCash ?? 0),
      totalCashEntries: a.totalCashEntries + (totalCash != null ? 1 : 0),
      sqCash:         a.sqCash         + (sqCash ?? 0),
      sqCashEntries:  a.sqCashEntries  + (sqCash != null ? 1 : 0),
    };
  }, { managerCash:0, actualCash:0, actualEntries:0, petty:0, totalCash:0, totalCashEntries:0, sqCash:0, sqCashEntries:0 }), [rows]);

  const mgrVsActual  = totals.actualEntries  > 0 ? totals.actualCash - totals.managerCash : null;
  const totalVsSquare = totals.totalCashEntries > 0 && totals.sqCashEntries > 0
    ? totals.totalCash - totals.sqCash : null;

  function doExportCSV() {
    const csvRows = rows.map(r => {
      const actual    = r.actual_cash_held != null ? Number(r.actual_cash_held) : null;
      const petty     = r.petty_cash || 0;
      const mgr       = r.physical_cash || 0;
      const disc1     = actual != null ? actual - mgr : null;
      const totalCash = actual != null ? actual + petty : null;
      const sqCash    = r.sq_cash != null ? Number(r.sq_cash) : null;
      const disc2     = totalCash != null && sqCash != null ? totalCash - sqCash : null;
      return {
        Date:               r.date,
        Venue:              r.venue_name,
        'Manager Cash':     f2(mgr),
        'Actual Cash Held': actual != null ? f2(actual) : 'Not entered',
        'Mgr vs Actual':    disc1 != null ? f2(disc1) : '—',
        'Petty Cash':       f2(petty),
        'Total Cash':       totalCash != null ? f2(totalCash) : '—',
        'Square Cash':      sqCash != null ? f2(sqCash) : '—',
        'Total vs Square':  disc2 != null ? f2(disc2) : '—',
        Status:             r.sq_total != null ? 'Reconciled' : 'Pending',
      };
    });
    const keys = Object.keys(csvRows[0] || {});
    const csv  = [keys.join(','), ...csvRows.map(r => keys.map(k => `"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})), download: `cash-${from}-${to}.csv` });
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

      {/* Step-by-step cash summary */}
      <div style={s.cashBox}>
        <p style={s.cashBoxTitle}>Cash Flow — Period Summary</p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6,1fr)', gap: 10, marginTop: 12 }}>
          <SummaryStep num="1" label="Manager Cash" value={totals.managerCash} />
          <SummaryStep num="2" label="Actual Cash Held" value={totals.actualEntries > 0 ? totals.actualCash : null} empty="Enter below ↓" />
          <SummaryStep
            num="3" label="Mgr vs Actual"
            value={mgrVsActual}
            diff
            empty={totals.actualEntries === 0 ? 'Awaiting entry' : null}
          />
          <SummaryStep num="4" label="Petty Cash" value={totals.petty} color="#c88a2e" />
          <SummaryStep num="5" label="Total Cash (Actual+Petty)" value={totals.totalCashEntries > 0 ? totals.totalCash : null} color="#2563eb" empty="Awaiting actual" />
          <SummaryStep
            num="6" label="Total vs Square Cash"
            value={totalVsSquare}
            diff
            empty={totals.sqCashEntries === 0 ? 'No Square data' : totals.totalCashEntries === 0 ? 'Awaiting actual' : null}
          />
        </div>
        {totals.actualEntries > 0 && totals.actualEntries < rows.length && (
          <p style={{ fontSize: 11, color: '#c88a2e', marginTop: 8 }}>
            ⚠ {rows.length - totals.actualEntries} day(s) missing Actual Cash Held — enter in the table below.
          </p>
        )}
      </div>

      {/* Daily table */}
      <div style={s.tableCard}>
        <div style={s.tableHdr}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>Daily Cash Breakdown</span>
          <span style={{ fontSize: 12, color: '#a89078' }}>{rows.length} entries — click Actual Held to edit</span>
        </div>
        {loading ? <p style={s.empty}>Loading…</p>
        : !rows.length ? <p style={s.empty}>No data for this period.</p>
        : isMobile
          ? rows.map((r, i) => <MobileCard key={i} row={r} showToast={showToast} onUpdate={updateRowCash} />)
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Date','Venue','Manager Cash','Actual Held','Mgr vs Actual','Petty Cash','Total Cash','Square Cash','Total vs Square','Status'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => <DesktopRow key={i} row={r} idx={i} showToast={showToast} onUpdate={updateRowCash} />)}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── Inline editable Actual Cash cell ──────────────────────────────────────────

function EditableActual({ row, showToast, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(row.actual_cash_held != null ? String(row.actual_cash_held) : '');
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setVal(row.actual_cash_held != null ? String(row.actual_cash_held) : '');
  }, [row.actual_cash_held]);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function save() {
    if (val === '') { setEditing(false); return; }
    const num = parseFloat(val);
    if (isNaN(num)) { setEditing(false); return; }
    setSaving(true);
    try {
      await api.setActualCash(row.id, num, row.actual_cash_notes || '');
      onUpdate(row.id, num);
      showToast('Actual cash saved');
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

  const hasVal = row.actual_cash_held != null;
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to enter/edit"
      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      {hasVal
        ? <span style={{ fontWeight: 600 }}>£{f2(row.actual_cash_held)}</span>
        : <span style={{ fontSize: 11, color: '#c88a2e', fontStyle: 'italic' }}>Enter ✎</span>
      }
      <span style={{ fontSize: 10, color: '#c9a87c' }}>✎</span>
    </span>
  );
}

// ── Desktop row ───────────────────────────────────────────────────────────────

function DesktopRow({ row, idx, showToast, onUpdate }) {
  const mgr       = row.physical_cash || 0;
  const actual    = row.actual_cash_held != null ? Number(row.actual_cash_held) : null;
  const petty     = row.petty_cash || 0;
  const disc1     = actual != null ? actual - mgr : null;
  const totalCash = actual != null ? actual + petty : null;
  const sqCash    = row.sq_cash != null ? Number(row.sq_cash) : null;
  const disc2     = totalCash != null && sqCash != null ? totalCash - sqCash : null;
  const isMajor   = (disc1 != null && Math.abs(disc1) > 5) || (disc2 != null && Math.abs(disc2) > 5);
  const isMinor   = !isMajor && ((disc1 != null && Math.abs(disc1) > 0) || (disc2 != null && Math.abs(disc2) > 0));

  const bg = isMajor ? '#fff5f5' : isMinor ? '#fffbeb' : idx % 2 === 0 ? '#fff' : '#fefcf9';

  return (
    <tr style={{ background: bg }}>
      <td style={s.td}>{fDate(row.date)}</td>
      <td style={s.td}><VenuePill name={row.venue_name} /></td>
      <td style={{ ...s.td, textAlign: 'right' }}>£{f2(mgr)}</td>
      <td style={{ ...s.td }}>
        <EditableActual row={row} showToast={showToast} onUpdate={onUpdate} />
      </td>
      <td style={{ ...s.td, textAlign: 'right' }}>
        <DiffCell value={disc1} />
      </td>
      <td style={{ ...s.td, textAlign: 'right', color: '#c88a2e' }}>£{f2(petty)}</td>
      <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#2563eb' }}>
        {totalCash != null ? `£${f2(totalCash)}` : <span style={{ color: '#a89078', fontSize: 11 }}>—</span>}
      </td>
      <td style={{ ...s.td, textAlign: 'right' }}>
        {sqCash != null ? `£${f2(sqCash)}` : <span style={{ color: '#a89078', fontSize: 11 }}>No data</span>}
      </td>
      <td style={{ ...s.td, textAlign: 'right' }}>
        <DiffCell value={disc2} />
      </td>
      <td style={s.td}>
        <StatusPill row={row} />
      </td>
    </tr>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function MobileCard({ row, showToast, onUpdate }) {
  const mgr       = row.physical_cash || 0;
  const actual    = row.actual_cash_held != null ? Number(row.actual_cash_held) : null;
  const petty     = row.petty_cash || 0;
  const disc1     = actual != null ? actual - mgr : null;
  const totalCash = actual != null ? actual + petty : null;
  const sqCash    = row.sq_cash != null ? Number(row.sq_cash) : null;
  const disc2     = totalCash != null && sqCash != null ? totalCash - sqCash : null;
  const isMajor   = (disc1 != null && Math.abs(disc1) > 5) || (disc2 != null && Math.abs(disc2) > 5);

  return (
    <div style={{ ...s.mCard, borderLeft: `3px solid ${isMajor ? '#c1440e' : disc1 != null ? '#b5d08a' : '#ede8e0'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#2d1f14' }}>{fDate(row.date)}</span>
        <StatusPill row={row} />
      </div>
      <VenuePill name={row.venue_name} />

      {/* Step-by-step */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={s.mStep}><span style={s.mStepLbl}>① Manager Cash</span><span>£{f2(mgr)}</span></div>
        <div style={s.mStep}>
          <span style={s.mStepLbl}>② Actual Cash Held</span>
          <EditableActual row={row} showToast={showToast} onUpdate={onUpdate} />
        </div>
        <div style={s.mStep}>
          <span style={s.mStepLbl}>③ Mgr vs Actual</span>
          <DiffCell value={disc1} />
        </div>
        <div style={s.mStep}><span style={s.mStepLbl}>④ Petty Cash (+)</span><span style={{ color: '#c88a2e' }}>£{f2(petty)}</span></div>
        <div style={s.mStep}>
          <span style={s.mStepLbl}>⑤ Total Cash</span>
          <span style={{ fontWeight: 700, color: '#2563eb' }}>{totalCash != null ? `£${f2(totalCash)}` : '—'}</span>
        </div>
        <div style={s.mStep}><span style={s.mStepLbl}>Square Cash</span><span>{sqCash != null ? `£${f2(sqCash)}` : '—'}</span></div>
        <div style={s.mStep}>
          <span style={s.mStepLbl}>⑥ Total vs Square</span>
          <DiffCell value={disc2} />
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SummaryStep({ num, label, value, diff, empty, color }) {
  const hasVal = value != null;
  let displayColor = color || '#2d1f14';
  let displayVal = '—';

  if (hasVal) {
    if (diff) {
      const abs = Math.abs(value);
      displayColor = abs < 0.01 ? '#4a6622' : abs > 5 ? '#991b1b' : '#7c5200';
      displayVal = abs < 0.01 ? '✓ Match' : value > 0 ? `+£${f2(abs)}` : `−£${f2(abs)}`;
    } else {
      displayVal = `£${f2(value)}`;
    }
  }

  return (
    <div style={{
      border: `1.5px solid ${diff && hasVal && Math.abs(value) > 5 ? '#fca5a5' : diff && hasVal ? '#f0c97a' : '#ede8e0'}`,
      borderRadius: 10, padding: '12px 14px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 9, color: '#a89078', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step {num}</span>
      <span style={{ fontSize: 10, color: '#7d6553' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: hasVal ? displayColor : '#a89078', marginTop: 4 }}>
        {hasVal ? displayVal : (empty || '—')}
      </span>
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

function StatusPill({ row }) {
  if (row.sq_locked === 1) return <Pill label="Locked"     bg="#eff6ff" color="#1e40af" border="#93c5fd" />;
  if (row.sq_total != null) return <Pill label="Reconciled" bg="#f0f5e8" color="#4a6622" border="#b5d08a" />;
  return <Pill label="Pending" bg="#fdf5e0" color="#7c5200" border="#f0c97a" />;
}

function Pill({ label, bg, color, border }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: bg, color, border: `1px solid ${border}` }}>{label}</span>;
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
  exportBtn:   { marginLeft: 'auto', padding: '7px 14px', background: '#2d1f14', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  cashBox:     { background: '#fff', borderRadius: 14, border: '2px solid #e8dcc8', padding: '18px 20px' },
  cashBoxTitle:{ fontSize: 12, fontWeight: 700, color: '#2d1f14', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' },
  tableCard:   { background: '#fff', borderRadius: 12, border: '1px solid #ede8e0', overflow: 'hidden' },
  tableHdr:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f5ede0' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f5ede0', whiteSpace: 'nowrap' },
  td:          { padding: '10px 12px', fontSize: 13, color: '#4a3728', borderBottom: '1px solid #faf5ee', verticalAlign: 'middle' },
  empty:       { padding: 40, textAlign: 'center', color: '#a89078', fontSize: 14 },
  mCard:       { padding: '14px 16px', borderBottom: '1px solid #f5ede0', display: 'flex', flexDirection: 'column', gap: 10 },
  mStep:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#2d1f14' },
  mStepLbl:    { fontSize: 12, color: '#7d6553' },
};
