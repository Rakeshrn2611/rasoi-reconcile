import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

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
      setRows(await api.getSummary(p));
    } catch {}
    setLoading(false);
  }

  const totals = useMemo(() => rows.reduce((a, r) => ({
    physical:      a.physical      + (r.physical_cash       || 0),
    petty:         a.petty         + (r.petty_cash          || 0),
    cash:          a.cash          + (r.cash_sales          || 0),
    card:          a.card          + (r.card_sales          || 0),
    deposits:      a.deposits      + (r.deposits_used       || 0),
    gifts:         a.gifts         + (r.gift_cards_redeemed || 0),
    grandTotal:    a.grandTotal    + (r.grand_total         || r.total_sales || 0),
    cardTips:      a.cardTips      + (r.card_tips           || 0),
    cashTips:      a.cashTips      + (r.cash_tips           || 0),
    actualCash:    a.actualCash    + (r.actual_cash_held    != null ? Number(r.actual_cash_held) : 0),
    actualEntries: a.actualEntries + (r.actual_cash_held    != null ? 1 : 0),
  }), { physical:0, petty:0, cash:0, card:0, deposits:0, gifts:0, grandTotal:0, cardTips:0, cashTips:0, actualCash:0, actualEntries:0 }), [rows]);

  const totalTips = totals.cardTips + totals.cashTips;

  // Step-by-step cash: Manager Cash (physical) - Petty Cash = Net Cash, vs Actual Cash Held
  const netManagerCash   = totals.physical - totals.petty;
  const cashDiscrepancy  = totals.actualEntries > 0 ? totals.actualCash - netManagerCash : null;

  function doExportCSV() {
    downloadCSV(`cash-sales-${from}-${to}.csv`, rows.map(r => {
      const actual    = r.actual_cash_held != null ? Number(r.actual_cash_held) : null;
      const net       = (r.physical_cash || 0) - (r.petty_cash || 0);
      const cashDisc  = actual != null ? actual - net : null;
      return {
        Date:              r.date,
        Venue:             r.venue_name,
        'Cash Sales':      f2(r.cash_sales),
        'Physical Cash':   f2(r.physical_cash),
        'Petty Cash':      f2(r.petty_cash),
        'Net Manager Cash':f2(net),
        'Actual Cash Held':actual != null ? f2(actual) : 'Not entered',
        'Cash Discrepancy':cashDisc != null ? f2(cashDisc) : '—',
        'Card Sales':      f2(r.card_sales),
        'Grand Total':     f2(r.grand_total || r.total_sales),
        'Card Tips':       f2(r.card_tips),
        'Cash Tips':       f2(r.cash_tips),
        Status:            r.sq_total != null ? 'Reconciled' : 'Pending',
      };
    }));
  }

  function doExportExcel() {
    const params = new URLSearchParams({ from, to });
    if (selectedVenue !== 'all') params.set('venue_id', selectedVenue);
    window.location.href = `/api/export/excel?${params}`;
  }

  return (
    <div style={s.root}>
      {/* Context bar */}
      <div style={s.ctxBar}>
        <span style={s.venueBadge}>📍 {venueName}</span>
        <div style={s.dateRow}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={s.dateInput} />
          <span style={{ color: '#a89078', fontSize: 13 }}>–</span>
          <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={s.dateInput} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={doExportCSV}   style={s.exportBtn}>↓ CSV</button>
          <button onClick={doExportExcel} style={{ ...s.exportBtn, background: '#5a7a30' }}>↓ Excel</button>
          <button onClick={() => window.print()} style={{ ...s.exportBtn, background: '#2563eb' }}>↓ Print PDF</button>
        </div>
      </div>

      {/* Cash Step-by-Step Logic */}
      <div style={s.cashLogicBox}>
        <p style={s.cashLogicTitle}>Cash Verification — Step by Step</p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4,1fr)', gap: 12, marginTop: 10 }}>
          <StepCard step="1" label="Manager Cash (Physical Counted)" value={totals.physical} color="#2d1f14" />
          <StepCard step="2" label="Petty Cash Used" value={totals.petty} color="#c88a2e" minus />
          <StepCard step="3" label="Net Manager Cash" value={netManagerCash} color="#2563eb" result />
          {cashDiscrepancy != null ? (
            <StepCard
              step="4"
              label="Cash Discrepancy (Actual − Net)"
              value={cashDiscrepancy}
              color={Math.abs(cashDiscrepancy) > 5 ? '#991b1b' : Math.abs(cashDiscrepancy) > 0 ? '#7c5200' : '#4a6622'}
              result
              disc
            />
          ) : (
            <div style={{ ...s.stepCard, background: '#fefcf9', borderStyle: 'dashed' }}>
              <span style={{ fontSize: 10, color: '#a89078', fontWeight: 700, textTransform: 'uppercase' }}>Step 4</span>
              <span style={{ fontSize: 11, color: '#a89078' }}>Actual Cash Held</span>
              <span style={{ fontSize: 12, color: '#a89078', marginTop: 4 }}>Not entered yet</span>
              <span style={{ fontSize: 10, color: '#c88a2e', marginTop: 2 }}>Enter via Reconcile page</span>
            </div>
          )}
        </div>
        {cashDiscrepancy != null && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#7d6553' }}>
              Actual Cash Held total: <strong>£{f2(totals.actualCash)}</strong> across {totals.actualEntries} day(s)
            </span>
          </div>
        )}
      </div>

      {/* Sales KPIs */}
      <div style={s.sectionHeader}>Sales Overview</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
        <KPI label="Cash Sales"    value={totals.cash}     color="#5a7a30" />
        <KPI label="Card Sales"    value={totals.card}     color="#2563eb" />
        <KPI label="Deposits Used" value={totals.deposits} color="#c88a2e" />
        <KPI label="Gift Vouchers" value={totals.gifts}    color="#7c3d8c" />
      </div>

      {/* Grand Total */}
      <div style={s.grandTotalBox}>
        <div>
          <p style={{ fontSize: 11, color: '#a89078', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Grand Total (Cash + Card + Deposits + Gifts + Petty)</p>
          <p style={{ fontSize: 11, color: '#7d6553', margin: '2px 0 0' }}>Period: {fDate(from)} – {fDate(to)}</p>
        </div>
        <span style={{ fontSize: 32, fontWeight: 800, color: '#c1440e', letterSpacing: '-1px' }}>£{f2(totals.grandTotal)}</span>
      </div>

      {/* Tips KPIs */}
      <div style={s.sectionHeader}>Tips (tracked separately)</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(3,1fr)', gap: 12 }}>
        <KPI label="Card Tips"  value={totals.cardTips} color="#2563eb" />
        <KPI label="Cash Tips"  value={totals.cashTips} color="#5a7a30" />
        <KPI label="Total Tips" value={totalTips}        color="#c88a2e" accent />
      </div>

      {/* Detail table */}
      <div style={s.tableCard}>
        <div style={s.tableHeader}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>Daily Breakdown</span>
          <span style={{ fontSize: 12, color: '#a89078' }}>{rows.length} entries</span>
        </div>
        {loading ? <p style={s.empty}>Loading…</p>
         : !rows.length ? <p style={s.empty}>No data for this period.</p>
         : isMobile ? rows.map((r, i) => {
             const tips     = (r.card_tips||0) + (r.cash_tips||0);
             const net      = (r.physical_cash||0) - (r.petty_cash||0);
             const actual   = r.actual_cash_held != null ? Number(r.actual_cash_held) : null;
             const cashDisc = actual != null ? actual - net : null;
             return (
               <div key={i} style={s.mCard}>
                 <div style={s.mCardHeader}>
                   <span style={{ fontWeight: 700, fontSize: 14, color: '#2d1f14' }}>{fDate(r.date)}</span>
                   <StatusPill ok={r.sq_total != null} label={r.sq_total != null ? 'Reconciled' : 'Pending'} />
                 </div>
                 <VenuePill name={r.venue_name} />
                 <div style={s.mCardGrid}>
                   <MCell label="Cash Sales"   value={`£${f2(r.cash_sales)}`}   color="#5a7a30" />
                   <MCell label="Physical"     value={`£${f2(r.physical_cash)}`} />
                   <MCell label="Petty Cash"   value={`£${f2(r.petty_cash)}`}   color="#c88a2e" />
                   <MCell label="Net Cash"     value={`£${f2(net)}`}            color="#2563eb" />
                   <MCell label="Actual Held"  value={actual != null ? `£${f2(actual)}` : '—'} color={actual == null ? '#a89078' : undefined} />
                   <MCell
                     label="Cash Disc."
                     value={cashDisc != null ? (Math.abs(cashDisc) < 0.01 ? '✓' : `£${f2(cashDisc)}`) : '—'}
                     color={cashDisc == null ? '#a89078' : Math.abs(cashDisc) > 5 ? '#991b1b' : Math.abs(cashDisc) > 0 ? '#7c5200' : '#4a6622'}
                     bold
                   />
                   <MCell label="Card"         value={`£${f2(r.card_sales)}`}   color="#2563eb" />
                   <MCell label="Total"        value={`£${f2(r.grand_total||r.total_sales)}`} color="#c1440e" bold />
                   {tips > 0 && <MCell label="Tips" value={`£${f2(tips)}`} color="#c88a2e" />}
                 </div>
               </div>
             );
           })
         : (
           <div style={{ overflowX: 'auto' }}>
             <table style={s.table}>
               <thead>
                 <tr>
                   {['Date','Venue','Cash Sales','Physical','Petty','Net Manager','Actual Held','Cash Disc.','Card','Grand Total','Tips','Status'].map(h => (
                     <th key={h} style={s.th}>{h}</th>
                   ))}
                 </tr>
               </thead>
               <tbody>
                 {rows.map((r, i) => {
                   const net      = (r.physical_cash||0) - (r.petty_cash||0);
                   const actual   = r.actual_cash_held != null ? Number(r.actual_cash_held) : null;
                   const cashDisc = actual != null ? actual - net : null;
                   const tips     = (r.card_tips||0) + (r.cash_tips||0);
                   const discColor = cashDisc == null ? '#a89078' : Math.abs(cashDisc) > 5 ? '#991b1b' : Math.abs(cashDisc) > 0 ? '#7c5200' : '#4a6622';
                   return (
                     <tr key={i} style={{
                       background: cashDisc != null && Math.abs(cashDisc) > 5 ? '#fff5f5'
                                 : cashDisc != null && Math.abs(cashDisc) > 0 ? '#fffbeb'
                                 : i%2===0 ? '#fff' : '#fefcf9'
                     }}>
                       <td style={s.td}>{fDate(r.date)}</td>
                       <td style={s.td}><VenuePill name={r.venue_name} /></td>
                       <td style={s.td}>£{f2(r.cash_sales)}</td>
                       <td style={s.td}>£{f2(r.physical_cash)}</td>
                       <td style={{ ...s.td, color: '#c88a2e' }}>£{f2(r.petty_cash)}</td>
                       <td style={{ ...s.td, fontWeight: 600 }}>£{f2(net)}</td>
                       <td style={{ ...s.td, color: actual == null ? '#a89078' : '#2d1f14' }}>
                         {actual != null ? `£${f2(actual)}` : <span style={{ fontSize: 11 }}>Not entered</span>}
                       </td>
                       <td style={{ ...s.td, fontWeight: 700, color: discColor }}>
                         {cashDisc == null ? '—' : Math.abs(cashDisc) < 0.01 ? '✓' : cashDisc > 0 ? `+£${f2(cashDisc)}` : `−£${f2(Math.abs(cashDisc))}`}
                       </td>
                       <td style={s.td}>£{f2(r.card_sales)}</td>
                       <td style={{ ...s.td, fontWeight: 700, color: '#c1440e' }}>£{f2(r.grand_total||r.total_sales)}</td>
                       <td style={{ ...s.td, color: '#c88a2e' }}>{tips > 0 ? `£${f2(tips)}` : '—'}</td>
                       <td style={s.td}><StatusPill ok={r.sq_total != null} label={r.sq_total != null ? 'Reconciled' : 'Pending'} /></td>
                     </tr>
                   );
                 })}
               </tbody>
             </table>
           </div>
         )}
      </div>
    </div>
  );
}

