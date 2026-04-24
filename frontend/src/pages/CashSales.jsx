import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const today      = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };
const yearStart  = () => `${new Date().getFullYear()}-01-01`;

// Total Sales = Cash + Petty + Card + Deposits + Gifts
// Does NOT include: discounts, complimentary, refunds, tips
function calcTotal(r) {
  return (r.cash_sales || 0) + (r.petty_cash || 0) + (r.card_sales || 0) +
         (r.deposits_used || 0) + (r.gift_cards_redeemed || 0);
}

export default function CashSales({ selectedVenue, venues, showToast }) {
  const isMobile = useIsMobile();
  const [from, setFrom] = useState(monthStart());
  const [to,   setTo]   = useState(today());
  const [rows, setRows] = useState([]);
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

  const totals = useMemo(() => rows.reduce((a, r) => ({
    cash:     a.cash     + (r.cash_sales          || 0),
    petty:    a.petty    + (r.petty_cash           || 0),
    card:     a.card     + (r.card_sales           || 0),
    deposits: a.deposits + (r.deposits_used        || 0),
    gifts:    a.gifts    + (r.gift_cards_redeemed  || 0),
    total:    a.total    + calcTotal(r),
  }), { cash: 0, petty: 0, card: 0, deposits: 0, gifts: 0, total: 0 }), [rows]);

  function doExportCSV() {
    if (!rows.length) return;
    const data = rows.map(r => ({
      Date:            r.date,
      Venue:           r.venue_name,
      'Cash Sales':    f2(r.cash_sales),
      'Petty Cash':    f2(r.petty_cash),
      'Card Sales':    f2(r.card_sales),
      'Deposits Used': f2(r.deposits_used),
      'Gift Vouchers': f2(r.gift_cards_redeemed),
      'Total Sales':   f2(calcTotal(r)),
      Status:          r.sq_total != null ? (r.sq_locked === 1 ? 'Locked' : 'Reconciled') : 'Pending',
    }));
    const keys = Object.keys(data[0]);
    const csv  = [keys.join(','), ...data.map(r => keys.map(k => `"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `total-sales-${from}-${to}.csv` });
    a.click();
  }

  function doExportExcel() {
    const params = new URLSearchParams({ from, to });
    if (selectedVenue !== 'all') params.set('venue_id', selectedVenue);
    window.location.href = `/api/export/excel?${params}`;
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
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button onClick={doExportCSV}   style={s.exportBtn}>↓ CSV</button>
          <button onClick={doExportExcel} style={{ ...s.exportBtn, background: '#5a7a30' }}>↓ Excel</button>
        </div>
      </div>

      {/* Total Sales banner */}
      <div style={s.totalBanner}>
        <div>
          <p style={{ fontSize: 11, color: '#a89078', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
            Total Sales — Cash + Petty + Card + Deposits + Gifts
          </p>
          <p style={{ fontSize: 11, color: '#7d6553', margin: '3px 0 0' }}>{fDate(from)} – {fDate(to)} · {venueName}</p>
        </div>
        <span style={{ fontSize: 36, fontWeight: 800, color: '#c1440e', letterSpacing: '-1.5px' }}>£{f2(totals.total)}</span>
      </div>

      {/* Component KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 10 }}>
        <KPI label="Cash Sales"    value={totals.cash}     color="#5a7a30" />
        <KPI label="Petty Cash"    value={totals.petty}    color="#c88a2e" />
        <KPI label="Card Sales"    value={totals.card}     color="#2563eb" />
        <KPI label="Deposits Used" value={totals.deposits} color="#7c3d8c" />
        <KPI label="Gift Vouchers" value={totals.gifts}    color="#4a6622" />
      </div>

      {/* Daily breakdown table */}
      <div style={s.tableCard}>
        <div style={s.tableHdr}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>Daily Breakdown</span>
          <span style={{ fontSize: 12, color: '#a89078' }}>{rows.length} entries</span>
        </div>

        {loading ? <p style={s.empty}>Loading…</p>
        : !rows.length ? <p style={s.empty}>No data for this period.</p>
        : isMobile
          ? rows.map((r, i) => <MobileCard key={i} row={r} />)
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Date','Venue','Cash Sales','Petty Cash','Card Sales','Deposits','Gift Vouchers','Total Sales','Status'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const total = calcTotal(r);
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fefcf9' }}>
                        <td style={s.td}>{fDate(r.date)}</td>
                        <td style={s.td}><VenuePill name={r.venue_name} /></td>
                        <td style={{ ...s.td, textAlign: 'right', color: '#5a7a30', fontWeight: 500 }}>£{f2(r.cash_sales)}</td>
                        <td style={{ ...s.td, textAlign: 'right', color: '#c88a2e' }}>£{f2(r.petty_cash)}</td>
                        <td style={{ ...s.td, textAlign: 'right', color: '#2563eb', fontWeight: 500 }}>£{f2(r.card_sales)}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>£{f2(r.deposits_used)}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>£{f2(r.gift_cards_redeemed)}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, color: '#c1440e' }}>£{f2(total)}</td>
                        <td style={s.td}><StatusPill row={r} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr style={{ background: '#faf7f2', borderTop: '2px solid #e8dcc8' }}>
                    <td style={{ ...s.td, fontWeight: 700, color: '#2d1f14' }} colSpan={2}>Period Total</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#5a7a30' }}>£{f2(totals.cash)}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#c88a2e' }}>£{f2(totals.petty)}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>£{f2(totals.card)}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>£{f2(totals.deposits)}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>£{f2(totals.gifts)}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, color: '#c1440e', fontSize: 15 }}>£{f2(totals.total)}</td>
                    <td style={s.td} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        }
      </div>
    </div>
  );
}

function MobileCard({ row }) {
  const total = calcTotal(row);
  return (
    <div style={s.mCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#2d1f14' }}>{fDate(row.date)}</span>
        <span style={{ fontSize: 17, fontWeight: 800, color: '#c1440e' }}>£{f2(total)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <VenuePill name={row.venue_name} />
        <StatusPill row={row} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 4 }}>
        <MCell label="Cash"     value={`£${f2(row.cash_sales)}`}         color="#5a7a30" />
        <MCell label="Petty"    value={`£${f2(row.petty_cash)}`}          color="#c88a2e" />
        <MCell label="Card"     value={`£${f2(row.card_sales)}`}          color="#2563eb" />
        <MCell label="Deposits" value={`£${f2(row.deposits_used)}`} />
        <MCell label="Gifts"    value={`£${f2(row.gift_cards_redeemed)}`} />
      </div>
    </div>
  );
}

function KPI({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: '1.5px solid #ede8e0', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#a89078', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.5px' }}>£{f2(value)}</span>
    </div>
  );
}

function MCell({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: '#a89078', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || '#2d1f14' }}>{value}</span>
    </div>
  );
}

function VenuePill({ name }) {
  const c = name?.includes('Waterfront') ? '#2563eb' : '#c1440e';
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: c + '18', color: c }}>{name}</span>;
}

function StatusPill({ row }) {
  if (row.sq_locked === 1)  return <Pill label="Locked"     bg="#eff6ff" color="#1e40af" border="#93c5fd" />;
  if (row.sq_total != null) return <Pill label="Reconciled" bg="#f0f5e8" color="#4a6622" border="#b5d08a" />;
  return <Pill label="Pending" bg="#fdf5e0" color="#7c5200" border="#f0c97a" />;
}

function Pill({ label, bg, color, border }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: bg, color, border: `1px solid ${border}` }}>{label}</span>;
}

const s = {
  root:        { display: 'flex', flexDirection: 'column', gap: 16 },
  filterBar:   { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1px solid #ede8e0' },
  venueBadge:  { fontSize: 13, fontWeight: 600, color: '#c1440e', background: '#fef3ee', padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' },
  dateInput:   { padding: '6px 10px', border: '1px solid #ede8e0', borderRadius: 7, fontSize: 13, color: '#2d1f14', background: '#fff' },
  presetBtn:   { padding: '5px 12px', background: '#faf7f2', border: '1px solid #ede8e0', borderRadius: 6, fontSize: 12, color: '#7d6553', cursor: 'pointer', whiteSpace: 'nowrap' },
  exportBtn:   { padding: '7px 14px', background: '#2d1f14', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  totalBanner: { background: '#fff', borderRadius: 14, border: '2px solid #f5c9a8', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  tableCard:   { background: '#fff', borderRadius: 12, border: '1px solid #ede8e0', overflow: 'hidden' },
  tableHdr:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f5ede0' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f5ede0', whiteSpace: 'nowrap' },
  td:          { padding: '11px 12px', fontSize: 13, color: '#4a3728', borderBottom: '1px solid #faf5ee', verticalAlign: 'middle' },
  empty:       { padding: 40, textAlign: 'center', color: '#a89078', fontSize: 14 },
  mCard:       { padding: '14px 16px', borderBottom: '1px solid #f5ede0', display: 'flex', flexDirection: 'column', gap: 8 },
};
