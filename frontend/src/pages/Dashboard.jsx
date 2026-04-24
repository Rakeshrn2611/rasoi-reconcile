import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const CARD_META = {
  cash_sales:    { label: 'Cash Sales',    color: '#5a7a30', bg: '#f0f5e8', icon: '£',  nav: 'cash' },
  card_sales:    { label: 'Card Sales',    color: '#2563eb', bg: '#eff6ff', icon: '▤',  nav: 'card' },
  total_sales:   { label: 'Total Sales',   color: '#c1440e', bg: '#fef3ee', icon: '∑',  nav: 'total_sales' },
  cash_variance: { label: 'Discrepancies', color: '#c1440e', bg: '#fef3ee', icon: '△',  nav: 'discrepancies' },
};

const DETAIL_META = {
  refunds:    { label: 'Refunds',       color: '#c1440e', bg: '#fef3ee', icon: '↩', nav: 'refunds' },
  comps:      { label: 'Complimentary', color: '#c88a2e', bg: '#fdf5e0', icon: '★', nav: 'discounts' },
  discounts:  { label: 'Discounts',     color: '#7c5c2e', bg: '#fdf5e7', icon: '%', nav: 'discounts' },
  gift_cards: { label: 'Gift Vouchers', color: '#2563eb', bg: '#eff6ff', icon: '◈', nav: 'gift_cards' },
};

const VENUE_COLORS = ['#c1440e', '#2563eb', '#5a7a30', '#c88a2e'];

