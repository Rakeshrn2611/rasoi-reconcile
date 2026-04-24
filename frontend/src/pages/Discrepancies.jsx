import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const CATEGORIES = ['all', 'Cash vs Actual', 'Cash vs Square', 'Card vs Square', 'Total vs Square', 'Refunds'];
const STATUSES   = ['all', 'unresolved', 'investigated', 'resolved'];

const STATUS_COLORS = {
  unresolved:   { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  investigated: { bg: '#fdf5e0', color: '#7c5200', border: '#f0c97a' },
  resolved:     { bg: '#f0f5e8', color: '#4a6622', border: '#b5d08a' },
};

const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const today      = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };

export default function DiscrepanciesPage({ venues, showToast, selectedVenue }) {
  const isMobile = useIsMobile();
  const [from,     setFrom]    = useState(monthStart());
  const [to,       setTo]      = useState(today());
  const [category, setCategory] = useState('all');
  const [status,   setStatus]  = useState('all');
  const [rows,     setRows]    = useState([]);
  const [loading,  setLoading] = useState(true);
  const [saving,   setSaving]  = useState({});

  useEffect(() => { load(); }, [selectedVenue, from, to, category, status]);

  async function load() {
    setLoading(true);
    try {
      const p = { from, to };
      if (selectedVenue !== 'all') p.venue_id = selectedVenue;
      if (category !== 'all') p.category = category;
      if (status   !== 'all') p.status   = status;
      setRows(await api.getDiscrepancies(p));
    } catch (err) { showToast(err.message, 'error'); }
    setLoading(false);
  }

  async function updateStatus(row, newStatus, notes) {
    const key = `${row.venue_id}-${row.date}-${row.category}`;
    setSaving(s => ({ ...s, [key]: true }));
    try {
      await api.setDiscrepancyStatus(row.venue_id, row.date, row.category, newStatus, notes != null ? notes : (row.notes ?? ''));
      showToast('Status updated');
      setRows(prev => prev.map(r =>
        r.venue_id === row.venue_id && r.date === row.date && r.category === row.category
          ? { ...r, status: newStatus }
          : r
      ));
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(s => ({ ...s, [key]: false }));
  }

  const kpis = useMemo(() => ({
    total:        rows.length,
    unresolved:   rows.filter(r => (r.status || 'unresolved') === 'unresolved').length,
    investigated: rows.filter(r => r.status === 'investigated').length,
    resolved:     rows.filter(r => r.status === 'resolved').length,
    major:        rows.filter(r => Math.abs(r.difference) > 5).length,
  }), [rows]);

  return (
    <div style={s.root}>
      {/* Filters */}
      <div style={{ ...s.filterBar, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={s.input} />
          <span style={{ color: '#a89078', fontSize: 13 }}>–</span>
          <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={s.input} />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} style={s.input}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={s.input}>
          {STATUSES.map(st => <option key={st} value={st}>{st === 'all' ? 'All Statuses' : st.charAt(0).toUpperCase() + st.slice(1)}</option>)}
        </select>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 10 }}>
        <KPI label="Total"        value={kpis.total}        color="#2d1f14" />
        <KPI label="Unresolved"   value={kpis.unresolved}   color="#991b1b" bg="#fef2f2" />
        <KPI label="Investigated" value={kpis.investigated} color="#7c5200" bg="#fdf5e0" />
        <KPI label="Resolved"     value={kpis.resolved}     color="#4a6622" bg="#f0f5e8" />
        <KPI label="Major (>£5)"  value={kpis.major}        color="#c1440e" bg="#fef3ee" />
      </div>

      {/* Table */}
      <div style={s.tableCard}>
        <div style={s.tableHeader}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>Discrepancies</span>
          <span style={{ fontSize: 12, color: '#a89078' }}>{rows.length} items</span>
        </div>

        {loading ? (
          <p style={s.empty}>Loading…</p>
        ) : !rows.length ? (
          <p style={s.empty}>No discrepancies found for this period.</p>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((row, i) => <MobileCard key={i} row={row} onStatusChange={updateStatus} saving={saving} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Date', 'Venue', 'Category', 'Expected', 'Actual', 'Difference', 'Status', ''].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <DesktopRow key={i} row={row} idx={i} onStatusChange={updateStatus} saving={saving} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DesktopRow({ row, idx, onStatusChange, saving }) {
  const diff    = Number(row.difference) || 0;
  const absDiff = Math.abs(diff);
  const isMajor = absDiff > 5;
  const isMinor = absDiff > 0 && absDiff <= 5;
  const rowBg   = idx % 2 === 0 ? '#fff' : '#fefcf9';
  const st      = row.status || 'unresolved';
  const sc      = STATUS_COLORS[st] || STATUS_COLORS.unresolved;
  const key     = `${row.venue_id}-${row.date}-${row.category}`;

  return (
    <tr style={{ background: isMajor ? '#fff5f5' : isMinor ? '#fffbeb' : rowBg }}>
      <td style={s.td}>{fDate(row.date)}</td>
      <td style={s.td}><VenuePill name={row.venue_name} /></td>
      <td style={s.td}><span style={s.catTag}>{row.category}</span></td>
      <td style={{ ...s.td, textAlign: 'right' }}>£{f2(row.expected_value)}</td>
      <td style={{ ...s.td, textAlign: 'right' }}>
        {row.actual_value == null ? <span style={{ color: '#a89078', fontSize: 11 }}>Not set</span> : `£${f2(row.actual_value)}`}
      </td>
      <td style={{ ...s.td, textAlign: 'right' }}>
        <DiffBadge value={diff} />
      </td>
      <td style={s.td}>
        <select
          value={st}
          onChange={e => onStatusChange(row, e.target.value)}
          disabled={saving[key]}
          style={{ ...s.statusSelect, background: sc.bg, color: sc.color, borderColor: sc.border }}
        >
          <option value="unresolved">Unresolved</option>
          <option value="investigated">Investigated</option>
          <option value="resolved">Resolved</option>
        </select>
      </td>
      <td style={s.td}>
        {isMajor && <span style={s.majorTag}>Major</span>}
        {isMinor && <span style={s.minorTag}>Minor</span>}
      </td>
    </tr>
  );
}

function MobileCard({ row, onStatusChange, saving }) {
  const diff    = Number(row.difference) || 0;
  const absDiff = Math.abs(diff);
  const isMajor = absDiff > 5;
  const isMinor = absDiff > 0 && absDiff <= 5;
  const st      = row.status || 'unresolved';
  const sc      = STATUS_COLORS[st] || STATUS_COLORS.unresolved;
  const key     = `${row.venue_id}-${row.date}-${row.category}`;

  return (
    <div style={{
      ...s.mCard,
      borderLeft: `3px solid ${isMajor ? '#c1440e' : isMinor ? '#c88a2e' : '#b5d08a'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#2d1f14' }}>{fDate(row.date)}</span>
        <DiffBadge value={diff} />
      </div>
      <VenuePill name={row.venue_name} />
      <span style={s.catTag}>{row.category}</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
        <div>
          <span style={{ color: '#a89078', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Expected</span>
          <div style={{ fontWeight: 600 }}>£{f2(row.expected_value)}</div>
        </div>
        <div>
          <span style={{ color: '#a89078', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Actual</span>
          <div style={{ fontWeight: 600 }}>
            {row.actual_value == null ? <span style={{ color: '#a89078' }}>Not set</span> : `£${f2(row.actual_value)}`}
          </div>
        </div>
      </div>
      <select
        value={st}
        onChange={e => onStatusChange(row, e.target.value)}
        disabled={saving[key]}
        style={{ ...s.statusSelect, background: sc.bg, color: sc.color, borderColor: sc.border, width: '100%' }}
      >
        <option value="unresolved">Unresolved</option>
        <option value="investigated">Investigated</option>
        <option value="resolved">Resolved</option>
      </select>
      {(isMajor || isMinor) && (
        <div style={{ display: 'flex', gap: 6 }}>
          {isMajor && <span style={s.majorTag}>Major discrepancy</span>}
          {isMinor && <span style={s.minorTag}>Minor discrepancy</span>}
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, color, bg }) {
  return (
    <div style={{ background: bg || '#fff', border: '1px solid #ede8e0', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#a89078', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

function DiffBadge({ value }) {
  const abs = Math.abs(value || 0);
  if (abs < 0.01) return <span style={{ fontSize: 12, color: '#4a6622', fontWeight: 700 }}>✓ Match</span>;
  const neg = value < 0;
  return (
    <span style={{
      fontSize: 12, fontWeight: 700,
      color: abs > 5 ? '#991b1b' : '#7c5200',
      background: abs > 5 ? '#fef2f2' : '#fffbeb',
      padding: '2px 8px', borderRadius: 6,
    }}>
      {neg ? `−£${f2(abs)}` : `+£${f2(abs)}`}
    </span>
  );
}

function VenuePill({ name }) {
  const c = name?.includes('Waterfront') ? '#2563eb' : '#c1440e';
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: c + '18', color: c }}>{name}</span>;
}

const s = {
  root:         { display: 'flex', flexDirection: 'column', gap: 16 },
  filterBar:    { display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '1px solid #ede8e0', borderRadius: 10, padding: '12px 16px' },
  input:        { padding: '7px 10px', border: '1px solid #ede8e0', borderRadius: 7, fontSize: 13, color: '#2d1f14', background: '#fff' },
  tableCard:    { background: '#fff', borderRadius: 12, border: '1px solid #ede8e0', overflow: 'hidden' },
  tableHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f5ede0' },
  table:        { width: '100%', borderCollapse: 'collapse' },
  th:           { padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f5ede0', whiteSpace: 'nowrap' },
  td:           { padding: '11px 12px', fontSize: 13, color: '#4a3728', borderBottom: '1px solid #faf5ee', verticalAlign: 'middle' },
  empty:        { padding: 40, textAlign: 'center', color: '#a89078', fontSize: 14 },
  catTag:       { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: '#f5ede0', color: '#7d6553' },
  majorTag:     { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5' },
  minorTag:     { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#fffbeb', color: '#7c5200', border: '1px solid #f0c97a' },
  statusSelect: { padding: '5px 8px', border: '1px solid', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  mCard:        { padding: '14px 16px', borderBottom: '1px solid #f5ede0', display: 'flex', flexDirection: 'column', gap: 8 },
};
