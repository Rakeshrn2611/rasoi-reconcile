import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
const today      = () => new Date().toISOString().slice(0,10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };
const yearStart  = () => `${new Date().getFullYear()}-01-01`;

export default function GiftCards({ selectedVenue, venues, showToast }) {
  const isMobile = useIsMobile();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo]     = useState(today());
  const [tab, setTab]   = useState('redemptions');

  const [daily,   setDaily]   = useState([]);
  const [redemps, setRedemps] = useState([]);
  const [allAct,  setAllAct]  = useState([]);
  const [loading, setLoading] = useState(true);

  const venueName = selectedVenue === 'all' ? 'All Venues' : venues.find(v => v.id === selectedVenue)?.name ?? '';

  useEffect(() => { load(); }, [selectedVenue, from, to]);

  async function load() {
    setLoading(true);
    try {
      const p = { from, to };
      if (selectedVenue !== 'all') p.venue_id = selectedVenue;
      const [d, all] = await Promise.all([api.getGiftCardsDaily(p), api.getGiftCards(p)]);
      setDaily(d);
      setAllAct(all);
      setRedemps(all.filter(r => r.activity_type === 'REDEEM'));
    } catch {}
    setLoading(false);
  }

  function setPreset(v) {
    const now = new Date();
    if (v === 'month') { setFrom(monthStart()); setTo(today()); }
    else if (v === 'last') {
      const s = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(s.toISOString().slice(0,10)); setTo(e.toISOString().slice(0,10));
    }
    else if (v === 'year') { setFrom(yearStart()); setTo(today()); }
    else { setFrom('2022-01-01'); setTo(today()); }
  }

  const totals = useMemo(() => ({
    mgrTotal: daily.reduce((s,r) => s + r.manager_total, 0),
    sqTotal:  daily.reduce((s,r) => s + r.sq_total, 0),
    discDays: daily.filter(r => Math.abs(r.difference) > 0.01).length,
  }), [daily]);

  const dayMatchMap = useMemo(() => {
    const m = {};
    for (const d of daily) m[`${d.date}:${d.venue_id}`] = Math.abs(d.difference) < 0.01;
    return m;
  }, [daily]);

  function doExport() {
    if (tab === 'redemptions') {
      downloadCSV('gift-card-redemptions.csv', redemps.map(r => ({
        Date: r.date, Venue: r.venue_name,
        'Receipt #': r.receipt_number || r.payment_id || '—',
        'Card (Last 4)': r.gift_card_last4||'—', Amount: f2(r.amount),
      })));
    } else {
      downloadCSV('gift-card-activity.csv', allAct.map(r => ({
        Date: r.date, Venue: r.venue_name, Type: r.activity_type,
        'Receipt #': r.receipt_number || r.payment_id || '—',
        'Card (Last 4)': r.gift_card_last4||'—', Amount: f2(r.amount),
      })));
    }
  }

  const isRedemptions = tab === 'redemptions';
  const displayTxns   = isRedemptions ? redemps : allAct;

  return (
    <div style={s.root}>
      <FilterBar venueName={venueName} from={from} to={to}
        setFrom={setFrom} setTo={setTo} setPreset={setPreset}
        onExport={doExport} color="#2563eb" bg="#eff6ff" />

      {/* Tabs */}
      <div style={s.tabBar}>
        <button onClick={() => setTab('redemptions')} style={{...s.tab,...(isRedemptions?s.tabActive:{})}}>
          Redemptions ({redemps.length})
        </button>
        <button onClick={() => setTab('all')} style={{...s.tab,...(!isRedemptions?s.tabActive:{})}}>
          All Activity ({allAct.length})
        </button>
      </div>

      {/* Period KPIs — only show for Redemptions tab (daily comparison is for redemptions) */}
      {isRedemptions && (
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap:10 }}>
          <KPI label="Manager Total"    value={totals.mgrTotal} color="#7c3d8c" />
          <KPI label="Square Redeemed"  value={totals.sqTotal}  color="#2563eb" />
          <KPI label="Difference"       value={totals.mgrTotal - totals.sqTotal} color="#7c5200" diff />
          <KPI label="Discrepancy Days" count={totals.discDays} color={totals.discDays > 0 ? '#c1440e' : '#4a6622'} />
        </div>
      )}

      {/* Section 1: Daily Comparison (redemptions only) */}
      {isRedemptions && (
        <SectionCard title="Section 1 — Daily Comparison (Manager vs Square Redemptions)" badge={`${daily.length} days`}>
          {loading ? <p style={s.empty}>Loading…</p>
           : !daily.length ? <p style={s.empty}>No gift voucher activity this period.</p>
           : isMobile ? daily.map((r,i) => <MobileDayCard key={i} row={r} />)
           : (
             <div style={{overflowX:'auto'}}>
               <table style={s.table}>
                 <thead><tr>
                   <th style={s.th}>Date</th>
                   <th style={s.th}>Venue</th>
                   <th style={{...s.th,textAlign:'right'}}>Manager Total</th>
                   <th style={{...s.th,textAlign:'right',color:'#2563eb'}}>Square Redeemed</th>
                   <th style={{...s.th,textAlign:'right'}}>Difference</th>
                   <th style={{...s.th,textAlign:'center'}}>Receipts</th>
                   <th style={s.th}>Status</th>
                 </tr></thead>
                 <tbody>
                   {daily.map((r,i) => {
                     const matched = Math.abs(r.difference) < 0.01;
                     return (
                       <tr key={i} style={{background: Math.abs(r.difference)>5?'#fff5f5':!matched?'#fffbeb':i%2===0?'#fff':'#fefcf9'}}>
                         <td style={s.td}>{fDate(r.date)}</td>
                         <td style={s.td}><VenuePill name={r.venue_name}/></td>
                         <td style={{...s.td,textAlign:'right',fontWeight:600,color:'#7c3d8c'}}>
                           {r.manager_total > 0 ? `£${f2(r.manager_total)}` : <E/>}
                         </td>
                         <td style={{...s.td,textAlign:'right',color:'#2563eb'}}>
                           {r.sq_total > 0 ? `£${f2(r.sq_total)}` : <E/>}
                         </td>
                         <td style={{...s.td,textAlign:'right'}}><DiffCell value={r.difference}/></td>
                         <td style={{...s.td,textAlign:'center',color:'#7d6553'}}>{r.sq_count}</td>
                         <td style={s.td}><MatchPill matched={matched}/></td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           )}
        </SectionCard>
      )}

      {/* Section 2: Transaction Details */}
      <SectionCard
        title={isRedemptions ? 'Section 2 — Redemption Transactions (Receipt Level)' : 'All Gift Card Activity'}
        badge={`${displayTxns.length} transactions`}>
        {loading ? <p style={s.empty}>Loading…</p>
         : !displayTxns.length ? <p style={s.empty}>No transactions for this period.</p>
         : isMobile ? displayTxns.map((r,i) => {
             const matched = isRedemptions ? dayMatchMap[`${r.date}:${r.venue_id}`] : null;
             return (
               <div key={i} style={s.mCard}>
                 <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                   <span style={{fontWeight:700,fontSize:13,color:'#2d1f14'}}>{fDate(r.date)}</span>
                   {matched != null && <MatchPill matched={matched}/>}
                 </div>
                 <VenuePill name={r.venue_name}/>
                 <div style={{height:6}}/>
                 <MRow label="Receipt #"    value={<code style={s.code}>{r.receipt_number || r.payment_id || '—'}</code>}/>
                 <MRow label="Card (Last 4)" value={<code style={s.code}>···· {r.gift_card_last4||'—'}</code>}/>
                 {!isRedemptions && <MRow label="Type" value={<Tag text={r.activity_type}/>}/>}
                 <MRow label="Amount" value={<span style={{fontWeight:700,color:'#2563eb'}}>£{f2(r.amount)}</span>}/>
               </div>
             );
           })
         : (
           <div style={{overflowX:'auto'}}>
             <table style={s.table}>
               <thead><tr>
                 <th style={s.th}>Date</th>
                 <th style={s.th}>Venue</th>
                 <th style={s.th}>Receipt #</th>
                 <th style={s.th}>Card (Last 4)</th>
                 {!isRedemptions && <th style={s.th}>Type</th>}
                 <th style={{...s.th,textAlign:'right',color:'#2563eb'}}>Amount</th>
                 {isRedemptions && <th style={s.th}>Day Match</th>}
               </tr></thead>
               <tbody>
                 {displayTxns.map((r,i) => {
                   const matched = isRedemptions ? dayMatchMap[`${r.date}:${r.venue_id}`] : null;
                   return (
                     <tr key={i} style={{background: matched===false?'#fffbeb':i%2===0?'#fff':'#fefcf9'}}>
                       <td style={s.td}>{fDate(r.date)}</td>
                       <td style={s.td}><VenuePill name={r.venue_name}/></td>
                       <td style={s.td}><code style={s.code}>{r.receipt_number || r.payment_id || '—'}</code></td>
                       <td style={s.td}><code style={s.code}>···· {r.gift_card_last4||'—'}</code></td>
                       {!isRedemptions && <td style={s.td}><Tag text={r.activity_type}/></td>}
                       <td style={{...s.td,textAlign:'right',fontWeight:700,color:'#2563eb'}}>£{f2(r.amount)}</td>
                       {isRedemptions && <td style={s.td}>{matched != null ? <MatchPill matched={matched}/> : <E/>}</td>}
                     </tr>
                   );
                 })}
               </tbody>
             </table>
           </div>
         )}
      </SectionCard>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function FilterBar({ venueName, from, to, setFrom, setTo, setPreset, onExport, color, bg }) {
  return (
    <div style={s.filterBar}>
      <span style={{...s.venueBadge,color,background:bg}}>📍 {venueName}</span>
      <div style={{display:'flex',alignItems:'center',gap:6,flex:1}}>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={s.dateInput}/>
        <span style={{color:'#a89078',fontSize:13}}>–</span>
        <input type="date" value={to}   onChange={e=>setTo(e.target.value)}   style={s.dateInput}/>
      </div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {[['month','This Month'],['last','Last Month'],['year','This Year'],['all','All Time']].map(([v,l]) => (
          <button key={v} onClick={() => setPreset(v)} style={s.presetBtn}>{l}</button>
        ))}
        <button onClick={onExport} style={s.exportBtn}>↓ Export</button>
      </div>
    </div>
  );
}

function SectionCard({ title, badge, children }) {
  return (
    <div style={s.card}>
      <div style={s.sectionHdr}>
        <span style={s.sectionTitle}>{title}</span>
        <span style={{fontSize:12,color:'#a89078'}}>{badge}</span>
      </div>
      {children}
    </div>
  );
}

function MobileDayCard({ row }) {
  const matched = Math.abs(row.difference) < 0.01;
  return (
    <div style={{...s.mCard,borderLeft:`3px solid ${matched?'#b5d08a':Math.abs(row.difference)>5?'#c1440e':'#f0c97a'}`}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontWeight:700,fontSize:13,color:'#2d1f14'}}>{fDate(row.date)}</span>
        <MatchPill matched={matched}/>
      </div>
      <VenuePill name={row.venue_name}/>
      <div style={{height:8}}/>
      <MRow label="Manager Total"   value={row.manager_total > 0 ? <span style={{fontWeight:700,color:'#7c3d8c'}}>{`£${f2(row.manager_total)}`}</span> : <E/>}/>
      <MRow label="Square Redeemed" value={row.sq_total > 0 ? <span style={{color:'#2563eb'}}>{`£${f2(row.sq_total)}`}</span> : <E/>}/>
      <MRow label="Difference"      value={<DiffCell value={row.difference}/>}/>
      <MRow label="Receipts"        value={String(row.sq_count)}/>
    </div>
  );
}

function KPI({ label, value, count, color, diff }) {
  let display, displayColor = color;
  if (diff && value != null) {
    const abs = Math.abs(value);
    if (abs < 0.01) { display = '✓ Match'; displayColor = '#4a6622'; }
    else { display = value > 0 ? `+£${f2(abs)}` : `−£${f2(abs)}`; displayColor = abs > 5 ? '#991b1b' : '#7c5200'; }
  } else if (value != null) {
    display = `£${f2(value)}`;
  } else {
    display = String(count ?? 0);
  }
  return (
    <div style={s.kpi}>
      <span style={{fontSize:10,color:'#a89078',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</span>
      <span style={{fontSize:22,fontWeight:800,color:displayColor,marginTop:2}}>{display}</span>
    </div>
  );
}

function MRow({ label, value }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 0',fontSize:13}}>
      <span style={{fontSize:12,color:'#7d6553'}}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function DiffCell({ value }) {
  if (value == null) return <E/>;
  const abs = Math.abs(value);
  if (abs < 0.01) return <span style={{color:'#4a6622',fontWeight:700}}>✓</span>;
  const color = abs > 5 ? '#991b1b' : '#7c5200';
  const bg    = abs > 5 ? '#fef2f2' : '#fffbeb';
  return <span style={{fontSize:12,fontWeight:700,color,background:bg,padding:'2px 7px',borderRadius:5}}>{value > 0 ? `+£${f2(abs)}` : `−£${f2(abs)}`}</span>;
}

function MatchPill({ matched }) {
  return matched
    ? <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:20,background:'#f0f5e8',color:'#4a6622',border:'1px solid #b5d08a'}}>✓ Matched</span>
    : <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:20,background:'#fef3ee',color:'#c1440e',border:'1px solid #f5b8a0'}}>⚠ Discrepancy</span>;
}

function VenuePill({ name }) {
  const c = name?.includes('Waterfront') ? '#2563eb' : '#c1440e';
  return <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:20,background:c+'18',color:c}}>{name}</span>;
}