function StepCard({ step, label, value, color, minus, result, disc }) {
  return (
    <div style={{
      ...s.stepCard,
      background: result ? (disc ? '#fff5f5' : '#f0f5ff') : '#fff',
      borderColor: result ? (disc ? '#fca5a5' : '#93c5fd') : '#ede8e0',
      borderWidth: result ? 2 : 1,
    }}>
      <span style={{ fontSize: 10, color: '#a89078', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step {step}</span>
      <span style={{ fontSize: 11, color: '#7d6553' }}>{minus ? '(−) ' : ''}{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>
        {minus ? '−' : disc && value > 0 ? '+' : ''}£{Math.abs(Number(value)||0).toFixed(2)}
      </span>
    </div>
  );
}

function KPI({ label, value, color, accent }) {
  return (
    <div style={{ ...s.kpi, borderColor: accent ? color : '#ede8e0', background: accent ? color+'12' : '#fff' }}>
      <span style={{ fontSize: 11, color: '#a89078', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.5px', marginTop: 4 }}>£{f2(value)}</span>
    </div>
  );
}

function MCell({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: '#a89078', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 800 : 500, color: color || '#2d1f14' }}>{value}</span>
    </div>
  );
}

function VenuePill({ name }) {
  const c = name?.includes('Waterfront') ? '#2563eb' : '#c1440e';
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: c+'18', color: c }}>{name}</span>;
}

function StatusPill({ ok, label }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: ok ? '#f0f5e8' : '#fdf5e0', color: ok ? '#4a6622' : '#7c5200' }}>{label}</span>;
}

