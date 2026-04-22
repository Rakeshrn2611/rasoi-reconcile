import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';

// Which card is currently expanded → what data + columns to show
const CARD_META = {
  cash_sales:    { label: 'Cash Sales',    color: '#10b981', bg: '#f0fdf4', icon: '💵', valueFn: r => r.cash_sales,  cols: ['Date','Venue','Cash Sales','Reconciled'] },
  card_sales:    { label: 'Card Sales',    color: '#3b82f6', bg: '#eff6ff', icon: '💳', valueFn: r => r.card_sales,  cols: ['Date','Venue','Card Sales','Reconciled'] },
  total_sales:   { label: 'Total Sales',   color: '#0ea5e9', bg: '#f0f9ff', icon: '📊', valueFn: r => r.total_sales, cols: ['Date','Venue','Total Sales','Reconciled'] },
  reconciled:    { label: 'Reconciled',    color: '#8b5cf6', bg: '#f5f3ff', icon: '✓',  valueFn: r => r.total_sales, cols: ['Date','Venue','Total','Variance','Status'] },
  pending:       { label: 'Pending',       color: '#f59e0b', bg: '#fffbeb', icon: '⏳', valueFn: r => r.total_sales, cols: ['Date','Venue','Total Sales','Days Since'] },
  cash_variance: { label: 'Cash Variance', color: '#ef4444', bg: '#fef2f2', icon: '⚠',  valueFn: r => r.cash_sales,  cols: ['Date','Venue','Mgr Cash','Sq Cash','Variance'] },
};

const DETAIL_META = {
  refunds:    { label: 'Refunds',       color: '#ef4444', bg: '#fef2f2', icon: '↩',  cols: ['Date','Venue','Receipt #','Amount','Reason','Status'] },
  comps:      { label: 'Complimentary', color: '#f59e0b', bg: '#fffbeb', icon: '★',  cols: ['Date','Venue','Receipt #','Item','Variation','Qty','Value'] },
  discounts:  { label: 'Discounts',     color: '#8b5cf6', bg: '#f5f3ff', icon: '%',  cols: ['Discount Name','Type','Scope','Times Used','Total Amount'] },
  gift_cards: { label: 'Gift Vouchers', color: '#0ea5e9', bg: '#f0f9ff', icon: '🎁', cols: ['Date','Venue','Receipt #','Card Last 4','Type','Amount'] },
};

