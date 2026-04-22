import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';

export default function ManagerReports({ venues, showToast }) {
  const [reports, setReports] = useState([]);
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
      setReports(await api.getReports(params));
    } catch {}
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this report?')) return;
    try {
      await api.deleteReport(id);
      showToast('Report deleted');
      load();
    } catch (err) { showToast(err.message, 'error'); }
  }

  return (
    <div style={s.root}>
      <div style={s.filters}>
        <select value={venueId} onChange={e => setVenueId(e.target.value)} style={s.select}>
          <option value="">All venues</option>
          {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <div style={s.dateGroup}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={s.input} />
          <span style={s.sep}>to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={s.input} />
        </div>
      </div>

      <div style={s.card}>
        {loading ? (
          <p style={s.empty}>Loading…</p>
        ) : reports.length === 0 ? (
          <p style={s.empty}>No reports found for the selected filters.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>{['Date','Venue','Cash','Card','Total','Notes',''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} style={s.tr}>
                  <td style={s.td}>{formatDate(r.date)}</td>
                  <td style={s.td}>{r.venue_name}</td>
                  <td style={s.td}>£{(r.cash_sales||0).toFixed(2)}</td>
                  <td style={s.td}>£{(r.card_sales||0).toFixed(2)}</td>
                  <td style={{ ...s.td, fontWeight: 700 }}>£{(r.total_sales||0).toFixed(2)}</td>
                  <td style={{ ...s.td, color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</td>
                  <td style={s.td}>
                    <button onClick={() => handleDelete(r.id)} style={s.delBtn} title="Delete">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  filters: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  select: { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: '#fff', color: '#0f172a' },
  input: { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 },
  dateGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  sep: { color: '#94a3b8', fontSize: 13 },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f1f5f9' },
  tr: { borderBottom: '1px solid #f8fafc' },
  td: { padding: '12px 16px', fontSize: 14, color: '#374151' },
  empty: { padding: '40px', color: '#94a3b8', textAlign: 'center', fontSize: 14 },
  delBtn: { background: 'none', border: 'none', color: '#cbd5e1', fontSize: 13, padding: 4, borderRadius: 4 },
};
