import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const CARD_META = {
  cash_sales:    { label: 'Cash Sales',    color: '#5a7a30', bg: '#f0f5e8', icon: '£' },
  card_sales:    { label: 'Card Sales',    color: '#2563eb', bg: '#eff6ff', icon: '▤' },
  total_sales:   { label: 'Total Sales',   color: '#c1440e', bg: '#fef3ee', icon: '∑' },
  reconciled:    { label: 'Reconciled',    color: '#5a7a30', bg: '#f0f5e8', icon: '✓' },
  pending:       { label: 'Pending',       color: '#c88a2e', bg: '#fdf5e0', icon: '◷' },
  cash_variance: { label: 'Cash Variance', color: '#c1440e', bg: '#fef3ee', icon: '△' },
};

const DETAIL_META = {
  refunds:    { label: 'Refunds',       color: '#c1440e', bg: '#fef3ee', icon: '↩' },
  comps:      { label: 'Complimentary', color: '#c88a2e', bg: '#fdf5e0', icon: '★' },
  discounts:  { label: 'Discounts',     color: '#7c5c2e', bg: '#fdf5e7', icon: '%' },
  gift_cards: { label: 'Gift Vouchers', color: '#2563eb', bg: '#eff6ff', icon: '◈' },
};

const VENUE_COLORS = ['#c1440e', '#2563eb', '#5a7a30', '#c88a2e'];