function Tag({ text }) {
  return <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,background:'#eff6ff',color:'#1d4ed8',fontWeight:600}}>{text}</span>;
}

function E() { return <span style={{color:'#a89078',fontSize:11}}>—</span>; }

function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => `"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: filename });
  a.click();
}

const s = {
  root:        { display:'flex', flexDirection:'column', gap:16 },
  filterBar:   { display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', background:'#fff', borderRadius:12, padding:'12px 16px', border:'1px solid #ede8e0' },
  venueBadge:  { fontSize:13, fontWeight:600, padding:'4px 12px', borderRadius:20, whiteSpace:'nowrap' },
  dateInput:   { padding:'6px 10px', border:'1px solid #ede8e0', borderRadius:7, fontSize:13, color:'#2d1f14', background:'#fff' },
  presetBtn:   { padding:'5px 12px', background:'#faf7f2', border:'1px solid #ede8e0', borderRadius:6, fontSize:12, color:'#7d6553', cursor:'pointer', whiteSpace:'nowrap' },
  exportBtn:   { padding:'6px 13px', background:'#2d1f14', color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' },
  tabBar:      { display:'flex', background:'#fff', borderRadius:10, border:'1px solid #ede8e0', padding:'4px', gap:4 },
  tab:         { flex:1, padding:'8px 12px', border:'none', borderRadius:7, background:'none', fontSize:13, color:'#7d6553', cursor:'pointer', fontWeight:500, transition:'all 0.15s' },
  tabActive:   { background:'#2d1f14', color:'#fff', fontWeight:700 },
  kpi:         { background:'#fff', border:'1.5px solid #ede8e0', borderRadius:10, padding:'12px 14px', display:'flex', flexDirection:'column', gap:4 },
  card:        { background:'#fff', borderRadius:12, border:'1px solid #ede8e0', overflow:'hidden' },
  sectionHdr:  { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid #f5ede0', background:'#fafaf8' },
  sectionTitle:{ fontSize:13, fontWeight:700, color:'#2d1f14' },
  table:       { width:'100%', borderCollapse:'collapse' },
  th:          { padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'#a89078', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #f5ede0', whiteSpace:'nowrap' },
  td:          { padding:'11px 12px', fontSize:13, color:'#4a3728', borderBottom:'1px solid #faf5ee', verticalAlign:'middle' },
  empty:       { padding:40, textAlign:'center', color:'#a89078', fontSize:14 },
  code:        { fontFamily:'monospace', fontSize:11, background:'#f5ede0', padding:'2px 6px', borderRadius:4, color:'#4a3728' },
  mCard:       { padding:'14px 16px', borderBottom:'1px solid #f5ede0', display:'flex', flexDirection:'column', gap:4 },
};
