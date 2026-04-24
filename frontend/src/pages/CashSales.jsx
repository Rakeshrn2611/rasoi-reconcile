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

  function setPreset(v) {
    const now = new Date();
    if (v === 'month') { setFrom(monthStart()); setTo(today()); }
    else if (v === 'last') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(s.toISOString().slice(0, 10)); setTo(e.toISOString().slice(0, 10));
    }
    else if (v === 'year') { setFrom(yearStart()); setTo(today()); }
    else { setFrom('2022-01-01'); setTo(today()); }
  }

  function updateRow(id, actual) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, actual_cash_held: actual } : r));
  }

  // Period totals
  const totals = useMemo(() => rows.reduce((a, r) => {
    const mgr    = r.physical_cash || 0;
    const petty  = r.petty_cash    || 0;
    const actual = r.actual_cash_held != null ? Number(r.actual_cash_held) : null;
    return {
      manager:       a.manager       + mgr,
      petty:         a.petty         + petty,
      actual:        a.actual        + (actual ?? 0),
      actualCount:   a.actualCount   + (actual != null ? 1 : 0),
      totalCash:     a.totalCash     + (actual != null ? actual + petty : 0),
      totalCount:    a.totalCount    + (actual != null ? 1 : 0),
      sqCash:        a.sqCash        + (r.sq_cash != null ? Number(r.sq_cash) : 0),
      sqCount:       a.sqCount       + (r.sq_cash != null ? 1 : 0),
    };
  }, { manager: 0, petty: 0, actual: 0, actualCount: 0, totalCash: 0, totalCount: 0, sqCash: 0, sqCount: 0 }), [rows]);

  const pendingEntry = rows.length - totals.actualCount;

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
      </div>

      {/* How-it-works note */}
      <div style={s.infoBox}>
        <strong>Cash Sales — Cash Verification</strong> · Manager Cash and Petty Cash are auto-filled from the Manager Report.
        Enter <em>Actual Cash Held</em> here (accounts team only). This value is used automatically in Reconciliation — no re-entry needed.
      </div>

      {/* Period summary */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 10 }}>
        <KPI label="Manager Cash" value={totals.manager} color="#2d1f14" />
        <KPI label="Petty Cash"   value={totals.petty}   color="#c88a2e" />
        <KPI label="Actual Cash Held" value={totals.actualCount > 0 ? totals.actual : null} color="#2563eb" empty={pendingEntry > 0 ? `${pendingEntry} day(s) pending` : '—'} />
        <KPI label="Total Cash (Actual + Petty)"
          value={totals.totalCount > 0 ? totals.totalCash : null}
          color="#5a7a30" empty="Awaiting entry" />
        <KPI label="Square Cash"
          value={totals.sqCount > 0 ? totals.sqCash : null}
          color="#1e40af" empty="No Square data" />
        <KPI label="Total Cash vs Square"
          value={totals.totalCount > 0 && totals.sqCount > 0 ? totals.totalCash - totals.sqCash : null}
          diff color="#7c5200" empty={totals.totalCount === 0 ? 'Awaiting entry' : 'No Square data'} />
      </div>

      {pendingEntry > 0 && (
        <div style={s.warningBox}>
          ⚠ <strong>{pendingEntry} day{pendingEntry !== 1 ? 's' : ''}</strong> still need Actual Cash Held to be entered.
          Click the value in the "Actual Held" column to enter.
        </div>
      )}

      {/* Daily table */}
      <div style={s.tableCard}>
        <div style={s.tableHdr}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>Daily Cash Verification</span>
          <span style={{ fontSize: 12, color: '#a89078' }}>{rows.length} entries</span>
        </div>

        {loading ? <p style={s.empty}>Loading…</p>
        : !rows.length ? <p style={s.empty}>No data for this period.</p>
        : isMobile
          ? rows.map((r, i) => <MobileCard key={i} row={r} showToast={showToast} onUpdate={updateRow} />)
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Venue</th>
                    <th style={{ ...s.th, background: '#faf7f2' }}>Manager Cash <ReadOnlyBadge /></th>
                    <th style={{ ...s.th, background: '#faf7f2' }}>Petty Cash <ReadOnlyBadge /></th>
                    <th style={{ ...s.th, background: '#f0f5ff' }}>Actual Held ✎</th>
                    <th style={s.th}>Mgr vs Actual</th>
                    <th style={{ ...s.th, color: '#5a7a30' }}>Total Cash</th>
                    <th style={{ ...s.th, color: '#1e40af' }}>Square Cash</th>
                    <th style={{ ...s.th, color: '#c1440e' }}>vs Square</th>
                    <th style={s.th}>Status</th>
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

// ── Desktop row ───────────────────────────────────────────────────────────────

function DesktopRow({ row, idx, showToast, onUpdate }) {
  const mgr      = row.physical_cash || 0;
  const petty    = row.petty_cash    || 0;
  const actual   = row.actual_cash_held != null ? Number(row.actual_cash_held) : null;
  const disc     = actual != null ? actual - mgr   : null;
  const total    = actual != null ? actual + petty : null;
  const sqCash   = row.sq_cash != null ? Number(row.sq_cash) : null;
  const vsSquare = total != null && sqCash != null ? total - sqCash : null;
  const isMajor  = (disc != null && Math.abs(disc) > 5) || (vsSquare != null && Math.abs(vsSquare) > 5);
  const isMinor  = !isMajor && ((disc != null && Math.abs(disc) > 0) || (vsSquare != null && Math.abs(vsSquare) > 0));

  return (
    <tr style={{ background: isMajor ? '#fff5f5' : isMinor ? '#fffbeb' : idx % 2 === 0 ? '#fff' : '#fefcf9' }}>
      <td style={s.td}>{fDate(row.date)}</td>
      <td style={s.td}><VenuePill name={row.venue_name} /></td>
      <td style={{ ...s.td, background: '#fafaf8', textAlign: 'right', color: '#2d1f14', fontWeight: 500 }}>£{f2(mgr)}</td>
      <td style={{ ...s.td, background: '#fafaf8', textAlign: 'right', color: '#c88a2e' }}>£{f2(petty)}</td>
      <td style={{ ...s.td, background: '#f5f8ff' }}>
        <EditableActual row={row} showToast={showToast} onUpdate={onUpdate} />
      </td>
      <td style={{ ...s.td, textAlign: 'right' }}><DiffCell value={disc} /></td>
      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#5a7a30' }}>
        {total != null ? `£${f2(total)}` : <span style={{ color: '#a89078', fontSize: 11 }}>—</span>}
      </td>
      <td style={{ ...s.td, textAlign: 'right', color: '#1e40af' }}>
        {sqCash != null ? `£${f2(sqCash)}` : <span style={{ color: '#a89078', fontSize: 11 }}>—</span>}
      </td>
      <td style={{ ...s.td, textAlign: 'right' }}><DiffCell value={vsSquare} /></td>
      <td style={s.td}><StatusPill row={row} /></td>
    </tr>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function MobileCard({ row, showToast, onUpdate }) {
  const mgr      = row.physical_cash || 0;
  const petty    = row.petty_cash    || 0;
  const actual   = row.actual_cash_held != null ? Number(row.actual_cash_held) : null;
  const disc     = actual != null ? actual - mgr   : null;
  const total    = actual != null ? actual + petty : null;
  const sqCash   = row.sq_cash != null ? Number(row.sq_cash) : null;
  const vsSquare = total != null && sqCash != null ? total - sqCash : null;
  const isMajor  = (disc != null && Math.abs(disc) > 5) || (vsSquare != null && Math.abs(vsSquare) > 5);

  return (
    <div style={{ ...s.mCard, borderLeft: `3px solid ${isMajor ? '#c1440e' : actual != null ? '#b5d08a' : '#e8dcc8'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#2d1f14' }}>{fDate(row.date)}</span>
        <StatusPill row={row} />
      </div>
      <VenuePill name={row.venue_name} />

      {/* Section 1 — Manager Data (read only) */}
      <div style={s.mSection}>
        <p style={s.mSectionTitle}>Manager Data</p>
        <div style={s.mRow}><span style={s.mLbl}>Manager Cash</span><span style={{ fontWeight: 500 }}>£{f2(mgr)}</span></div>
        <div style={s.mRow}><span style={s.mLbl}>Petty Cash</span><span style={{ color: '#c88a2e' }}>£{f2(petty)}</span></div>
      </div>

      {/* Section 2 — Actual Entry */}
      <div style={s.mSection}>
        <p style={s.mSectionTitle}>Actual Entry (Accounts)</p>
        <div style={s.mRow}>
          <span style={s.mLbl}>Actual Cash Held</span>
          <EditableActual row={row} showToast={showToast} onUpdate={onUpdate} />
        </div>
      </div>

      {/* Section 3 — Calculations */}
      {actual != null && (
        <div style={s.mSection}>
          <p style={s.mSectionTitle}>Calculations</p>
          <div style={s.mRow}>
            <span style={s.mLbl}>Discrepancy (Mgr vs Actual)</span>
            <DiffCell value={disc} />
          </div>
          <div style={s.mRow}>
            <span style={s.mLbl}>Total Cash (Actual + Petty)</span>
            <span style={{ fontWeight: 700, color: '#5a7a30' }}>£{f2(total)}</span>
          </div>
          <div style={s.mRow}>
            <span style={s.mLbl}>Square Cash</span>
            <span style={{ color: '#1e40af' }}>{sqCash != null ? `£${f2(sqCash)}` : '—'}</span>
          </div>
          <div style={s.mRow}>
            <span style={s.mLbl}>Total Cash vs Square</span>
            <DiffCell value={vsSquare} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline editable Actual Cash Held ─────────────────────────────────────────

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
          style={{ width: 90, padding: '4px 7px', border: '1.5px solid #c9a87c', borderRadius: 6, fontSize: 13, background: '#fffbf5' }}
        />
        {saving && <span style={{ fontSize: 11, color: '#a89078' }}>…</span>}
      </span>
    );
  }

  const hasVal = row.actual_cash_held != null;
  return (
    <span onClick={() => setEditing(true)} title="Click to enter/edit actual cash held" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {hasVal
        ? <span style={{ fontWeight: 700, color: '#2563eb' }}>£{f2(row.actual_cash_held)}</span>
        : <span style={{ fontSize: 12, color: '#c88a2e', fontStyle: 'italic' }}>Enter ✎</span>
      }
      {hasVal && <span style={{ fontSize: 10, color: '#c9a87c' }}>✎</span>}
    </span>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function ReadOnlyBadge() {
  return <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#f5ede0', color: '#a89078', marginLeft: 4 }}>AUTO</span>;
}

function KPI({ label, value, color, diff, empty }) {
  let display = value != null ? `£${f2(value)}` : (empty || '—');
  let displayColor = color;

  if (diff && value != null) {
    const abs = Math.abs(value);
    if (abs < 0.01) { display = '✓ Match'; displayColor = '#4a6622'; }
    else { display = value > 0 ? `+£${f2(abs)}` : `−£${f2(abs)}`; displayColor = abs > 5 ? '#991b1b' : '#7c5200'; }
  }

  return (
    <div style={{ background: '#fff', border: '1.5px solid #ede8e0', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#a89078', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: value != null ? displayColor : '#c88a2e' }}>{display}</span>
    </div>
  );
}

function DiffCell({ value }) {
  if (value == null) return <span style={{ color: '#a89078', fontSize: 11 }}>—</span>;
  const abs = Math.abs(value);
  if (abs < 0.01) return <span style={{ color: '#4a6622', fontWeight: 700 }}>✓</span>;
  const color = abs > 5 ? '#991b1b' : '#7c5200';
  const bg    = abs > 5 ? '#fef2f2' : '#fffbeb';
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, background: bg, padding: '2px 7px', borderRadius: 5 }}>
      {value > 0 ? `+£${f2(abs)}` : `−£${f2(abs)}`}
    </span>
  );
}

function StatusPill({ row }) {
  if (row.sq_locked === 1)  return <Pill label="Locked"     bg="#eff6ff" color="#1e40af" border="#93c5fd" />;
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
  infoBox:     { background: '#fefcf9', border: '1px solid #e8dcc8', borderRadius: 9, padding: '10px 14px', fontSize: 12, color: '#7d6553', lineHeight: 1.5 },
  warningBox:  { background: '#fdf5e0', border: '1px solid #f0c97a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#7c5200' },
  tableCard:   { background: '#fff', borderRadius: 12, border: '1px solid #ede8e0', overflow: 'hidden' },
  tableHdr:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f5ede0' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f5ede0', whiteSpace: 'nowrap' },
  td:          { padding: '11px 12px', fontSize: 13, color: '#4a3728', borderBottom: '1px solid #faf5ee', verticalAlign: 'middle' },
  empty:       { padding: 40, textAlign: 'center', color: '#a89078', fontSize: 14 },
  mCard:       { padding: '14px 16px', borderBottom: '1px solid #f5ede0', display: 'flex', flexDirection: 'column', gap: 10 },
  mSection:    { background: '#fafaf8', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 },
  mSectionTitle:{ fontSize: 9, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 2px' },
  mRow:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 },
  mLbl:        { fontSize: 12, color: '#7d6553' },
};