export default function Dashboard({ venues, showToast, navigateTo }) {
  const [selectedVenue, setSelectedVenue] = useState('all');
  const [stats,          setStats]         = useState(null);
  const [summary,        setSummary]       = useState(null);
  const [activeCard,     setActiveCard]    = useState(null);
  const [dateRange,      setDateRange]     = useState({ from: monthStart(), to: today() });
  const [loading,        setLoading]       = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Fetch stats when venue changes
  useEffect(() => {
    setActiveCard(null);
    setSummary(null);
    setLoading(true);
    const params = {};
    if (selectedVenue !== 'all') params.venue_id = selectedVenue;
    api.getDashboardStats(params)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [selectedVenue]);

  // Fetch summary when activeCard, dateRange, or selectedVenue changes
  useEffect(() => {
    if (!activeCard) { setSummary(null); return; }
    setSummaryLoading(true);
    let cancelled = false;
    const params = { from: dateRange.from, to: dateRange.to };
    if (selectedVenue !== 'all') params.venue_id = selectedVenue;
    api.getSummary(params)
      .then(data => { if (!cancelled) { setSummary(data); setSummaryLoading(false); } })
      .catch(() => { if (!cancelled) { setSummary(null); setSummaryLoading(false); } });
    return () => { cancelled = true; };
  }, [activeCard, dateRange.from, dateRange.to, selectedVenue]);

  function handleCardClick(cardId) {
    setActiveCard(prev => prev === cardId ? null : cardId);
  }

  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const m = stats?.monthly ?? {};
  const d = stats?.detail  ?? {};

  const venueLabel = selectedVenue === 'all'
    ? 'Both Venues'
    : venues.find(v => v.id === selectedVenue)?.name ?? 'Venue';

  if (loading) return <div style={s.loading}>Loading…</div>;

  return (
    <div style={s.root}>

      {/* ── Venue switcher ─────────────────────────────────────────────────── */}
      <div style={s.venueSwitcher}>
        <button
          onClick={() => setSelectedVenue('all')}
          style={{ ...s.venueBtn, ...(selectedVenue === 'all' ? s.venueBtnActive : {}) }}
        >
          Both Venues
        </button>
        {venues.map(v => (
          <button
            key={v.id}
            onClick={() => setSelectedVenue(v.id)}
            style={{ ...s.venueBtn, ...(selectedVenue === v.id ? s.venueBtnActive : {}) }}
          >
            {v.name}
          </button>
        ))}
      </div>

      {/* ── Top 6 stat cards ──────────────────────────────────────────────── */}
      <div style={s.statsGrid}>
        <StatCard id="cash_sales"    value={`£${f2(stats?.total_cash)}`}    sub="This period"         active={activeCard} onClick={handleCardClick} />
        <StatCard id="card_sales"    value={`£${f2(stats?.total_card)}`}    sub="This period"         active={activeCard} onClick={handleCardClick} />
        <StatCard id="total_sales"   value={`£${f2(stats?.total_sales)}`}   sub={venueLabel}          active={activeCard} onClick={handleCardClick} />
        <StatCard id="reconciled"    value={stats?.reconciled ?? 0}          sub="Reports matched"     active={activeCard} onClick={handleCardClick} />
        <StatCard id="pending"       value={stats?.pending ?? 0}             sub="Awaiting reconcile"  active={activeCard} onClick={handleCardClick} />
        <StatCard id="cash_variance" value={`£${f2(stats?.cash_variance)}`} sub="Total this period"   active={activeCard} onClick={handleCardClick}
          override={(stats?.cash_variance || 0) > 20 ? { color: '#c1440e', bg: '#fef3ee' } : { color: '#5a7a30', bg: '#f0f5e8' }} />
      </div>

      {/* ── 4 detail cards ────────────────────────────────────────────────── */}
      <div style={s.detailGrid}>
        <DetailCard id="refunds"    count={m.refunds?.count ?? 0}    total={m.refunds?.total ?? 0}    active={activeCard} onClick={handleCardClick} warn={(m.refunds?.count   ?? 0) > 0} />
        <DetailCard id="comps"      count={m.comps?.count ?? 0}      total={m.comps?.total ?? 0}      active={activeCard} onClick={handleCardClick} warn={(m.comps?.total     ?? 0) > 100} />
        <DetailCard id="discounts"  count={m.discounts?.count ?? 0}  total={m.discounts?.total ?? 0}  active={activeCard} onClick={handleCardClick} warn={(m.discounts?.total ?? 0) > 200} />
        <DetailCard id="gift_cards" count={m.gift_cards?.count ?? 0} total={m.gift_cards?.total ?? 0} active={activeCard} onClick={handleCardClick} warn={false} />
      </div>

      {/* ── Expanded drilldown panel ───────────────────────────────────────── */}
      {activeCard && (
        <div className="detail-panel" style={s.panel}>
          <div style={s.panelHeader}>
            <div style={s.panelTitleRow}>
              <span style={{
                ...s.panelIcon,
                background: (CARD_META[activeCard] || DETAIL_META[activeCard])?.bg,
                color: (CARD_META[activeCard] || DETAIL_META[activeCard])?.color,
              }}>
                {(CARD_META[activeCard] || DETAIL_META[activeCard])?.icon}
              </span>
              <h3 style={s.panelTitle}>{(CARD_META[activeCard] || DETAIL_META[activeCard])?.label}</h3>
              <span style={s.venueBadge}>{venueLabel}</span>
            </div>
            <div style={s.panelRight}>
              <span style={s.dateLabel}>From:</span>
              <input
                type="date" value={dateRange.from}
                onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))}
                style={s.dateInput}
              />
              <span style={s.dateLabel}>to</span>
              <input
                type="date" value={dateRange.to}
                onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))}
                style={s.dateInput}
              />
              <button onClick={() => setActiveCard(null)} style={s.closeBtn}>✕ Close</button>
            </div>
          </div>

          <div style={{ padding: '20px 24px' }}>
            {summaryLoading
              ? <p style={{ color: '#a89078', fontSize: 13, padding: 16 }}>Loading…</p>
              : <PanelContent activeCard={activeCard} summary={summary} detail={d} />
            }
          </div>
        </div>
      )}

      {/* ── Reconcile widget ──────────────────────────────────────────────── */}
      <ReconcileWidget
        reconciled={stats?.reconciled ?? 0}
        pending={stats?.pending ?? 0}
        navigateTo={navigateTo}
      />

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

// ── Panel content ─────────────────────────────────────────────────────────────