export default function Dashboard() {
  const [stats,     setStats]     = useState(null);
  const [summary,   setSummary]   = useState(null);
  const [activeCard, setActiveCard] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    api.getDashboardStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const handleCardClick = useCallback(async (cardId) => {
    if (activeCard === cardId) { setActiveCard(null); return; }
    setActiveCard(cardId);
    if (!summary) {
      try {
        const data = await api.getSummary({ from: monthStart(), to: today() });
        setSummary(data);
      } catch {}
    }
  }, [activeCard, summary]);

  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const m = stats?.monthly ?? {};
  const d = stats?.detail  ?? {};

  if (loading) return <div style={s.loading}>Loading…</div>;

  return (
    <div style={s.root}>
      <p style={s.subtitle}>Overview for {month} — click any card to drill down</p>

      {/* ── Top 6 stat cards ──────────────────────────────────────────────── */}
      <div style={s.statsGrid}>
        <StatCard id="cash_sales"    value={`£${f2(stats?.total_cash)}`}    sub="This month"         active={activeCard} onClick={handleCardClick} />
        <StatCard id="card_sales"    value={`£${f2(stats?.total_card)}`}    sub="This month"         active={activeCard} onClick={handleCardClick} />
        <StatCard id="total_sales"   value={`£${f2(stats?.total_sales)}`}   sub="All venues"         active={activeCard} onClick={handleCardClick} />
        <StatCard id="reconciled"    value={stats?.reconciled ?? 0}          sub="Reports matched"    active={activeCard} onClick={handleCardClick} />
        <StatCard id="pending"       value={stats?.pending ?? 0}             sub="Awaiting reconcile" active={activeCard} onClick={handleCardClick} />
        <StatCard id="cash_variance" value={`£${f2(stats?.cash_variance)}`} sub="Total this month"   active={activeCard} onClick={handleCardClick}
          override={(stats?.cash_variance || 0) > 20 ? { color: '#ef4444', bg: '#fef2f2' } : null} />
      </div>

      {/* ── 4 detail cards ────────────────────────────────────────────────── */}
      <div style={s.detailGrid}>
        <DetailCard id="refunds"    count={m.refunds?.count ?? 0}    total={m.refunds?.total ?? 0}    active={activeCard} onClick={handleCardClick} warn={(m.refunds?.count   ?? 0) > 0} />
        <DetailCard id="comps"      count={m.comps?.count ?? 0}      total={m.comps?.total ?? 0}      active={activeCard} onClick={handleCardClick} warn={(m.comps?.total     ?? 0) > 100} />
        <DetailCard id="discounts"  count={m.discounts?.count ?? 0}  total={m.discounts?.total ?? 0}  active={activeCard} onClick={handleCardClick} warn={(m.discounts?.total ?? 0) > 200} />
        <DetailCard id="gift_cards" count={m.gift_cards?.count ?? 0} total={m.gift_cards?.total ?? 0} active={activeCard} onClick={handleCardClick} warn={false} />
      </div>

      {/* ── Expanded panel ────────────────────────────────────────────────── */}
      {activeCard && (
        <div className="detail-panel" style={s.panel}>
          <div style={s.panelHeader}>
            <div style={s.panelTitleRow}>
              <span style={{ ...s.panelIcon, background: (CARD_META[activeCard] || DETAIL_META[activeCard])?.color + '20', color: (CARD_META[activeCard] || DETAIL_META[activeCard])?.color }}>
                {(CARD_META[activeCard] || DETAIL_META[activeCard])?.icon}
              </span>
              <h3 style={s.panelTitle}>{(CARD_META[activeCard] || DETAIL_META[activeCard])?.label} — {month}</h3>
            </div>
            <button onClick={() => setActiveCard(null)} style={s.closeBtn}>✕ Close</button>
          </div>

          <div style={{ padding: '20px 24px' }}>
            <PanelContent activeCard={activeCard} summary={summary} detail={d} />
          </div>
        </div>
      )}

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
              {stats.recent.map(r => (
                <tr key={r.id} style={s.tr}>
                  <td style={s.td}>{fDate(r.date)}</td>
                  <td style={s.td}>{r.venue_name}</td>
                  <td style={s.td}>£{f2(r.cash_sales)}</td>
                  <td style={s.td}>£{f2(r.card_sales)}</td>
                  <td style={{ ...s.td, fontWeight: 700 }}>£{f2(r.total_sales)}</td>
                  <td style={s.td}><StatusPill ok={!!r.has_square} label={r.has_square ? 'Reconciled' : 'Pending'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Panel content ─────────────────────────────────────────────────────────────

function PanelContent({ activeCard, summary, detail }) {
  if (!summary && CARD_META[activeCard]) {
    return <p style={{ color: '#94a3b8', fontSize: 13, padding: 16 }}>Loading…</p>;
  }

  // Stat card panels — show report rows
  if (activeCard === 'cash_sales' || activeCard === 'card_sales' || activeCard === 'total_sales') {
    const field = activeCard; // cash_sales | card_sales | total_sales
    return (
      <DataTable
        columns={CARD_META[activeCard].cols}
        rows={(summary ?? []).map(r => [
          fDate(r.date),
          r.venue_name,
          <Amt value={r[field]} color={CARD_META[activeCard].color} />,
          <Tick ok={r.sq_total != null} />,
        ])}
        empty="No reports found for this month."
      />
    );
  }

  if (activeCard === 'reconciled') {
    const rows = (summary ?? []).filter(r => r.sq_total != null);
    return (
      <DataTable
        columns={CARD_META.reconciled.cols}
        rows={rows.map(r => {
          const variance = Math.abs((r.total_sales || 0) - (r.sq_total || 0));
          return [
            fDate(r.date), r.venue_name,
            <Amt value={r.total_sales} color="#8b5cf6" />,
            variance < 0.01
              ? <span style={{ color: '#10b981', fontWeight: 700 }}>—</span>
              : <span style={{ color: '#ef4444', fontWeight: 700 }}>£{f2(variance)}</span>,
            <StatusPill ok={variance < 5} label={variance < 5 ? 'OK' : 'Warn'} />,
          ];
        })}
        empty="No reconciled reports this month."
      />
    );
  }

  if (activeCard === 'pending') {
    const rows = (summary ?? []).filter(r => r.sq_total == null);
    return (
      <DataTable
        columns={CARD_META.pending.cols}
        rows={rows.map(r => {
          const days = Math.floor((Date.now() - new Date(r.date + 'T00:00:00')) / 86400000);
          return [
            fDate(r.date), r.venue_name,
            <Amt value={r.total_sales} color="#f59e0b" />,
            <span style={{ color: days > 2 ? '#ef4444' : '#94a3b8', fontWeight: days > 2 ? 700 : 400 }}>
              {days === 0 ? 'Today' : `${days}d ago`}
            </span>,
          ];
        })}
        empty="No pending reports — everything reconciled!"
      />
    );
  }

  if (activeCard === 'cash_variance') {
    const rows = (summary ?? []).filter(r => r.sq_total != null);
    return (
      <DataTable
        columns={CARD_META.cash_variance.cols}
        rows={rows.map(r => {
          const variance = (r.cash_sales || 0) - (r.sq_cash || 0);
          return [
            fDate(r.date), r.venue_name,
            `£${f2(r.cash_sales)}`,
            `£${f2(r.sq_cash)}`,
            <span style={{ color: Math.abs(variance) > 5 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
              {variance >= 0 ? '+' : '−'}£{f2(Math.abs(variance))}
            </span>,
          ];
        })}
        empty="No cash variance data this month."
      />
    );
  }

  // Detail card panels
  if (activeCard === 'refunds') {
    return (
      <DataTable
        columns={DETAIL_META.refunds.cols}
        rows={(detail.recentRefunds ?? []).map(r => [
          fDate(r.date), r.venue_name,
          <code style={s.code}>{r.receipt_number}</code>,
          <Amt value={r.amount} color="#ef4444" />,
          r.reason || '—',
          <StatusPill ok={r.status === 'COMPLETED'} label={r.status} />,
        ])}
        empty="No refunds this month."
      />
    );
  }

  if (activeCard === 'comps') {
    return (
      <DataTable
        columns={DETAIL_META.comps.cols}
        rows={(detail.recentComps ?? []).map(c => [
          fDate(c.date), c.venue_name,
          <code style={s.code}>{c.receipt_number}</code>,
          c.item_name,
          c.variation_name || '—',
          c.quantity,
          <Amt value={c.amount} color="#f59e0b" />,
        ])}
        empty="No complimentary items this month."
      />
    );
  }

  if (activeCard === 'discounts') {
    return (
      <>
        {(detail.discByType ?? []).length > 0 && (
          <div style={s.discGrid}>
            {detail.discByType.map((dt, i) => (
              <div key={i} style={s.discCard}>
                <span style={s.discName}>{dt.discount_name}</span>
                <div style={s.discTags}>
                  <span style={s.tagBlue}>{dt.discount_type}</span>
                  <span style={s.tagGray}>{dt.scope}</span>
                </div>
                <span style={{ ...s.discAmt, color: '#8b5cf6' }}>£{f2(dt.total_amount)}</span>
                <span style={s.discTimes}>{dt.occurrences}× applied</span>
              </div>
            ))}
          </div>
        )}
        <DataTable
          columns={DETAIL_META.discounts.cols}
          rows={(detail.discByType ?? []).map(dt => [
            dt.discount_name,
            <span style={s.tagBlue}>{dt.discount_type}</span>,
            <span style={s.tagGray}>{dt.scope}</span>,
            dt.occurrences,
            <Amt value={dt.total_amount} color="#8b5cf6" />,
          ])}
          empty="No discounts this month."
        />
      </>
    );
  }

  if (activeCard === 'gift_cards') {
    return (
      <DataTable
        columns={DETAIL_META.gift_cards.cols}
        rows={(detail.recentGiftCards ?? []).map(g => [
          fDate(g.date), g.venue_name,
          <code style={s.code}>{g.receipt_number}</code>,
          <code style={s.code}>···· {g.gift_card_last4}</code>,
          <span style={s.tagBlue}>{g.activity_type}</span>,
          <Amt value={g.amount} color="#0ea5e9" />,
        ])}
        empty="No gift voucher activity this month."
      />
    );
  }

  return null;
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function StatCard({ id, value, sub, active, onClick, override }) {
  const meta = CARD_META[id];
  const color = override?.color ?? meta.color;
  const bg    = override?.bg    ?? meta.bg;
  const isActive = active === id;
  return (
    <button
      className={`dash-card${isActive ? ' active' : ''}`}
      onClick={() => onClick(id)}
      style={{ ...s.statCard, background: isActive ? bg : '#fff', borderColor: isActive ? color : '#e2e8f0', textAlign: 'left' }}
    >
      <div style={s.cardTop}>
        <span style={{ ...s.cardIconWrap, background: bg, color }}>{meta.icon}</span>
        <span style={s.cardChevron}>{isActive ? '▲' : '▼'}</span>
      </div>
      <div style={{ ...s.cardValue, color }}>{value}</div>
      <div style={s.cardLabel}>{meta.label}</div>
      <div style={s.cardSub}>{sub}</div>
    </button>
  );
}

function DetailCard({ id, count, total, active, onClick, warn }) {
  const meta = DETAIL_META[id];
  const isActive = active === id;
  return (
    <button
      className={`dash-card${isActive ? ' active' : ''}`}
      onClick={() => onClick(id)}
      style={{ ...s.detailCard, background: isActive ? meta.bg : '#fff', borderColor: isActive ? meta.color : '#e2e8f0', textAlign: 'left' }}
    >
      <div style={s.detailTop}>
        <span style={{ ...s.detailIconWrap, background: meta.bg, color: meta.color }}>{meta.icon}</span>
        {warn && <span style={s.warnDot} />}
        <span style={s.cardChevron}>{isActive ? '▲' : '▼'}</span>
      </div>
      <div style={{ ...s.detailAmt, color: meta.color }}>{count > 0 ? `£${f2(total)}` : '—'}</div>
      <div style={s.cardLabel}>{meta.label}</div>
      <div style={s.cardSub}>{count} {count === 1 ? 'item' : 'items'} this month</div>
    </button>
  );
}

function DataTable({ columns, rows, empty }) {
  if (!rows.length) return <p style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>{empty}</p>;
  return (
    <div style={{ overflowX: 'auto', marginTop: 4 }}>
      <table style={s.dtTable}>
        <thead>
          <tr>{columns.map(c => <th key={c} style={s.dtTh}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              {row.map((cell, j) => <td key={j} style={s.dtTd}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tick({ ok }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: ok ? '#dcfce7' : '#fef2f2', color: ok ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: 13 }}>
      {ok ? '✓' : '✕'}
    </span>
  );
}

function Amt({ value, color }) {
  return <span style={{ color, fontWeight: 700, fontSize: 13 }}>£{f2(value)}</span>;
}

function StatusPill({ ok, label }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: ok ? '#dcfce7' : '#fef9c3', color: ok ? '#166534' : '#854d0e', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ── utils ─────────────────────────────────────────────────────────────────────
const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const today     = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };

// ── styles ────────────────────────────────────────────────────────────────────
const s = {
  root:      { display: 'flex', flexDirection: 'column', gap: 20 },
  loading:   { color: '#94a3b8', padding: 40, textAlign: 'center' },
  subtitle:  { color: '#64748b', fontSize: 13 },

  // Stat cards
  statsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  statCard:   { borderRadius: 14, padding: '18px 20px', border: '1.5px solid', display: 'flex', flexDirection: 'column', gap: 4, background: '#fff' },
  cardTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 },
  cardChevron:{ fontSize: 9, color: '#cbd5e1' },
  cardValue:  { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 },
  cardLabel:  { fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 2 },
  cardSub:    { fontSize: 11, color: '#9ca3af' },

  // Detail cards
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  detailCard: { borderRadius: 14, padding: '18px 20px', border: '1.5px solid', display: 'flex', flexDirection: 'column', gap: 4 },
  detailTop:  { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailIconWrap: { width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 },
  warnDot:    { width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginLeft: 'auto' },
  detailAmt:  { fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1 },

  // Expanded panel
  panel:      { background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', overflow: 'hidden' },
  panelHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' },
  panelTitleRow: { display: 'flex', alignItems: 'center', gap: 10 },
  panelIcon:  { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 },
  panelTitle: { fontSize: 15, fontWeight: 700, color: '#0f172a' },
  closeBtn:   { padding: '6px 14px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, fontSize: 13, color: '#64748b', cursor: 'pointer' },
  panelBody:  { padding: '20px 24px' },

  discGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, padding: '16px 24px', borderBottom: '1px solid #f1f5f9' },
  discCard: { border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, background: '#fafafa' },
  discName: { fontSize: 13, fontWeight: 700, color: '#0f172a' },
  discTags: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  discAmt:  { fontSize: 18, fontWeight: 800, marginTop: 4 },
  discTimes:{ fontSize: 11, color: '#94a3b8' },
  tagBlue:  { fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#e0e7ff', color: '#3730a3', fontWeight: 600 },
  tagGray:  { fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', fontWeight: 600 },

  dtTable:  { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  dtTh:     { padding: '10px 24px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #f1f5f9', whiteSpace: 'nowrap' },
  dtTd:     { padding: '11px 24px', borderBottom: '1px solid #f8fafc', color: '#374151', verticalAlign: 'middle' },
  code:     { fontFamily: 'monospace', fontSize: 12, background: '#f1f5f9', padding: '2px 7px', borderRadius: 4, color: '#374151' },

  section:      { background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' },
  sectionTitle: { fontSize: 15, fontWeight: 700, padding: '16px 24px', borderBottom: '1px solid #f1f5f9' },
  table:        { width: '100%', borderCollapse: 'collapse' },
  th:           { padding: '9px 24px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f1f5f9' },
  tr:           { borderBottom: '1px solid #f8fafc' },
  td:           { padding: '12px 24px', fontSize: 13, color: '#374151' },
  empty:        { padding: '32px 24px', color: '#94a3b8', fontSize: 14, textAlign: 'center' },
};