function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => `"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: filename });
  a.click();
}

const f2       = n => (Number(n)||0).toFixed(2);
const fDate    = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
const today      = () => new Date().toISOString().slice(0,10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };

const s = {
  root:          { display: 'flex', flexDirection: 'column', gap: 16 },
  ctxBar:        { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1px solid #ede8e0' },
  venueBadge:    { fontSize: 13, fontWeight: 600, color: '#c1440e', background: '#fef3ee', padding: '4px 12px', borderRadius: 20 },
  dateRow:       { display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' },
  dateInput:     { padding: '6px 10px', border: '1px solid #ede8e0', borderRadius: 7, fontSize: 13, color: '#2d1f14', background: '#fff' },
  exportBtn:     { padding: '7px 14px', background: '#2d1f14', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  sectionHeader: { fontSize: 12, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '1px', paddingLeft: 4 },
  cashLogicBox:  { background: '#fff', borderRadius: 14, border: '2px solid #e8dcc8', padding: '18px 20px' },
  cashLogicTitle:{ fontSize: 13, fontWeight: 700, color: '#2d1f14', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' },
  stepCard:      { border: '1px solid #ede8e0', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 },
  kpi:           { background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1.5px solid', display: 'flex', flexDirection: 'column', gap: 2 },
  grandTotalBox: { background: '#fff', borderRadius: 14, border: '2px solid #f5c9a8', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  tableCard:     { background: '#fff', borderRadius: 12, border: '1px solid #ede8e0', overflow: 'hidden' },
  tableHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f5ede0' },
  table:         { width: '100%', borderCollapse: 'collapse' },
  th:            { padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f5ede0', whiteSpace: 'nowrap' },
  td:            { padding: '11px 12px', fontSize: 13, color: '#4a3728', borderBottom: '1px solid #faf5ee' },
  empty:         { padding: 40, textAlign: 'center', color: '#a89078', fontSize: 14 },
  mCard:         { padding: '14px 16px', borderBottom: '1px solid #f5ede0', display: 'flex', flexDirection: 'column', gap: 8 },
  mCardHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  mCardGrid:     { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 4 },
};