function PanelContent({ activeCard, summary, detail }) {
  if (!summary && CARD_META[activeCard]) {
    return <p style={{ color: '#a89078', fontSize: 13, padding: 16 }}>No data — try adjusting the date range.</p>;
  }

  if (activeCard === 'cash_sales' || activeCard === 'card_sales' || activeCard === 'total_sales') {
    const field = activeCard;
    return (
      <DataTable
        columns={['Date', 'Venue', CARD_META[activeCard].label, 'Reconciled']}
        rows={(summary ?? []).map(r => [
          fDate(r.date),
          r.venue_name,
          <Amt value={r[field]} color={CARD_META[activeCard].color} />,
          <Tick ok={r.sq_total != null} />,
        ])}
        empty="No reports found for this period."
      />
    );
  }

  if (activeCard === 'reconciled') {
    const rows = (summary ?? []).filter(r => r.sq_total != null);
    return (
      <DataTable
        columns={['Date', 'Venue', 'Mgr Total', 'Sq Total', 'Variance', 'Status']}
        rows={rows.map(r => {
          const variance = Math.abs((r.total_sales || 0) - (r.sq_total || 0));
          return [
            fDate(r.date), r.venue_name,
            <Amt value={r.total_sales} color="#5a7a30" />,
            <Amt value={r.sq_total} color="#2563eb" />,
            variance < 0.01
              ? <span style={{ color: '#5a7a30', fontWeight: 700 }}>—</span>
              : <span style={{ color: '#c1440e', fontWeight: 700 }}>£{f2(variance)}</span>,
            <StatusPill ok={variance < 5} label={variance < 5 ? 'OK' : 'Warn'} />,
          ];
        })}
        empty="No reconciled reports this period."
      />
    );
  }

  if (activeCard === 'pending') {
    const rows = (summary ?? []).filter(r => r.sq_total == null);
    return (
      <DataTable
        columns={['Date', 'Venue', 'Total', 'Days Pending']}
        rows={rows.map(r => {
          const days = Math.floor((Date.now() - new Date(r.date + 'T00:00:00')) / 86400000);
          return [
            fDate(r.date), r.venue_name,
            <Amt value={r.total_sales} color="#c88a2e" />,
            <span style={{ color: days > 2 ? '#c1440e' : '#a89078', fontWeight: days > 2 ? 700 : 400 }}>
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
    const balanced = rows.filter(r => Math.abs((r.cash_sales || 0) - (r.sq_cash || 0)) < 5).length;
    const withVariance = rows.length - balanced;
    return (
      <>
        {rows.length > 0 && (
          <div style={s.varianceBanner}>
            <span style={{ fontSize: 13, color: '#5a7a30', fontWeight: 600 }}>✓ {balanced} balanced</span>
            <span style={{ fontSize: 13, color: withVariance > 0 ? '#c1440e' : '#a89078', fontWeight: 600 }}>
              {withVariance > 0 ? `⚠ ${withVariance} with variance` : 'No variances'}
            </span>
          </div>
        )}
        <DataTable
          columns={['Date', 'Venue', 'Expected Cash (Square)', 'Actual Cash (Manager)', 'Difference', 'Status']}
          rows={rows.map(r => {
            const diff = (r.cash_sales || 0) - (r.sq_cash || 0);
            const isOk = Math.abs(diff) < 5;
            return [
              fDate(r.date), r.venue_name,
              `£${f2(r.sq_cash)}`,
              `£${f2(r.cash_sales)}`,
              <span style={{ color: isOk ? '#5a7a30' : '#c1440e', fontWeight: 700 }}>
                {diff >= 0 ? '+' : '−'}£{f2(Math.abs(diff))}
              </span>,
              <StatusPill ok={isOk} label={isOk ? 'Balanced' : 'Variance'} />,
            ];
          })}
          empty="No cash variance data this period."
        />
      </>
    );
  }

  if (activeCard === 'refunds') {
    return (
      <DataTable
        columns={['Date', 'Venue', 'Receipt #', 'Amount', 'Reason', 'Status']}
        rows={(detail.recentRefunds ?? []).map(r => [
          fDate(r.date), r.venue_name,
          <code style={s.code}>{r.receipt_number}</code>,
          <Amt value={r.amount} color="#c1440e" />,
          r.reason || '—',
          <StatusPill ok={r.status === 'COMPLETED'} label={r.status} />,
        ])}
        empty="No refunds this period."
      />
    );
  }

  if (activeCard === 'comps') {
    return (
      <DataTable
        columns={['Date', 'Venue', 'Receipt #', 'Item', 'Variation', 'Qty', 'Value']}
        rows={(detail.recentComps ?? []).map(c => [
          fDate(c.date), c.venue_name,
          <code style={s.code}>{c.receipt_number}</code>,
          c.item_name,
          c.variation_name || '—',
          c.quantity,
          <Amt value={c.amount} color="#c88a2e" />,
        ])}
        empty="No complimentary items this period."
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
                  <span style={s.tagAccent}>{dt.discount_type}</span>
                  <span style={s.tagWarm}>{dt.scope}</span>
                </div>
                <span style={{ ...s.discAmt, color: '#7c5c2e' }}>£{f2(dt.total_amount)}</span>
                <span style={s.discTimes}>{dt.occurrences}× applied</span>
              </div>
            ))}
          </div>
        )}
        <DataTable
          columns={['Discount Name', 'Type', 'Scope', 'Times Used', 'Total Amount']}
          rows={(detail.discByType ?? []).map(dt => [
            dt.discount_name,
            <span style={s.tagAccent}>{dt.discount_type}</span>,
            <span style={s.tagWarm}>{dt.scope}</span>,
            dt.occurrences,
            <Amt value={dt.total_amount} color="#7c5c2e" />,
          ])}
          empty="No discounts this period."
        />
      </>
    );
  }

  if (activeCard === 'gift_cards') {
    return (
      <DataTable
        columns={['Date', 'Venue', 'Receipt #', 'Card Last 4', 'Type', 'Amount']}
        rows={(detail.recentGiftCards ?? []).map(g => [
          fDate(g.date), g.venue_name,
          <code style={s.code}>{g.receipt_number}</code>,
          <code style={s.code}>···· {g.gift_card_last4}</code>,
          <span style={s.tagAccent}>{g.activity_type}</span>,
          <Amt value={g.amount} color="#2563eb" />,
        ])}
        empty="No gift voucher activity this period."
      />
    );
  }

  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ id, value, sub, active, onClick, override }) {
  const meta = CARD_META[id];
  const color = override?.color ?? meta.color;
  const bg    = override?.bg    ?? meta.bg;
  const isActive = active === id;
  return (
    <button
      className={`dash-card${isActive ? ' active' : ''}`}
      onClick={() => onClick(id)}
      style={{ ...s.statCard, background: isActive ? bg : '#fff', borderColor: isActive ? color : '#ede8e0', textAlign: 'left' }}
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
      style={{ ...s.detailCard, background: isActive ? meta.bg : '#fff', borderColor: isActive ? meta.color : '#ede8e0', textAlign: 'left' }}
    >
      <div style={s.detailTop}>
        <span style={{ ...s.detailIconWrap, background: meta.bg, color: meta.color }}>{meta.icon}</span>
        {warn && <span style={s.warnDot} />}
        <span style={s.cardChevron}>{isActive ? '▲' : '▼'}</span>
      </div>
      <div style={{ ...s.detailAmt, color: meta.color }}>{count > 0 ? `£${f2(total)}` : '—'}</div>
      <div style={s.cardLabel}>{meta.label}</div>
      <div style={s.cardSub}>{count} {count === 1 ? 'item' : 'items'} this period</div>
    </button>
  );
}

