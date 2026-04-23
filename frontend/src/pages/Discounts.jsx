import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

export default function Discounts({ selectedVenue, venues, showToast }) {
  const isMobile = useIsMobile();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo]     = useState(today());
  const [discounts, setDiscounts] = useState([]);
  const [comps,     setComps]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('discounts');

  const venueName = selectedVenue === 'all' ? 'All Venues' : venues.find(v => v.id === selectedVenue)?.name ?? '';

  useEffect(() => { load(); }, [selectedVenue, from, to]);

  async function load() {
    setLoading(true);
    try {
      const p = { from, to };
      if (selectedVenue !== 'all') p.venue_id = selectedVenue;
      const [d, c] = await Promise.all([api.getDiscounts(p), api.getComps(p)]);
      setDiscounts(d); setComps(c);
    } catch {}
    setLoading(false);
  }

  const totalDisc = discounts.reduce((s, r) => s + (r.amount || 0), 0);
  const totalComp = comps.reduce((s, r) => s + (r.amount || 0), 0);

  function doExport() {
    if (tab === 'discounts') {
      downloadCSV('discounts.csv', discounts.map(r => ({
        Date: r.date, Venue: r.venue_name, 'Discount Name': r.discount_name,
        Type: r.discount_type, Scope: r.scope, Amount: f2(r.amount),
        'Receipt #': r.receipt_number,
      })));
    } else {
      downloadCSV('comps.csv', comps.map(r => ({
        Date: r.date, Venue: r.venue_name, Item: r.item_name,
        Variation: r.variation_name, Qty: r.quantity, Value: f2(r.amount),
      })));
    }
  }

  const activeRows = tab === 'discounts' ? discounts : comps;

  return (
    <div style={s.root}>
      <ContextBar venueName={venueName} from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={doExport} color="#7c5c2e" bg="#fdf5e7" />
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total Discounts (Square)" value={totalDisc} color="#7c5c2e" accent />
        <KPI label="Total Comps (Square)" value={totalComp} color="#c88a2e" />
        <KPI label="Combined Total" value={totalDisc + totalComp} color="#c1440e" />
      </div>
      <div style={s.tableCard}>
        <div style={s.tabRow}>
          <button onClick={() => setTab('discounts')} style={{ ...s.tab, ...(tab === 'discounts' ? s.tabActive : {}) }}>
            Discounts ({discounts.length})
          </button>
          <button onClick={() => setTab('comps')} style={{ ...s.tab, ...(tab === 'comps' ? s.tabActive : {}) }}>
            Complimentary ({comps.length})
          </button>
        </div>
        {loading ? <p style={s.empty}>Loading…</p>
         : !activeRows.length ? <p style={s.empty}>No data for this period.</p>
         : isMobile ? activeRows.map((r, i) => (
             tab === 'discounts'
               ? <MobileCard key={i} title={fDate(r.date)} subtitle={r.venue_name} items={[
                   { label: 'Name', value: r.discount_name || '—' },
                   { label: 'Type', value: r.discount_type || '—' },
                   { label: 'Amount', value: `£${f2(r.amount)}`, strong: true, color: '#7c5c2e' },
                 ]} />
               : <MobileCard key={i} title={fDate(r.date)} subtitle={r.venue_name} items={[
                   { label: 'Item', value: r.item_name || '—' },
                   { label: 'Qty',  value: String(r.quantity) },
                   { label: 'Value', value: `£${f2(r.amount)}`, strong: true, color: '#c88a2e' },
                 ]} />
           ))
         : tab === 'discounts' ? (
           <table style={s.table}>
             <thead><tr>{['Date','Venue','Discount Name','Type','Scope','Amount'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
             <tbody>{discounts.map((r,i)=>(
               <tr key={i} style={{background:i%2===0?'#fff':'#fefcf9'}}>
                 <td style={s.td}>{fDate(r.date)}</td>
                 <td style={s.td}><VenuePill name={r.venue_name}/></td>
                 <td style={{...s.td,fontWeight:600}}>{r.discount_name}</td>
                 <td style={s.td}><Tag text={r.discount_type}/></td>
                 <td style={s.td}><Tag text={r.scope} light/></td>
                 <td style={{...s.td,fontWeight:700,color:'#7c5c2e'}}>£{f2(r.amount)}</td>
               </tr>
             ))}</tbody>
           </table>
         ) : (
           <table style={s.table}>
             <thead><tr>{['Date','Venue','Item','Variation','Qty','Value'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
             <tbody>{comps.map((r,i)=>(
               <tr key={i} style={{background:i%2===0?'#fff':'#fefcf9'}}>
                 <td style={s.td}>{fDate(r.date)}</td>
                 <td style={s.td}><VenuePill name={r.venue_name}/></td>
                 <td style={s.td}>{r.item_name}</td>
                 <td style={s.td}>{r.variation_name||'—'}</td>
                 <td style={s.td}>{r.quantity}</td>
                 <td style={{...s.td,fontWeight:700,color:'#c88a2e'}}>£{f2(r.amount)}</td>
               </tr>
             ))}</tbody>
           </table>
         )}
      </div>
    </div>
  );
}

function ContextBar({ venueName, from, to, setFrom, setTo, onExport, color, bg }) {
  return (
    <div style={s.ctxBar}>
      <span style={{...s.venueBadge,color,background:bg}}>📍 {venueName}</span>
      <div style={s.dateRow}>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={s.dateInput}/>
        <span style={{color:'#a89078',fontSize:13}}>–</span>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={s.dateInput}/>
      </div>
      <button onClick={onExport} style={s.exportBtn}>↓ Export CSV</button>
    </div>
  );
}

function KPI({ label, value, color, accent }) {
  return (
    <div style={{...s.kpi,borderColor:accent?color:'#ede8e0',background:accent?color+'10':'#fff'}}>
      <span style={{fontSize:11,color:'#a89078',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</span>
      <span style={{fontSize:24,fontWeight:800,color,letterSpacing:'-0.5px',marginTop:4}}>£{f2(value)}</span>
    </div>
  );
}

function MobileCard({ title, subtitle, items }) {
  return (
    <div style={s.mCard}>
      <div style={s.mCardHeader}>
        <span style={{fontWeight:700,fontSize:14,color:'#2d1f14'}}>{title}</span>
        <span style={{fontSize:12,color:'#a89078'}}>{subtitle}</span>
      </div>
      {items.map((it,i)=>(
        <div key={i} style={s.mCardRow}>
          <span style={{fontSize:12,color:'#7d6553'}}>{it.label}</span>
          <span style={{fontSize:13,fontWeight:it.strong?700:400,color:it.color||'#2d1f14'}}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function VenuePill({ name }) {
  const c = name?.includes('Waterfront') ? '#2563eb' : '#c1440e';
  return <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:20,background:c+'18',color:c}}>{name}</span>;
}
function Tag({ text, light }) {
  return <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,background:light?'#f5ede0':'#fef3ee',color:light?'#7d6553':'#9a2e05',fontWeight:600}}>{text}</span>;
}
function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','),...rows.map(r=>keys.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),download:filename});
  a.click();
}
const f2=n=>(Number(n)||0).toFixed(2);
const fDate=d=>d?new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;};

const s = {
  root:{display:'flex',flexDirection:'column',gap:16},
  ctxBar:{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',background:'#fff',borderRadius:12,padding:'12px 16px',border:'1px solid #ede8e0'},
  venueBadge:{fontSize:13,fontWeight:600,padding:'4px 12px',borderRadius:20},
  dateRow:{display:'flex',alignItems:'center',gap:8,flex:1},
  dateInput:{padding:'6px 10px',border:'1px solid #ede8e0',borderRadius:7,fontSize:13,color:'#2d1f14',background:'#fff'},
  exportBtn:{padding:'7px 14px',background:'#2d1f14',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'},
  kpi:{background:'#fff',borderRadius:12,padding:'14px 16px',border:'1.5px solid',display:'flex',flexDirection:'column',gap:2},
  tableCard:{background:'#fff',borderRadius:12,border:'1px solid #ede8e0',overflow:'hidden'},
  tabRow:{display:'flex',borderBottom:'1px solid #f5ede0',padding:'0 4px'},
  tab:{padding:'10px 16px',border:'none',background:'none',fontSize:13,color:'#7d6553',cursor:'pointer',borderBottom:'2px solid transparent'},
  tabActive:{color:'#2d1f14',fontWeight:700,borderBottomColor:'#c1440e'},
  table:{width:'100%',borderCollapse:'collapse'},
  th:{padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:'#a89078',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid #f5ede0'},
  td:{padding:'11px 14px',fontSize:13,color:'#4a3728',borderBottom:'1px solid #faf5ee'},
  empty:{padding:40,textAlign:'center',color:'#a89078',fontSize:14},
  mCard:{padding:'14px 16px',borderBottom:'1px solid #f5ede0'},
  mCardHeader:{display:'flex',justifyContent:'space-between',marginBottom:10},
  mCardRow:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0'},
};
