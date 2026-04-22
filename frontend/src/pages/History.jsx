import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';

export default function History({ venues }) {
  const [rows, setRows] = useState([]);
  const [venueId, setVenueId] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, [venueId, from, to]);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (venueId) params.venue_id = venueId;
      if (from) params.from = from;
      if (to) params.to = to;
      setRows(await api.getSummary(params));
    } catch {}
    setLoading(false);
  }

  const totals = rows.reduce((acc, r) => ({
    cash: acc.cash + (r.cash_sales || 0),
    card: acc.card + (r.card_sales || 0),
    total: acc.total + (r.total_sales || 0),
    variance: acc.variance + Math.abs(r.reconciliation?.totalVar || 0),
  }), { cash: 0, card: 0, total: 0, variance: 0 });

  return (
    <div style={s.root}>
      <div style={s.filters}>
        <select value={venueId} onChange={e => setVenueId(e.target.value)} style={s.select}>
          <option value="">All venues</option>
          {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={s.input} />
        <span style={s.sep}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={s.input} />
      </div>

      {rows.length > 0 && (
        <div style={s.summaryCards}>
          <SummCard label="Total Cash" value={`£${totals.cash.toFixed(2)}`} />
          <SummCard label="Total Card" value={`£${totals.card.toFixed(2)}`} />
          <SummCard label="Total Sales" value={`£${totals.total.toFixed(2)}`} bold />
          <SummCard label="Total Variance" value={`£${totals.variance.toFixed(2)}`} warn={totals.variance > 50} />
        </div>
      )}

      <div style={s.card}>
        {loading ? <p style={s.empty}>Loading…</p> : rows.length === 0 ? <p style={s.empty}>No data found.</p> : (
          <table style={s.table}>
            <thead>
              <tr>{['Date','Venue','Mgr Cash','Mgr Card','Mgr Total','Sq Total','Variance','Status'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const r = row.reconciliation;
                const status = !r ? 'pending' : r.status;
                const variance = r ? Math.abs(r.totalVar) : null;
                return (
                  <tr key={i} style={s.tr}>
                    <td style={s.td}>{formatDate(row.date)}</td>
                    <td style={s.td}>{row.venue_name}</td>
                    <td style={s.td}>£{(row.cash_sales||0).toFixed(2)}</td>
                    <td style={s.td}>£{(row.card_sales||0).toFixed(2)}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>£{(row.total_sales||0).toFixed(2)}</td>
                    <td style={s.td}>{row.sq_total != null ? `£${row.sq_total.toFixed(2)}` : '—'}</td>
                    <td style={{ ...s.td, color: variance != null && variance > 5 ? '#ef4444' : '#374151' }}>
                      {variance != null ? `£${variance.toFixed(2)}` : '—'}
                    </td>
                    <td style={s.td}><StatusBadge status={status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummCard({ label, value, bold, warn }) {
  return (
    <div style={{ ...s.summCard, background: warn ? '#fef9c3' : '#fff' }}>
      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: bold ? 800 : 700, color: warn ? '#92400e' : '#0f172a' }}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { ok: ['#dcfce7','#166534','Reconciled'], warn: ['#fef9c3','#854d0e','Warning'], pending: ['#f1f5f9','#64748b','Pending'] };
  const [bg, color, label] = map[status] || map.pending;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: bg, color }}>{label}</span>;
}

function formatDate(d) { return new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }
function today() { return new Date().toISOString().slice(0,10); }
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  filters: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  select: { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: '#fff' },
  input: { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 },
  sep: { color: '#94a3b8', fontSize: 13 },
  summaryCards: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  summCard: { borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 4 },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f1f5f9' },
  tr: { borderBottom: '1px solid #f8fafc' },
  td: { padding: '11px 14px', fontSize: 13, color: '#374151' },
  empty: { padding: 40, color: '#94a3b8', textAlign: 'center', fontSize: 14 },
};