export default function Dashboard({ venues, showToast, navigateTo, selectedVenue, setSelectedVenue }) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (selectedVenue !== 'all') params.venue_id = selectedVenue;
    api.getDashboardStats(params)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [selectedVenue]);

  const m = stats?.monthly ?? {};

  const venueLabel = selectedVenue === 'all'
    ? 'Both Venues'
    : venues.find(v => v.id === selectedVenue)?.name ?? 'Venue';

  if (loading) return <div style={s.loading}>Loading…</div>;

  return (
    <div style={s.root}>

      {/* ── Top 4 KPI stat cards ──────────────────────────────────────────── */}
      <div className="stats-grid" style={{ ...s.statsGrid, gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)' }}>
        <StatCard id="cash_sales"    value={`£${f2(stats?.total_cash)}`}    sub="This period"       navigateTo={navigateTo} />
        <StatCard id="card_sales"    value={`£${f2(stats?.total_card)}`}    sub="This period"       navigateTo={navigateTo} />
        <StatCard id="total_sales"   value={`£${f2(stats?.total_sales)}`}   sub={venueLabel}        navigateTo={navigateTo} />
        <StatCard id="cash_variance" value={`£${f2(stats?.cash_variance)}`} sub="Total this period" navigateTo={navigateTo}
          override={(stats?.cash_variance || 0) > 20 ? { color: '#c1440e', bg: '#fef3ee' } : { color: '#5a7a30', bg: '#f0f5e8' }} />
      </div>

      {/* ── Sales breakdown chart ─────────────────────────────────────────── */}
      <SalesBreakdown stats={stats} />

      {/* ── 4 detail cards ────────────────────────────────────────────────── */}
      <div className="detail-grid" style={s.detailGrid}>
        <DetailCard id="refunds"    count={m.refunds?.count ?? 0}    total={m.refunds?.total ?? 0}    navigateTo={navigateTo} warn={(m.refunds?.count   ?? 0) > 0} />
        <DetailCard id="comps"      count={m.comps?.count ?? 0}      total={m.comps?.total ?? 0}      navigateTo={navigateTo} warn={(m.comps?.total     ?? 0) > 100} />
        <DetailCard id="discounts"  count={m.discounts?.count ?? 0}  total={m.discounts?.total ?? 0}  navigateTo={navigateTo} warn={(m.discounts?.total ?? 0) > 200} />
        <DetailCard id="gift_cards" count={m.gift_cards?.count ?? 0} total={m.gift_cards?.total ?? 0} navigateTo={navigateTo} warn={false} />
      </div>

      {/* ── Reconcile widget ──────────────────────────────────────────────── */}
      <ReconcileWidget reconciled={stats?.reconciled ?? 0} pending={stats?.pending ?? 0} navigateTo={navigateTo} />

      {/* ── Recent reports ────────────────────────────────────────────────── */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Recent Manager Reports</h2>
        {!stats?.recent?.length ? (
          <p style={s.empty}>No reports yet. Go to Manager Reports to add one.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>{['Date','Venue','Cash','Card','Total','Status'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {stats.recent.map((r, i) => {
                const vIdx = venues.findIndex(v => v.id === r.venue_id);
                const vc = VENUE_COLORS[vIdx >= 0 ? vIdx % VENUE_COLORS.length : 0];
                return (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fefcf9' }}>
                    <td style={s.td}>{fDate(r.date)}</td>
                    <td style={s.td}>
                      <span style={{ ...s.venuePillSmall, background: vc + '18', color: vc, borderColor: vc + '30' }}>
                        {r.venue_name}
                      </span>
                    </td>
                    <td style={s.td}>£{f2(r.cash_sales)}</td>
                    <td style={s.td}>£{f2(r.card_sales)}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: '#2d1f14' }}>£{f2(r.total_sales)}</td>
                    <td style={s.td}><StatusPill ok={!!r.has_square} label={r.has_square ? 'Reconciled' : 'Pending'} /></td>
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

// ── Sales Breakdown (Donut Chart) ─────────────────────────────────────────────

function SalesBreakdown({ stats }) {
  const cash     = stats?.total_cash     || 0;
  const card     = stats?.total_card     || 0;
  const deposits = stats?.total_deposits || 0;
  const gifts    = stats?.total_gifts    || 0;
  const petty    = stats?.total_petty    || 0;

  const slices = [
    { label: 'Cash Sales',    value: cash,     color: '#5a7a30' },
    { label: 'Card Sales',    value: card,     color: '#2563eb' },
    { label: 'Deposits',      value: deposits, color: '#c88a2e' },
    { label: 'Gift Vouchers', value: gifts,    color: '#7c3d8c' },
    { label: 'Petty Cash',    value: petty,    color: '#a89078' },
  ].filter(sl => sl.value > 0);

  const grand = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div style={s.breakdownCard}>
      <div style={s.breakdownHeader}>
        <span style={s.breakdownTitle}>Sales Breakdown</span>
        <span style={{ fontSize: 12, color: '#a89078' }}>Click any card above to see details</span>
      </div>
      <div className="breakdown-body" style={s.breakdownBody}>
        <div style={s.chartWrap}>
          <DonutChart slices={slices} grand={grand} size={180} />
        </div>
        <div className="legend-list" style={s.legendList}>
          {slices.length === 0 ? (
            <p style={{ color: '#a89078', fontSize: 13, margin: 0 }}>No data for this period.</p>
          ) : slices.map((sl, i) => (
            <div key={i} style={s.legendItem}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: sl.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: '#4a3728' }}>{sl.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>£{f2(sl.value)}</span>
              <span style={{ fontSize: 11, color: '#a89078', minWidth: 38, textAlign: 'right' }}>
                {grand > 0 ? Math.round((sl.value / grand) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
        {slices.length > 0 && (
          <div className="grand-box" style={s.grandBox}>
            <span style={{ fontSize: 11, color: '#a89078', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Grand Total</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#c1440e', letterSpacing: '-0.5px' }}>£{f2(grand)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DonutChart({ slices, grand, size }) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.38, r = size * 0.23;

  const total = slices.reduce((s, x) => s + (x.value || 0), 0);
  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f0ebe4" strokeWidth={R - r} />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="#a89078">No data</text>
      </svg>
    );
  }

  let start = -Math.PI / 2;
  const segments = [];
  for (const sl of slices) {
    const val = sl.value || 0;
    if (val <= 0) continue;
    const pct = val / total;
    const end = start + pct * 2 * Math.PI;
    let d;
    if (pct > 0.9999) {
      d = `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.001} ${cy - R} Z
           M ${cx} ${cy - r} A ${r} ${r} 0 1 0 ${cx - 0.001} ${cy - r} Z`;
    } else {
      const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
      const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
      const ix1 = cx + r * Math.cos(end),   iy1 = cy + r * Math.sin(end);
      const ix2 = cx + r * Math.cos(start), iy2 = cy + r * Math.sin(start);
      const lg = pct > 0.5 ? 1 : 0;
      d = `M${x1},${y1} A${R},${R},0,${lg},1,${x2},${y2} L${ix1},${iy1} A${r},${r},0,${lg},0,${ix2},${iy2} Z`;
    }
    segments.push({ d, color: sl.color });
    start = end;
  }

  const dispK = grand >= 1000;
  const centre = dispK ? `£${(grand / 1000).toFixed(1)}k` : `£${f2(grand)}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => (
        <path key={i} d={seg.d} fill={seg.color} stroke="#fff" strokeWidth={2} />
      ))}
      <text x={cx} y={cy - 8}  textAnchor="middle" fontSize={10} fill="#a89078">Total</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={15} fontWeight="800" fill="#2d1f14">{centre}</text>
    </svg>
  );
}

// ── ReconcileWidget ───────────────────────────────────────────────────────────

function ReconcileWidget({ reconciled, pending, navigateTo }) {
  const total = reconciled + pending;
  const pct   = total > 0 ? Math.round((reconciled / total) * 100) : 100;
  const allDone = pending === 0;

  return (
    <div style={{
      ...s.widget,
      background: allDone ? '#f0f5e8' : '#fdf5e0',
      borderColor: allDone ? '#b5d08a' : '#e8c97a',
    }}>
      <div style={s.widgetIcon}>
        <span style={{ fontSize: 22, color: allDone ? '#5a7a30' : '#c88a2e' }}>⚖</span>
      </div>
      <div style={s.widgetTitle}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#2d1f14' }}>Reconciliation Status</span>
        <span style={{ fontSize: 12, color: '#7d6553', marginTop: 2 }}>
          {reconciled} report{reconciled !== 1 ? 's' : ''} reconciled · {pending} pending this month
        </span>
      </div>
      <div style={s.widgetStats}>
        <div style={s.widgetStat}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#5a7a30' }}>{reconciled}</span>
          <span style={{ fontSize: 10, color: '#7d6553', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reconciled</span>
        </div>
        <div style={s.widgetStat}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#c88a2e' }}>{pending}</span>
          <span style={{ fontSize: 10, color: '#7d6553', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending</span>
        </div>
        <div style={s.widgetStat}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#c1440e' }}>{pct}%</span>
          <span style={{ fontSize: 10, color: '#7d6553', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Complete</span>
        </div>
      </div>
      <button onClick={() => navigateTo('reconcile')} style={s.widgetBtn}>
        Open Reconciliation →
      </button>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ id, value, sub, navigateTo, override }) {
  const meta = CARD_META[id];
  const color = override?.color ?? meta.color;
  const bg    = override?.bg    ?? meta.bg;
  return (
    <button
      className="dash-card"
      onClick={() => navigateTo(meta.nav)}
      style={{ ...s.statCard, background: '#fff', borderColor: '#ede8e0', textAlign: 'left' }}
    >
      <div style={s.cardTop}>
        <span style={{ ...s.cardIconWrap, background: bg, color }}>{meta.icon}</span>
        <span style={{ fontSize: 10, color: '#d4c4b0' }}>→</span>
      </div>
      <div style={{ ...s.cardValue, color }}>{value}</div>
      <div style={s.cardLabel}>{meta.label}</div>
      <div style={s.cardSub}>{sub}</div>
    </button>
  );
}

function DetailCard({ id, count, total, navigateTo, warn }) {
  const meta = DETAIL_META[id];
  return (
    <button
      className="dash-card"
      onClick={() => navigateTo(meta.nav)}
      style={{ ...s.detailCard, background: '#fff', borderColor: '#ede8e0', textAlign: 'left' }}
    >
      <div style={s.detailTop}>
        <span style={{ ...s.detailIconWrap, background: meta.bg, color: meta.color }}>{meta.icon}</span>
        {warn && <span style={s.warnDot} />}
        <span style={{ fontSize: 10, color: '#d4c4b0', marginLeft: 'auto' }}>→</span>
      </div>
      <div style={{ ...s.detailAmt, color: meta.color }}>{count > 0 ? `£${f2(total)}` : '—'}</div>
      <div style={s.cardLabel}>{meta.label}</div>
      <div style={s.cardSub}>{count} {count === 1 ? 'item' : 'items'} this period</div>
    </button>
  );
}

function StatusPill({ ok, label }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
      background: ok ? '#f0f5e8' : '#fdf5e0',
      color: ok ? '#4a6622' : '#7c5200',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ── utils ─────────────────────────────────────────────────────────────────────
const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── styles ────────────────────────────────────────────────────────────────────
const s = {
  root:    { display: 'flex', flexDirection: 'column', gap: 20 },
  loading: { color: '#a89078', padding: 40, textAlign: 'center' },

  statsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  statCard:   { borderRadius: 14, padding: '18px 20px', border: '1.5px solid', display: 'flex', flexDirection: 'column', gap: 4, background: '#fff', cursor: 'pointer' },
  cardTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 },
  cardValue:  { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 },
  cardLabel:  { fontSize: 13, fontWeight: 600, color: '#4a3728', marginTop: 2 },
  cardSub:    { fontSize: 11, color: '#a89078' },

  breakdownCard: {
    background: '#fff', borderRadius: 14, border: '1.5px solid #ede8e0',
    boxShadow: '0 1px 4px rgba(45,31,20,0.05)', overflow: 'hidden',
  },
  breakdownHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 20px', borderBottom: '1px solid #f5ede0', background: '#fefcf9',
  },
  breakdownTitle: { fontSize: 14, fontWeight: 700, color: '#2d1f14' },
  breakdownBody: {
    display: 'flex', alignItems: 'center', gap: 28, padding: '20px 24px', flexWrap: 'wrap',
  },
  chartWrap: { flexShrink: 0 },
  legendList: { flex: 1, display: 'flex', flexDirection: 'column', gap: 11, minWidth: 200 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 10 },
  grandBox:   {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
    borderLeft: '1px solid #f0e8dc', paddingLeft: 24, marginLeft: 'auto',
  },

  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  detailCard: { borderRadius: 14, padding: '18px 20px', border: '1.5px solid', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' },
  detailTop:  { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailIconWrap: { width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 },
  warnDot:    { width: 8, height: 8, borderRadius: '50%', background: '#c1440e' },
  detailAmt:  { fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1 },

  widget:     { display: 'flex', alignItems: 'center', gap: 20, padding: '18px 24px', borderRadius: 14, border: '1.5px solid', flexWrap: 'wrap' },
  widgetIcon: { width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  widgetTitle:{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 160 },
  widgetStats:{ display: 'flex', gap: 24 },
  widgetStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  widgetBtn:  { padding: '9px 18px', background: '#c1440e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },

  section:      { background: '#fff', borderRadius: 14, border: '1.5px solid #ede8e0', overflow: 'hidden' },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#2d1f14', padding: '16px 24px', borderBottom: '1px solid #f5ede0' },
  table:        { width: '100%', borderCollapse: 'collapse' },
  th:           { padding: '9px 24px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f5ede0' },
  td:           { padding: '12px 24px', fontSize: 13, color: '#4a3728' },
  empty:        { padding: '32px 24px', color: '#a89078', fontSize: 14, textAlign: 'center' },
  venuePillSmall: { fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, border: '1px solid', whiteSpace: 'nowrap' },
};
