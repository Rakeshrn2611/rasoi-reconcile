import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

export default function Refunds({ selectedVenue, venues, showToast }) {
  const isMobile = useIsMobile();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo]     = useState(today());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const venueName = selectedVenue === 'all' ? 'All Venues' : venues.find(v => v.id === selectedVenue)?.name ?? '';

  useEffect(() => { load(); }, [selectedVenue, from, to]);

  async function load() {
    setLoading(true);
    try {
      const p = { from, to };
      if (selectedVenue !== 'all') p.venue_id = selectedVenue;
      setRows(await api.getRefunds(p));
    } catch {}
    setLoading(false);
  }

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const count = rows.length;
  const completed = rows.filter(r => r.status === 'COMPLETED').length;

  function doExport() {
    downloadCSV('refunds.csv', rows.map(r => ({
      Date: r.date, Venue: r.venue_name,
      'Receipt #': r.receipt_number, Amount: f2(r.amount),
      Reason: r.reason, Status: r.status,
    })));
  }

  return (
    <div style={s.root}>
      <ContextBar venueName={venueName} from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={doExport} color="#c1440e" bg="#fef3ee" />
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total Refunds" value={total} color="#c1440e" accent />
        <KPI label="Number of Refunds" count={count} color="#c1440e" />
        <KPI label="Completed" count={completed} color="#5a7a30" />
      </div>
      <div style={s.tableCard}>
        {loading ? <p style={s.empty}>Loading…</p>
         : !rows.length ? <p style={s.empty}>No refunds for this period.</p>
         : isMobile ? rows.map((r, i) => (
             <MobileCard key={i} title={fDate(r.date)} subtitle={r.venue_name} items={[
               { label: 'Receipt #',  value: r.receipt_number || '—' },
               { label: 'Amount',     value: `£${f2(r.amount)}`, strong: true, color: '#c1440e' },
               { label: 'Reason',     value: r.reason || '—' },
               { label: 'Status',     value: r.status, ok: r.status === 'COMPLETED' },
             ]} />
           ))
         : (
           <table style={s.table}>
             <thead><tr>{['Date','Venue','Receipt #','Amount','Reason','Status'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
             <tbody>{rows.map((r,i)=>(
               <tr key={i} style={{background:i%2===0?'#fff':'#fefcf9'}}>
                 <td style={s.td}>{fDate(r.date)}</td>
                 <td style={s.td}><VenuePill name={r.venue_name}/></td>
                 <td style={s.td}><code style={s.code}>{r.receipt_number}</code></td>
                 <td style={{...s.td,fontWeight:700,color:'#c1440e'}}>£{f2(r.amount)}</td>
                 <td style={s.td}>{r.reason||'—'}</td>
                 <td style={s.td}><StatusPill ok={r.status==='COMPLETED'} label={r.status}/></td>
               </tr>
             ))}</tbody>
           </table>
         )}
      </div>
    </div>
  );
}

function ContextBar({ venueName, from, to, setFrom, setTo, onExport, color='#c1440e', bg='#fef3ee' }) {
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

function KPI({ label, value, count, color, accent }) {
  return (
    <div style={{...s.kpi,borderColor:accent?color:'#ede8e0',background:accent?color+'10':'#fff'}}>
      <span style={{fontSize:11,color:'#a89078',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</span>
      {value != null
        ? <span style={{fontSize:24,fontWeight:800,color,letterSpacing:'-0.5px',marginTop:4}}>£{f2(value)}</span>
        : <span style={{fontSize:28,fontWeight:800,color,letterSpacing:'-0.5px',marginTop:4}}>{count}</span>
      }
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
          {it.ok!=null
            ?<span style={{fontSize:12,fontWeight:600,color:it.ok?'#5a7a30':'#c88a2e'}}>{it.value}</span>
            :<span style={{fontSize:13,fontWeight:it.strong?700:400,color:it.color||'#2d1f14'}}>{it.value}</span>
          }
        </div>
      ))}
    </div>
  );
}

function VenuePill({ name }) {
  const c = name?.includes('Waterfront') ? '#2563eb' : '#c1440e';
  return <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:20,background:c+'18',color:c}}>{name}</span>;
}
function StatusPill({ ok, label }) {
  return <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:ok?'#f0f5e8':'#fdf5e0',color:ok?'#4a6622':'#7c5200'}}>{label}</span>;
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
  table:{width:'100%',borderCollapse:'collapse'},
  th:{padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:'#a89078',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid #f5ede0'},
  td:{padding:'11px 14px',fontSize:13,color:'#4a3728',borderBottom:'1px solid #faf5ee'},
  empty:{padding:40,textAlign:'center',color:'#a89078',fontSize:14},
  code:{fontFamily:'monospace',fontSize:11,background:'#f5ede0',padding:'2px 6px',borderRadius:4,color:'#4a3728'},
  mCard:{padding:'14px 16px',borderBottom:'1px solid #f5ede0'},
  mCardHeader:{display:'flex',justifyContent:'space-between',marginBottom:10},
  mCardRow:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0'},
};
