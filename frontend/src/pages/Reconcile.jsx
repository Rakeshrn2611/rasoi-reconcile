import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const DETAIL_TABS = ['refunds', 'comps', 'discounts', 'gift_cards'];
const DETAIL_LABELS = { refunds: 'Refunds', comps: 'Complimentary', discounts: 'Discounts', gift_cards: 'Gift Vouchers' };

// ── Helpers ───────────────────────────────────────────────────────────────────
const f2    = n => (Number(n) || 0).toFixed(2);
const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
function today()      { return new Date().toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: filename,
  });
  a.click();
}

function exportListCSV(rows) {
  downloadCSV('reconciliation-status.csv', rows.map(r => ({
    Date: r.date,
    Venue: r.venue_name,
    'Cash Sales': f2(r.cash_sales),
    'Card Sales': f2(r.card_sales),
    'Grand Total': f2(r.grand_total || r.total_sales),
    Status: r.sq_total != null ? 'Reconciled' : 'Pending',
  })));
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Reconcile({ venues, showToast, selectedVenue: globalVenueFilter }) {
  const isMobile = useIsMobile();

  // View state
  const [view, setView]       = useState('list');
  const [selected, setSelected] = useState(null); // full summary row

  // List state
  const [rows, setRows]             = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [venueFilter, setVenueFilter] = useState('all');
  const [from, setFrom]             = useState(monthStart());
  const [to, setTo]                 = useState(today());

  // Detail state
  const [result, setResult]         = useState(null);
  const [reconNotes, setReconNotes] = useState('');
  const [fetching, setFetching]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [detailTab, setDetailTab]   = useState('refunds');
  const [locking, setLocking]       = useState(false);
  const [isLocked, setIsLocked]     = useState(false);

  // Cash verification state
  const [actualCash,      setActualCash]      = useState('');
  const [actualCashNotes, setActualCashNotes] = useState('');
  const [savingCash,      setSavingCash]      = useState(false);

  // ── List data load ───────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== 'list') return;
    loadList();
  }, [view, venueFilter, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadList() {
    setListLoading(true);
    try {
      const params = { from, to };
      if (venueFilter !== 'all') params.venue_id = venueFilter;
      const data = await api.getSummary(params);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message, 'error');
      setRows([]);
    }
    setListLoading(false);
  }

  // ── Detail actions ───────────────────────────────────────────────────────
  function openDetail(row) {
    setSelected(row);
    setView('detail');
    setResult(null);
    setError('');
    setReconNotes('');
    setDetailTab('refunds');
    setIsLocked(row.sq_locked === 1);
    setActualCash(row.actual_cash_held != null ? String(row.actual_cash_held) : '');
    setActualCashNotes(row.actual_cash_notes || '');
  }

  function goBack() {
    setView('list');
    setSelected(null);
    setResult(null);
  }

  async function handleFetchSquare() {
    const venue = venues.find(v => v.id === selected.venue_id);
    if (!venue?.square_location_id) return setError('No Square location ID set for this venue.');
    setFetching(true); setError('');
    try {
      await api.fetchSquare(selected.venue_id, selected.date);
      showToast('Square data fetched');
      await handleReconcile();
    } catch (err) { setError(err.message); }
    setFetching(false);
  }

  async function handleReconcile() {
    setLoading(true); setError('');
    try {
      const data = await api.reconcile(selected.venue_id, selected.date);
      setResult(data);
      setReconNotes(data?.square?.recon_notes || '');
    } catch (err) { setError(err.message); setResult(null); }
    setLoading(false);
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      await api.saveReconNotes(selected.venue_id, selected.date, reconNotes);
      showToast('Notes saved');
    } catch (err) { showToast(err.message, 'error'); }
    setSavingNotes(false);
  }

  async function handleLock() {
    setLocking(true);
    try {
      await api.lockRecon(selected.venue_id, selected.date);
      setIsLocked(true);
      showToast('Reconciliation locked');
      loadList();
    } catch (err) { showToast(err.message, 'error'); }
    setLocking(false);
  }

  async function handleSaveCash() {
    if (actualCash === '') return showToast('Enter actual cash amount', 'error');
    setSavingCash(true);
    try {
      await api.setActualCash(selected.id, parseFloat(actualCash), actualCashNotes);
      showToast('Actual cash saved');
      setSelected(prev => ({ ...prev, actual_cash_held: parseFloat(actualCash), actual_cash_notes: actualCashNotes }));
    } catch (err) { showToast(err.message, 'error'); }
    setSavingCash(false);
  }

  async function handleUnlock() {
    setLocking(true);
    try {
      await api.unlockRecon(selected.venue_id, selected.date);
      setIsLocked(false);
      showToast('Reconciliation unlocked');
      loadList();
    } catch (err) { showToast(err.message, 'error'); }
    setLocking(false);
  }

  function handleExportDetailCSV() {
    if (!result) return;
    const r = result.reconciliation;
    downloadCSV(`reconciliation-${selected.venue_id}-${selected.date}.csv`, [
      { Category: 'Cash',  Square: f2(result.square.cash),  Manager: f2(r.countedCash),    Variance: f2(r.cashVar)  },
      { Category: 'Card',  Square: f2(result.square.card),  Manager: f2(result.report.card_sales), Variance: f2(r.cardVar) },
      { Category: 'Total', Square: f2(result.square.total), Manager: f2(result.report.grand_total || result.report.total_sales), Variance: f2(r.totalVar) },
    ]);
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const r   = result?.reconciliation;
  const det = result?.details ?? {};
  const isOk = r?.status === 'ok';
  const selectedVenue = selected ? venues.find(v => v.id === selected.venue_id) : null;

  const filteredRows = rows;
  const totalReports    = filteredRows.length;
  const lockedCount     = filteredRows.filter(r => r.sq_total != null && r.sq_locked === 1).length;
  const reconciledCount = filteredRows.filter(r => r.sq_total != null && r.sq_locked !== 1).length;
  const pendingCount    = filteredRows.filter(r => r.sq_total == null).length;

  // ── Render ───────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={s.listRoot}>
        {/* Context bar */}
        <div style={{ ...s.ctxBar, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <select
            value={venueFilter}
            onChange={e => setVenueFilter(e.target.value)}
            style={s.dateInput}
          >
            <option value="all">All Venues</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={s.dateInput} />
            <span style={{ color: '#a89078', fontSize: 13 }}>to</span>
            <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={s.dateInput} />
          </div>
          <button onClick={() => exportListCSV(filteredRows)} style={s.exportBtn}>Export CSV</button>
        </div>

        {/* KPI cards */}
        <div style={{ ...s.kpiGrid, gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}>
          <div style={s.kpiCard}>
            <span style={{ fontSize: 11, color: '#a89078', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</span>
            <span style={{ fontSize: 32, fontWeight: 700, color: '#2d1f14' }}>{totalReports}</span>
          </div>
          <div style={{ ...s.kpiCard, borderColor: '#93c5fd' }}>
            <span style={{ fontSize: 11, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Locked</span>
            <span style={{ fontSize: 32, fontWeight: 700, color: '#1e40af' }}>{lockedCount}</span>
          </div>
          <div style={{ ...s.kpiCard, borderColor: '#b5d08a' }}>
            <span style={{ fontSize: 11, color: '#5a7a30', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reconciled</span>
            <span style={{ fontSize: 32, fontWeight: 700, color: '#5a7a30' }}>{reconciledCount}</span>
          </div>
          <div style={{ ...s.kpiCard, borderColor: '#f0c97a' }}>
            <span style={{ fontSize: 11, color: '#c88a2e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending</span>
            <span style={{ fontSize: 32, fontWeight: 700, color: '#c88a2e' }}>{pendingCount}</span>
          </div>
        </div>

        {/* Table / cards */}
        <div style={s.listTableCard}>
          {listLoading ? (
            <p style={{ color: '#a89078', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>Loading…</p>
          ) : filteredRows.length === 0 ? (
            <p style={{ color: '#a89078', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>No reports found for this period.</p>
          ) : isMobile ? (
            /* Mobile card view */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredRows.map((row, i) => (
                <ListRow key={i} row={row} isMobile onView={() => openDetail(row)} />
              ))}
            </div>
          ) : (
            /* Desktop table */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Date', 'Venue', 'Cash Sales', 'Card Sales', 'Grand Total', 'Status', 'Actions'].map(h => (
                      <th key={h} style={s.listTh}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <ListRow key={i} row={row} isMobile={false} onView={() => openDetail(row)} tableIndex={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Detail view ───────────────────────────────────────────────────────────
  return (
    <div style={s.detailRoot}>
      {/* Header bar */}
      <div style={s.detailHeader}>
        <button onClick={goBack} style={s.backBtn}>← Back to List</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#2d1f14', fontSize: 15 }}>
            {fDate(selected?.date)} · {selected?.venue_name}
          </span>
          <StatusPill reconciled={selected?.sq_total != null && !isLocked} locked={isLocked} />
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '340px 1fr',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* LEFT panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Manager Report card */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Manager Report</h3>
            <div style={s.repGrid}>
              <RepRow label="Cash Sales"    value={selected?.cash_sales} />
              <RepRow label="Physical Cash" value={selected?.physical_cash} accent />
              <RepRow label="Card Sales"    value={selected?.card_sales} />
              <RepRow label="Deposits Used" value={selected?.deposits_used} />
              <RepRow label="Gift Vouchers" value={selected?.gift_cards_redeemed} />
              <RepRow label="Petty Cash"    value={selected?.petty_cash} />
              <RepRow label="Grand Total"   value={selected?.grand_total || selected?.total_sales} bold />
            </div>
            {selected?.petty_cash > 0 && selected?.petty_cash_notes && (
              <div style={s.noteBox}><strong>Petty cash:</strong> {selected.petty_cash_notes}</div>
            )}
            {selected?.shift_notes && (
              <div style={s.noteBox}><strong>Shift notes:</strong> {selected.shift_notes}</div>
            )}
          </div>

          {/* Tracked Separately card */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Tracked Separately</h3>
            <div style={s.repGrid}>
              <DiscRow label="Staff Discount" value={selected?.staff_discount}  notes={selected?.staff_discount_notes} />
              <DiscRow label="F&F Discount"   value={selected?.fnf_discount}    notes={selected?.fnf_discount_notes} />
              <DiscRow label="Complimentary"  value={selected?.complimentary}   notes={selected?.complimentary_notes} />
              <DiscRow label="Card Tips"      value={selected?.card_tips} />
              <DiscRow label="Cash Tips"      value={selected?.cash_tips} />
            </div>
          </div>

          {/* Cash denominations (if physical_cash present) */}
          {selected?.physical_cash > 0 && (
            <div style={s.card}>
              <h3 style={s.cardTitle}>Cash Count</h3>
              <div style={s.cashBreak}>
                <div style={s.denomGrid}>
                  {[
                    { lbl: '£50', k: 'notes_50',  mul: 50  },
                    { lbl: '£20', k: 'notes_20',  mul: 20  },
                    { lbl: '£10', k: 'notes_10',  mul: 10  },
                    { lbl: '£5',  k: 'notes_5',   mul: 5   },
                    { lbl: '£2',  k: 'coins_200', mul: 2   },
                    { lbl: '£1',  k: 'coins_100', mul: 1   },
                    { lbl: '50p', k: 'coins_50',  mul: 0.5 },
                    { lbl: '20p', k: 'coins_20',  mul: 0.2 },
                    { lbl: '10p', k: 'coins_10',  mul: 0.1 },
                  ].filter(d => selected[d.k] > 0).map(d => (
                    <div key={d.k} style={s.denomChip}>
                      <span style={{ fontSize: 10, color: '#7d6553' }}>{d.lbl}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>×{selected[d.k]}</span>
                      <span style={{ fontSize: 11, color: '#a89078' }}>£{f2(selected[d.k] * d.mul)}</span>
                    </div>
                  ))}
                </div>
                <div style={s.totalRow}>
                  <span style={{ fontSize: 13, color: '#4a3728' }}>Physical cash counted</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#2d1f14' }}>£{f2(selected.physical_cash)}</span>
                </div>
              </div>
            </div>
          )}
          {/* Cash Verification card */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Cash Verification</h3>
            {(() => {
              const net      = (selected?.physical_cash || 0) - (selected?.petty_cash || 0);
              const actual   = selected?.actual_cash_held != null ? Number(selected.actual_cash_held) : null;
              const cashDisc = actual != null ? actual - net : null;
              const isMajor  = cashDisc != null && Math.abs(cashDisc) > 5;
              const discColor = cashDisc == null ? '#a89078' : Math.abs(cashDisc) < 0.01 ? '#4a6622' : isMajor ? '#991b1b' : '#7c5200';
              return (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f9f4ef' }}>
                      <span style={{ fontSize: 13, color: '#7d6553' }}>Manager Cash (physical)</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>£{f2(selected?.physical_cash)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f9f4ef' }}>
                      <span style={{ fontSize: 13, color: '#7d6553' }}>(−) Petty Cash</span>
                      <span style={{ fontSize: 13, color: '#c88a2e', fontWeight: 600 }}>£{f2(selected?.petty_cash)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #ede8e0', fontWeight: 700 }}>
                      <span style={{ fontSize: 13, color: '#2d1f14' }}>Net Manager Cash</span>
                      <span style={{ fontSize: 13, color: '#2563eb' }}>£{f2(net)}</span>
                    </div>
                    {actual != null && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f9f4ef', fontWeight: 700 }}>
                          <span style={{ fontSize: 13, color: '#2d1f14' }}>Actual Cash Held</span>
                          <span style={{ fontSize: 13 }}>£{f2(actual)}</span>
                        </div>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 7, marginTop: 6,
                          background: Math.abs(cashDisc) < 0.01 ? '#f0f5e8' : isMajor ? '#fef2f2' : '#fffbeb',
                          border: `1px solid ${Math.abs(cashDisc) < 0.01 ? '#b5d08a' : isMajor ? '#fca5a5' : '#f0c97a'}`,
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: discColor }}>Cash Discrepancy</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: discColor }}>
                            {Math.abs(cashDisc) < 0.01 ? '✓ Match' : cashDisc > 0 ? `+£${f2(cashDisc)}` : `−£${f2(Math.abs(cashDisc))}`}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #f5ede0', paddingTop: 10, marginTop: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#7d6553' }}>Actual Cash Received / Held</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={actualCash}
                      onChange={e => setActualCash(e.target.value)}
                      placeholder="0.00"
                      style={s.input}
                    />
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#7d6553' }}>Notes</label>
                    <input
                      type="text"
                      value={actualCashNotes}
                      onChange={e => setActualCashNotes(e.target.value)}
                      placeholder="Any notes about the cash count…"
                      style={s.input}
                    />
                    <button onClick={handleSaveCash} disabled={savingCash || isLocked} style={s.btn}>
                      {savingCash ? 'Saving…' : 'Save Actual Cash'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* RIGHT panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Reconciliation Result card */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Reconciliation Result</h3>
            {!result ? (
              <div style={s.placeholder}>
                <span style={{ fontSize: 40 }}>⚖</span>
                <p style={{ fontSize: 14, color: '#a89078', textAlign: 'center' }}>
                  Click <strong>Reconcile</strong> to compare manager report against Square.
                </p>
              </div>
            ) : (
              <>
                {/* Status banner */}
                <div style={{ ...s.statusBanner, background: isOk ? '#f0f5e8' : '#fdf5e0', borderColor: isOk ? '#b5d08a' : '#f0c97a' }}>
                  <span style={{ fontSize: 22 }}>{isOk ? '✓' : '⚠'}</span>
                  <div>
                    <p style={{ fontWeight: 700, color: isOk ? '#4a6622' : '#7c5200', margin: 0 }}>
                      {isOk ? 'All figures match' : `${r.flags.length} variance${r.flags.length !== 1 ? 's' : ''} found`}
                    </p>
                    <p style={{ fontSize: 12, color: '#7d6553', marginTop: 2 }}>
                      {selectedVenue?.name ?? selected?.venue_name} · {fDate(selected?.date)}
                    </p>
                  </div>
                </div>

                {/* Flags */}
                {r.flags.map((f, i) => (
                  <div key={i} style={s.flag}><span style={s.flagDot} />{f.message}</div>
                ))}

                {/* Comparison table */}
                <div style={s.compHeader}>
                  <span style={s.colHd}>Category</span>
                  <span style={{ ...s.colHd, textAlign: 'right' }}>Square</span>
                  <span style={{ ...s.colHd, textAlign: 'right' }}>Manager</span>
                  <span style={{ ...s.colHd, textAlign: 'right' }}>Variance</span>
                </div>
                <CompRow label="Cash"  square={result.square.cash}  manager={r.countedCash}                                            variance={r.cashVar} />
                <CompRow label="Card"  square={result.square.card}  manager={result.report.card_sales}                                 variance={r.cardVar} />
                <CompRow label="Total" square={result.square.total} manager={result.report.grand_total || result.report.total_sales}   variance={r.totalVar} bold />

                {/* Square extras */}
                <div style={s.sqExtras}>
                  <ExtraChip label="Refunds"    value={result.square.refunds}    warn={result.square.refunds > 0} />
                  <ExtraChip label="Discounts"  value={result.square.discounts}  warn={result.square.discounts > 200} />
                  <ExtraChip label="Comps"      value={result.square.comps}      warn={result.square.comps > 50} />
                  <ExtraChip label="Gift Cards" value={result.square.gift_cards} />
                </div>
              </>
            )}
          </div>

          {/* Actions card (always visible in detail) */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Actions</h3>
            {error && <p style={s.err}>{error}</p>}
            {isLocked ? (
              <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1e40af', marginBottom: 4 }}>
                🔒 This reconciliation is <strong>locked</strong>. Unlock to make changes.
              </div>
            ) : null}
            <div style={s.btnRow}>
              <button
                onClick={handleFetchSquare}
                disabled={fetching || loading || isLocked || !selectedVenue?.square_location_id}
                style={s.btnSec}
                title={isLocked ? 'Unlock to re-fetch' : !selectedVenue?.square_location_id ? 'No Square location ID set for this venue' : undefined}
              >
                {fetching ? 'Fetching…' : 'Fetch from Square'}
              </button>
              <button onClick={handleReconcile} disabled={loading || isLocked} style={s.btn}>
                {loading ? 'Loading…' : 'Reconcile'}
              </button>
            </div>
            {/* Lock / Unlock */}
            {selected?.sq_total != null && (
              <div style={{ ...s.btnRow, borderTop: '1px solid #f5ede0', paddingTop: 12, marginTop: 4 }}>
                {isLocked ? (
                  <button onClick={handleUnlock} disabled={locking} style={{ ...s.btnSec, color: '#c88a2e', borderColor: '#e8c97a' }}>
                    {locking ? '…' : '🔓 Unlock Reconciliation'}
                  </button>
                ) : (
                  <button onClick={handleLock} disabled={locking} style={{ ...s.btnSec, color: '#1e40af', borderColor: '#93c5fd', background: '#eff6ff' }}>
                    {locking ? '…' : '🔒 Lock & Approve'}
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#7d6553' }}>Reconciliation Notes</label>
              <textarea
                value={reconNotes}
                onChange={e => setReconNotes(e.target.value)}
                placeholder="Add any notes about this reconciliation…"
                rows={3}
                style={{ ...s.input, resize: 'vertical', fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveNotes} disabled={savingNotes} style={s.btnSec}>
                  {savingNotes ? 'Saving…' : 'Save Notes'}
                </button>
                <button onClick={handleExportDetailCSV} disabled={!result} style={s.btnSec}>
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* Detail tabs card (only if result has details) */}
          {result && (
            <div style={s.card}>
              <div style={s.detailTabRow}>
                {DETAIL_TABS.map(t => {
                  const items = det[t] ?? [];
                  return (
                    <button key={t} onClick={() => setDetailTab(t)}
                      style={{ ...s.dtab, ...(detailTab === t ? s.dtabActive : {}) }}>
                      {DETAIL_LABELS[t]}
                      {items.length > 0 && <span style={s.badge}>{items.length}</span>}
                    </button>
                  );
                })}
              </div>

              {detailTab === 'refunds' && (
                <DetailSection
                  items={det.refunds ?? []}
                  empty="No refunds on this date."
                  columns={['Receipt #', 'Amount', 'Reason', 'Status']}
                  render={r => [
                    <code style={s.code}>{r.receipt_number}</code>,
                    <span style={{ color: '#c1440e', fontWeight: 700 }}>£{f2(r.amount)}</span>,
                    r.reason || '—',
                    r.status,
                  ]}
                />
              )}

              {detailTab === 'comps' && (
                <DetailSection
                  items={det.comps ?? []}
                  empty="No complimentary items on this date."
                  columns={['Receipt #', 'Item', 'Variation', 'Qty', 'Value']}
                  render={c => [
                    <code style={s.code}>{c.receipt_number}</code>,
                    c.item_name,
                    c.variation_name || '—',
                    c.quantity,
                    <span style={{ color: '#c88a2e', fontWeight: 700 }}>£{f2(c.amount)}</span>,
                  ]}
                />
              )}

              {detailTab === 'discounts' && (
                <DetailSection
                  items={det.discounts ?? []}
                  empty="No discounts on this date."
                  columns={['Receipt #', 'Name', 'Type', 'Scope', 'Amount']}
                  render={d => [
                    <code style={s.code}>{d.receipt_number}</code>,
                    d.discount_name,
                    <Tag text={d.discount_type} />,
                    <Tag text={d.scope} light />,
                    <span style={{ color: '#7c5c2e', fontWeight: 700 }}>£{f2(d.amount)}</span>,
                  ]}
                />
              )}

              {detailTab === 'gift_cards' && (
                <DetailSection
                  items={det.gift_cards ?? []}
                  empty="No gift voucher activity on this date."
                  columns={['Receipt #', 'Card (last 4)', 'Type', 'Amount']}
                  render={g => [
                    <code style={s.code}>{g.receipt_number}</code>,
                    <code style={s.code}>···· {g.gift_card_last4}</code>,
                    <Tag text={g.activity_type} />,
                    <span style={{ color: '#2563eb', fontWeight: 700 }}>£{f2(g.amount)}</span>,
                  ]}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ reconciled, locked }) {
  if (locked) return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>
      Locked
    </span>
  );
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: reconciled ? '#f0f5e8' : '#fdf5e0',
      color: reconciled ? '#4a6622' : '#7c5200',
      border: `1px solid ${reconciled ? '#b5d08a' : '#f0c97a'}`,
    }}>
      {reconciled ? 'Reconciled' : 'Pending'}
    </span>
  );
}

function ListRow({ row, isMobile, onView, tableIndex }) {
  const locked     = row.sq_locked === 1;
  const reconciled = row.sq_total != null && !locked;
  if (isMobile) {
    return (
      <div style={{
        background: '#fff', border: '1px solid #ede8e0', borderRadius: 10,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, color: '#2d1f14', fontSize: 14 }}>{fDate(row.date)}</span>
          <StatusPill reconciled={reconciled} locked={locked} />
        </div>
        <span style={{ fontSize: 13, color: '#7d6553' }}>{row.venue_name}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 12 }}>
          <div><span style={{ color: '#a89078' }}>Cash</span><br /><strong>£{f2(row.cash_sales)}</strong></div>
          <div><span style={{ color: '#a89078' }}>Card</span><br /><strong>£{f2(row.card_sales)}</strong></div>
          <div><span style={{ color: '#a89078' }}>Total</span><br /><strong>£{f2(row.grand_total || row.total_sales)}</strong></div>
        </div>
        <button onClick={onView} style={s.viewBtn}>View →</button>
      </div>
    );
  }
  return (
    <tr style={{ background: tableIndex % 2 === 0 ? '#fff' : '#fefcf9' }}>
      <td style={s.listTd}>{fDate(row.date)}</td>
      <td style={s.listTd}>{row.venue_name}</td>
      <td style={{ ...s.listTd, textAlign: 'right' }}>£{f2(row.cash_sales)}</td>
      <td style={{ ...s.listTd, textAlign: 'right' }}>£{f2(row.card_sales)}</td>
      <td style={{ ...s.listTd, textAlign: 'right', fontWeight: 700 }}>£{f2(row.grand_total || row.total_sales)}</td>
      <td style={s.listTd}><StatusPill reconciled={reconciled} locked={locked} /></td>
      <td style={s.listTd}><button onClick={onView} style={s.viewBtn}>View →</button></td>
    </tr>
  );
}

function CompRow({ label, square, manager, variance, bold }) {
  return (
    <div style={{ ...s.compRow, fontWeight: bold ? 700 : 400, borderTop: bold ? '1px solid #f5ede0' : 'none', paddingTop: bold ? 8 : 0, marginTop: bold ? 4 : 0 }}>
      <span style={{ color: '#7d6553', fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, textAlign: 'right' }}>£{f2(square)}</span>
      <span style={{ fontSize: 13, textAlign: 'right' }}>£{f2(manager)}</span>
      <VarBadge value={variance} />
    </div>
  );
}

function VarBadge({ value }) {
  const abs = Math.abs(value || 0);
  if (abs < 0.01) return <span style={{ fontSize: 12, color: '#5a7a30', fontWeight: 700, textAlign: 'right' }}>✓</span>;
  const neg = value < 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: neg ? '#c1440e' : '#5a7a30' }}>
      {neg ? `−£${f2(abs)}` : `+£${f2(abs)}`}
    </span>
  );
}

function RepRow({ label, value, bold, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f9f4ef', fontWeight: bold ? 700 : 400 }}>
      <span style={{ fontSize: 13, color: '#7d6553' }}>{label}</span>
      <span style={{ fontSize: 13, color: accent ? '#c1440e' : '#2d1f14' }}>£{f2(value)}</span>
    </div>
  );
}

function DiscRow({ label, value, notes }) {
  if (!value && !notes) return null;
  return (
    <div style={{ padding: '5px 0', borderBottom: '1px solid #f9f4ef' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#7d6553' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#2d1f14' }}>£{f2(value)}</span>
      </div>
      {notes && <p style={{ fontSize: 11, color: '#a89078', margin: '2px 0 0' }}>{notes}</p>}
    </div>
  );
}

function ExtraChip({ label, value, warn }) {
  return (
    <div style={{ ...s.chip, background: warn ? '#fdf5e0' : '#fefcf9', borderColor: warn ? '#e8c97a' : '#ede8e0' }}>
      <span style={{ fontSize: 10, color: '#7d6553', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: warn ? '#7c3d0e' : '#4a3728' }}>£{f2(value)}</span>
    </div>
  );
}

function DetailSection({ items, columns, render, empty }) {
  if (!items.length) return <p style={{ color: '#a89078', fontSize: 13, padding: '12px 0' }}>{empty}</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.dtTable}>
        <thead><tr>{columns.map(c => <th key={c} style={s.dtTh}>{c}</th>)}</tr></thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fefcf9' }}>
              {render(item).map((cell, j) => <td key={j} style={s.dtTd}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tag({ text, light }) {
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: light ? '#f5ede0' : '#fef3ee', color: light ? '#7d6553' : '#9a2e05', fontWeight: 600 }}>
      {text}
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  // List view
  listRoot:      { display: 'flex', flexDirection: 'column', gap: 16 },
  ctxBar:        { display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '1px solid #ede8e0', borderRadius: 10, padding: '12px 16px' },
  dateInput:     { padding: '7px 10px', border: '1px solid #ede8e0', borderRadius: 7, fontSize: 13, color: '#2d1f14', background: '#fff', cursor: 'pointer' },
  exportBtn:     { marginLeft: 'auto', padding: '8px 16px', background: '#fefcf9', color: '#4a3728', border: '1px solid #ede8e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  kpiGrid:       { display: 'grid', gap: 12 },
  kpiCard:       { background: '#fff', border: '1px solid #ede8e0', borderRadius: 10, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 },
  listTableCard: { background: '#fff', border: '1px solid #ede8e0', borderRadius: 12, padding: 20 },
  listTh:        { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '2px solid #f5ede0', whiteSpace: 'nowrap' },
  listTd:        { padding: '11px 12px', borderBottom: '1px solid #f5ede0', fontSize: 13, color: '#2d1f14', verticalAlign: 'middle' },
  viewBtn:       { padding: '6px 14px', background: '#fef3ee', color: '#9a2e05', border: '1px solid #f0c0a0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' },

  // Detail view
  detailRoot:   { display: 'flex', flexDirection: 'column', gap: 16 },
  detailHeader: { display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #ede8e0', borderRadius: 10, padding: '12px 16px', flexWrap: 'wrap' },
  backBtn:      { padding: '7px 14px', background: '#fefcf9', color: '#4a3728', border: '1px solid #ede8e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },

  // Shared card styles
  card:      { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(45,31,20,0.06)', border: '1px solid #ede8e0', display: 'flex', flexDirection: 'column', gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#2d1f14' },
  hint:      { fontSize: 13, color: '#7d6553' },

  input:   { padding: '8px 10px', border: '1px solid #ede8e0', borderRadius: 7, fontSize: 14, color: '#2d1f14', width: '100%', boxSizing: 'border-box' },
  err:     { color: '#c1440e', fontSize: 13, margin: 0 },
  btnRow:  { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn:     { padding: '9px 18px', background: '#c1440e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnSec:  { padding: '9px 18px', background: '#fefcf9', color: '#4a3728', border: '1px solid #ede8e0', borderRadius: 8, fontSize: 14, cursor: 'pointer' },

  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 20px' },

  statusBanner: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid' },
  flag:         { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fdf5e0', borderRadius: 7, fontSize: 13, color: '#7c3d0e' },
  flagDot:      { width: 6, height: 6, borderRadius: '50%', background: '#c88a2e', flexShrink: 0 },

  compHeader: { display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px', gap: 8, padding: '4px 0' },
  compRow:    { display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px', gap: 8, alignItems: 'center', padding: '4px 0' },
  colHd:      { color: '#a89078', fontSize: 11, fontWeight: 700 },

  repGrid: { display: 'flex', flexDirection: 'column', gap: 0 },

  cashBreak: { background: '#fefcf9', border: '1px solid #f0e8dc', borderRadius: 9, padding: 14 },
  denomGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  denomChip: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 10px', background: '#fff', border: '1px solid #ede8e0', borderRadius: 8 },
  totalRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #ede8e0', paddingTop: 8 },

  sqExtras: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  chip:     { padding: '10px 12px', borderRadius: 8, border: '1px solid', display: 'flex', flexDirection: 'column', gap: 3 },

  noteBox: { padding: '8px 12px', background: '#fefcf9', borderRadius: 7, fontSize: 12, color: '#4a3728', borderLeft: '3px solid #c1440e' },

  detailTabRow: { display: 'flex', gap: 4, borderBottom: '1px solid #f5ede0', paddingBottom: 12, flexWrap: 'wrap' },
  dtab:         { padding: '6px 14px', border: 'none', background: 'none', fontSize: 13, color: '#7d6553', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  dtabActive:   { background: '#fefcf9', color: '#2d1f14', fontWeight: 700 },
  badge:        { fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#c1440e', color: '#fff' },

  dtTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  dtTh:    { padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #f5ede0' },
  dtTd:    { padding: '9px 10px', borderBottom: '1px solid #f5ede0', verticalAlign: 'middle' },
  code:    { fontFamily: 'monospace', fontSize: 12, background: '#f5ede0', padding: '2px 6px', borderRadius: 4, color: '#4a3728' },
};