function DataTable({ columns, rows, empty }) {
  if (!rows.length) return <p style={{ color: '#a89078', fontSize: 13, padding: '20px 0' }}>{empty}</p>;
  return (
    <div style={{ overflowX: 'auto', marginTop: 4 }}>
      <table style={s.dtTable}>
        <thead>
          <tr>{columns.map(c => <th key={c} style={s.dtTh}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fefcf9' }}>
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
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: ok ? '#f0f5e8' : '#fef3ee', color: ok ? '#5a7a30' : '#c1440e', fontWeight: 700, fontSize: 13 }}>
      {ok ? '✓' : '✕'}
    </span>
  );
}

function Amt({ value, color }) {
  return <span style={{ color, fontWeight: 700, fontSize: 13 }}>£{f2(value)}</span>;
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
const today     = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };

// ── styles ────────────────────────────────────────────────────────────────────
const s = {
  root:    { display: 'flex', flexDirection: 'column', gap: 20 },
  loading: { color: '#a89078', padding: 40, textAlign: 'center' },

  // Venue switcher
  venueSwitcher: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  venueBtn: {
    padding: '7px 16px', borderRadius: 20, border: '1.5px solid #ede8e0',
    background: '#fff', color: '#7d6553', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', transition: 'all 0.15s',
  },
  venueBtnActive: {
    background: '#c1440e', borderColor: '#c1440e', color: '#fff', fontWeight: 600,
  },

  // Stat cards
  statsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  statCard:   { borderRadius: 14, padding: '18px 20px', border: '1.5px solid', display: 'flex', flexDirection: 'column', gap: 4, background: '#fff' },
  cardTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 },
  cardChevron:{ fontSize: 9, color: '#d4c4b0' },
  cardValue:  { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 },
  cardLabel:  { fontSize: 13, fontWeight: 600, color: '#4a3728', marginTop: 2 },
  cardSub:    { fontSize: 11, color: '#a89078' },

  // Detail cards
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  detailCard: { borderRadius: 14, padding: '18px 20px', border: '1.5px solid', display: 'flex', flexDirection: 'column', gap: 4 },
  detailTop:  { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailIconWrap: { width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 },
  warnDot:    { width: 8, height: 8, borderRadius: '50%', background: '#c1440e', marginLeft: 'auto' },
  detailAmt:  { fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1 },

  // Expanded panel
  panel:      { background: '#fff', borderRadius: 14, border: '1.5px solid #ede8e0', boxShadow: '0 4px 20px rgba(45,31,20,0.08)', overflow: 'hidden' },
  panelHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f5ede0', background: '#fefcf9', flexWrap: 'wrap', gap: 10 },
  panelTitleRow: { display: 'flex', alignItems: 'center', gap: 10 },
  panelIcon:  { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 },
  panelTitle: { fontSize: 15, fontWeight: 700, color: '#2d1f14' },
  venueBadge: { fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#fef3ee', color: '#c1440e', border: '1px solid #f5c8b0' },
  panelRight: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dateLabel:  { fontSize: 12, color: '#7d6553', fontWeight: 500 },
  dateInput:  { border: '1px solid #ede8e0', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#2d1f14', background: '#fff' },
  closeBtn:   { padding: '6px 14px', border: '1px solid #ede8e0', background: '#fff', borderRadius: 7, fontSize: 13, color: '#7d6553', cursor: 'pointer' },

  varianceBanner: { display: 'flex', gap: 24, padding: '10px 0 16px', borderBottom: '1px solid #f5ede0', marginBottom: 8 },

  discGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, paddingBottom: 16, borderBottom: '1px solid #f5ede0', marginBottom: 12 },
  discCard: { border: '1px solid #ede8e0', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, background: '#fefcf9' },
  discName: { fontSize: 13, fontWeight: 700, color: '#2d1f14' },
  discTags: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  discAmt:  { fontSize: 18, fontWeight: 800, marginTop: 4 },
  discTimes:{ fontSize: 11, color: '#a89078' },
  tagAccent:{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#fef3ee', color: '#9a2e05', fontWeight: 600 },
  tagWarm:  { fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f5ede0', color: '#7d6553', fontWeight: 600 },

  dtTable:  { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  dtTh:     { padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #f5ede0', whiteSpace: 'nowrap' },
  dtTd:     { padding: '11px 16px', borderBottom: '1px solid #f5ede0', color: '#4a3728', verticalAlign: 'middle' },
  code:     { fontFamily: 'monospace', fontSize: 12, background: '#f5ede0', padding: '2px 7px', borderRadius: 4, color: '#4a3728' },

  // Reconcile widget
  widget:     { display: 'flex', alignItems: 'center', gap: 20, padding: '18px 24px', borderRadius: 14, border: '1.5px solid', flexWrap: 'wrap' },
  widgetIcon: { width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  widgetTitle:{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 160 },
  widgetStats:{ display: 'flex', gap: 24 },
  widgetStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  widgetBtn:  { padding: '9px 18px', background: '#c1440e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },

  // Recent reports section
  section:      { background: '#fff', borderRadius: 14, border: '1.5px solid #ede8e0', overflow: 'hidden' },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#2d1f14', padding: '16px 24px', borderBottom: '1px solid #f5ede0' },
  table:        { width: '100%', borderCollapse: 'collapse' },
  th:           { padding: '9px 24px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f5ede0' },
  td:           { padding: '12px 24px', fontSize: 13, color: '#4a3728' },
  empty:        { padding: '32px 24px', color: '#a89078', fontSize: 14, textAlign: 'center' },
  venuePillSmall: { fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, border: '1px solid', whiteSpace: 'nowrap' },
};
