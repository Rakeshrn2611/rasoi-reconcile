import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const EMPTY = {
  date: today(), venue_id: '',
  cash_sales: '', card_sales: '', deposits_used: '', gift_cards_redeemed: '',
  notes_50: '', notes_20: '', notes_10: '', notes_5: '',
  coins_200: '', coins_100: '', coins_50: '', coins_20: '', coins_10: '', coins_2: '', coins_1: '',
  petty_cash: '', petty_cash_notes: '',
  staff_discount: '', staff_discount_notes: '',
  fnf_discount: '', fnf_discount_notes: '',
  complimentary: '', complimentary_notes: '',
  manager_refunds: '', manager_refund_notes: '',
  card_tips: '', cash_tips: '',
  shift_notes: '',
};

const NOTES = [{ k: 'notes_50', label: '£50', val: 50 }, { k: 'notes_20', label: '£20', val: 20 }, { k: 'notes_10', label: '£10', val: 10 }, { k: 'notes_5', label: '£5', val: 5 }];
const COINS = [
  { k: 'coins_200', label: '£2', val: 2 }, { k: 'coins_100', label: '£1', val: 1 },
  { k: 'coins_50',  label: '50p', val: 0.5 }, { k: 'coins_20', label: '20p', val: 0.2 },
  { k: 'coins_10',  label: '10p', val: 0.1 }, { k: 'coins_2',  label: '2p',  val: 0.02 },
  { k: 'coins_1',   label: '1p',  val: 0.01 },
];

export default function ManagerReports({ venues, showToast }) {
  const isMobile = useIsMobile();

  const [form, setForm]       = useState({ ...EMPTY });
  const [errors, setErrors]   = useState({});
  const [saving, setSaving]   = useState(false);
  const [reports, setReports] = useState([]);
  const [filter, setFilter]   = useState({ venue_id: '', from: monthStart(), to: today() });
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState({ sales: true, cash: true, petty: true, discounts: false, refunds: false, tips: false, notes: false });
  const [editId, setEditId]   = useState(null);

  useEffect(() => {
    if (venues.length === 1 && !form.venue_id) setForm(f => ({ ...f, venue_id: venues[0].id }));
  }, [venues]);

  useEffect(() => { loadReports(); }, [filter]);

  async function loadReports() {
    setLoading(true);
    try {
      const p = {};
      if (filter.venue_id) p.venue_id = filter.venue_id;
      if (filter.from) p.from = filter.from;
      if (filter.to) p.to = filter.to;
      setReports(await api.getReports(p));
    } catch {}
    setLoading(false);
  }

  // Auto-calculations
  const physicalCash = useMemo(() => {
    let total = 0;
    for (const { k, val } of [...NOTES, ...COINS]) total += (parseFloat(form[k]) || 0) * val;
    return Math.round(total * 100) / 100;
  }, [form.notes_50, form.notes_20, form.notes_10, form.notes_5,
      form.coins_200, form.coins_100, form.coins_50, form.coins_20,
      form.coins_10, form.coins_2, form.coins_1]);

  const hasDenomsEntered = useMemo(() =>
    [...NOTES, ...COINS].some(({ k }) => parseFloat(form[k]) > 0),
    [form.notes_50, form.notes_20, form.notes_10, form.notes_5,
     form.coins_200, form.coins_100, form.coins_50, form.coins_20,
     form.coins_10, form.coins_2, form.coins_1]);

  // Auto-fill cash_sales when denominations are entered
  useEffect(() => {
    if (!hasDenomsEntered) return;
    const v = physicalCash.toFixed(2);
    setForm(f => f.cash_sales === v ? f : { ...f, cash_sales: v });
  }, [physicalCash, hasDenomsEntered]);

  const pettyVal  = parseFloat(form.petty_cash) || 0;
  // Final Cash Sales = physical cash counted + petty cash (for display)
  const finalCash = physicalCash + pettyVal;

  const grandTotal = useMemo(() => {
    return (parseFloat(form.cash_sales) || 0) +
           (parseFloat(form.card_sales) || 0) +
           (parseFloat(form.deposits_used) || 0) +
           (parseFloat(form.gift_cards_redeemed) || 0) +
           (parseFloat(form.petty_cash) || 0);
  }, [form.cash_sales, form.card_sales, form.deposits_used, form.gift_cards_redeemed, form.petty_cash]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); if (errors[k]) setErrors(e => ({ ...e, [k]: '' })); }
  function toggle(k) { setOpen(o => ({ ...o, [k]: !o[k] })); }

  function validate() {
    const e = {};
    if (!form.venue_id) e.venue_id = 'Select a venue';
    if (!form.date) e.date = 'Date is required';
    if (form.petty_cash && !form.petty_cash_notes) e.petty_cash_notes = 'Explain petty cash';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleEdit(report) {
    const str = v => (v == null || v === 0) ? '' : String(v);
    setForm({
      date: report.date, venue_id: report.venue_id,
      cash_sales: str(report.cash_sales), card_sales: str(report.card_sales),
      deposits_used: str(report.deposits_used), gift_cards_redeemed: str(report.gift_cards_redeemed),
      notes_50: str(report.notes_50), notes_20: str(report.notes_20),
      notes_10: str(report.notes_10), notes_5: str(report.notes_5),
      coins_200: str(report.coins_200), coins_100: str(report.coins_100),
      coins_50: str(report.coins_50), coins_20: str(report.coins_20),
      coins_10: str(report.coins_10), coins_2: str(report.coins_2),
      coins_1: str(report.coins_1),
      petty_cash: str(report.petty_cash), petty_cash_notes: report.petty_cash_notes || '',
      staff_discount: str(report.staff_discount), staff_discount_notes: report.staff_discount_notes || '',
      fnf_discount: str(report.fnf_discount), fnf_discount_notes: report.fnf_discount_notes || '',
      complimentary: str(report.complimentary), complimentary_notes: report.complimentary_notes || '',
      manager_refunds: str(report.manager_refunds), manager_refund_notes: report.manager_refund_notes || '',
      card_tips: str(report.card_tips), cash_tips: str(report.cash_tips),
      shift_notes: report.shift_notes || '',
    });
    setEditId(report.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCancelEdit() {
    setForm({ ...EMPTY, venue_id: form.venue_id });
    setEditId(null);
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (editId) {
        await api.updateReport(editId, form);
        showToast('Report updated');
        setEditId(null);
      } else {
        await api.submitEODReport(form);
        showToast('End of day report saved');
      }
      setForm({ ...EMPTY, venue_id: form.venue_id });
      loadReports();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this report?')) return;
    try { await api.deleteReport(id); showToast('Deleted'); loadReports(); }
    catch (err) { showToast(err.message, 'error'); }
  }

  const f2    = n => (Number(n) || 0).toFixed(2);
  const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const inputStyle = { ...s.input, fontSize: isMobile ? 16 : 14 };

  return (
    <div style={{ ...s.root, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>

      {/* ── Form column ────────────────────────────────────────────────── */}
      <div style={s.formCol}>
        <form onSubmit={handleSubmit} style={s.formCard}>
          <div style={s.formHeader}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={s.formTitle}>{editId ? 'Edit Report' : 'End of Day Report'}</h2>
                <p style={s.formSub}>{editId ? 'Editing existing report — submit to save changes' : 'Fill in all sections then submit'}</p>
              </div>
              {editId && (
                <button type="button" onClick={handleCancelEdit}
                  style={{ padding: '5px 12px', background: '#fef3ee', border: '1px solid #f0c0a0', borderRadius: 7, fontSize: 12, color: '#c1440e', cursor: 'pointer', fontWeight: 600 }}>
                  Cancel Edit
                </button>
              )}
            </div>
          </div>

          {/* Basic info */}
          <div style={{ ...s.basicRow, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            <label style={s.fieldLabel}>
              Date <span style={s.req}>*</span>
              <input type="date" value={form.date} max={today()}
                onChange={e => set('date', e.target.value)} style={{ ...inputStyle, ...(errors.date ? s.inputErr : {}) }} />
              {errors.date && <span style={s.errMsg}>{errors.date}</span>}
            </label>
            <label style={s.fieldLabel}>
              Venue <span style={s.req}>*</span>
              <select value={form.venue_id} onChange={e => set('venue_id', e.target.value)}
                style={{ ...inputStyle, ...(errors.venue_id ? s.inputErr : {}) }}>
                <option value="">Select venue…</option>
                {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {errors.venue_id && <span style={s.errMsg}>{errors.venue_id}</span>}
            </label>
          </div>

          {/* ── Sales ── */}
          <Section label="Sales" icon="£" open={open.sales} onToggle={() => toggle('sales')} isMobile={isMobile}>
            <div style={{ ...s.grid2, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <NumField
                label="Cash Sales"
                value={form.cash_sales}
                onChange={v => set('cash_sales', v)}
                prefix="£"
                readOnly={hasDenomsEntered}
                badge={hasDenomsEntered ? 'Auto' : null}
                hint={hasDenomsEntered ? 'Counted Cash (auto-filled from denomination count)' : null}
                isMobile={isMobile}
              />
              <NumField label="Card Sales" value={form.card_sales} onChange={v => set('card_sales', v)} prefix="£" isMobile={isMobile} />
              <NumField label="Deposits Used" value={form.deposits_used} onChange={v => set('deposits_used', v)} prefix="£" isMobile={isMobile} />
              <NumField label="Gift Vouchers Redeemed" value={form.gift_cards_redeemed} onChange={v => set('gift_cards_redeemed', v)} prefix="£" isMobile={isMobile} />
            </div>
          </Section>

          {/* ── Cash Breakdown ── */}
          <Section label="Cash Count" icon="🪙" open={open.cash} onToggle={() => toggle('cash')} isMobile={isMobile}>
            <p style={s.hint}>Count each denomination — Cash Sales will auto-fill.</p>
            <div style={s.denomGroup}>
              <p style={s.denomLabel}>Notes</p>
              <div style={s.denomRow}>
                {NOTES.map(({ k, label }) => (
                  <DenomField key={k} label={label} value={form[k]} onChange={v => set(k, v)} isMobile={isMobile} />
                ))}
              </div>
            </div>
            <div style={s.denomGroup}>
              <p style={s.denomLabel}>Coins</p>
              <div style={s.denomRow}>
                {COINS.map(({ k, label }) => (
                  <DenomField key={k} label={label} value={form[k]} onChange={v => set(k, v)} isMobile={isMobile} />
                ))}
              </div>
            </div>
            <div style={s.calcBox}>
              <div>
                <span style={s.calcLabel}>Physical Cash Counted</span>
                <p style={{ fontSize: 11, color: '#a89078', margin: '2px 0 0' }}>Notes + Coins only</p>
              </div>
              <span style={s.calcValue}>£{f2(physicalCash)}</span>
            </div>
          </Section>

          {/* ── Petty Cash ── */}
          <Section label="Petty Cash" icon="📋" open={open.petty} onToggle={() => toggle('petty')} isMobile={isMobile}>
            <p style={s.hint}>Added on top of physical cash to give final cash sales.</p>
            <div style={{ ...s.grid2, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <NumField label="Amount" value={form.petty_cash} onChange={v => set('petty_cash', v)} prefix="£" isMobile={isMobile} />
              <label style={s.fieldLabel}>
                Notes <span style={s.req}>*</span>
                <input value={form.petty_cash_notes} onChange={e => set('petty_cash_notes', e.target.value)}
                  placeholder="What was it used for?" style={{ ...inputStyle, ...(errors.petty_cash_notes ? s.inputErr : {}) }} />
                {errors.petty_cash_notes && <span style={s.errMsg}>{errors.petty_cash_notes}</span>}
              </label>
            </div>
            {hasDenomsEntered && pettyVal > 0 && (
              <div style={s.finalCashBox}>
                <div style={s.finalCashRow}>
                  <span style={{ fontSize: 12, color: '#7d6553' }}>Physical Cash Counted</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#4a3728' }}>£{f2(physicalCash)}</span>
                </div>
                <div style={s.finalCashRow}>
                  <span style={{ fontSize: 12, color: '#7d6553' }}>+ Petty Cash</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#4a3728' }}>£{f2(pettyVal)}</span>
                </div>
                <div style={{ ...s.finalCashRow, borderTop: '1px solid #e8c97a', paddingTop: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>Final Cash Sales</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#c88a2e' }}>£{f2(finalCash)}</span>
                </div>
              </div>
            )}
          </Section>

          {/* ── Discounts ── */}
          <Section label="Discounts & Complimentary (not in sales)" icon="%" open={open.discounts} onToggle={() => toggle('discounts')} isMobile={isMobile}>
            <p style={s.hint}>These are tracked separately — not deducted from sales totals.</p>
            <div style={s.discBlock}>
              <div style={{ ...s.discRow, gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr' }}>
                <NumField label="Staff Discount" value={form.staff_discount} onChange={v => set('staff_discount', v)} prefix="£" isMobile={isMobile} />
                <label style={s.fieldLabel}>
                  Notes
                  <input value={form.staff_discount_notes} onChange={e => set('staff_discount_notes', e.target.value)}
                    placeholder="Staff name / reason" style={inputStyle} />
                </label>
              </div>
              <div style={{ ...s.discRow, gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr' }}>
                <NumField label="Friends & Family" value={form.fnf_discount} onChange={v => set('fnf_discount', v)} prefix="£" isMobile={isMobile} />
                <label style={s.fieldLabel}>
                  Notes
                  <input value={form.fnf_discount_notes} onChange={e => set('fnf_discount_notes', e.target.value)}
                    placeholder="Name / occasion" style={inputStyle} />
                </label>
              </div>
              <div style={{ ...s.discRow, gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr' }}>
                <NumField label="Complimentary Items" value={form.complimentary} onChange={v => set('complimentary', v)} prefix="£" isMobile={isMobile} />
                <label style={s.fieldLabel}>
                  Notes
                  <input value={form.complimentary_notes} onChange={e => set('complimentary_notes', e.target.value)}
                    placeholder="What was given / why" style={inputStyle} />
                </label>
              </div>
            </div>
          </Section>

          {/* ── Refunds ── */}
          <Section label="Refunds (manager-tracked)" icon="↩" open={open.refunds} onToggle={() => toggle('refunds')} isMobile={isMobile}>
            <p style={s.hint}>Record any cash or manually processed refunds not captured by Square.</p>
            <div style={{ ...s.discRow, gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr' }}>
              <NumField label="Refund Amount" value={form.manager_refunds} onChange={v => set('manager_refunds', v)} prefix="£" isMobile={isMobile} />
              <label style={s.fieldLabel}>
                Notes
                <input value={form.manager_refund_notes} onChange={e => set('manager_refund_notes', e.target.value)}
                  placeholder="Reason / customer name" style={{ ...s.input, fontSize: isMobile ? 16 : 14 }} />
              </label>
            </div>
          </Section>

          {/* ── Tips ── */}
          <Section label="Tips" icon="★" open={open.tips} onToggle={() => toggle('tips')} isMobile={isMobile}>
            <div style={{ ...s.grid2, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              <NumField label="Card Tips" value={form.card_tips} onChange={v => set('card_tips', v)} prefix="£" isMobile={isMobile} />
              <NumField label="Cash Tips" value={form.cash_tips} onChange={v => set('cash_tips', v)} prefix="£" isMobile={isMobile} />
            </div>
          </Section>

          {/* ── Shift Notes ── */}
          <Section label="Shift Notes" icon="📝" open={open.notes} onToggle={() => toggle('notes')} isMobile={isMobile}>
            <textarea value={form.shift_notes} onChange={e => set('shift_notes', e.target.value)}
              placeholder="Any incidents, observations, or handover notes…"
              style={{ ...inputStyle, height: 80, resize: 'vertical' }} />
          </Section>

          {/* ── Auto-Calculated Totals ── */}
          <div style={s.totalsBox}>
            <h3 style={s.totalsTitle}>Auto-Calculated Totals</h3>
            <div style={s.totalsGrid}>

              {hasDenomsEntered ? (
                <>
                  <TotalRow label="Physical Cash (counted notes + coins)" value={physicalCash} />
                  <TotalRow label="+ Petty Cash" value={pettyVal} />
                  <TotalRow label="= Final Cash Sales" value={finalCash} bold accent2 />
                  <div style={s.totalsDivider} />
                </>
              ) : (
                <>
                  <TotalRow label="Cash Sales (manually entered)" value={parseFloat(form.cash_sales) || 0} />
                  <div style={s.totalsDivider} />
                </>
              )}

              <TotalRow label="Card Sales" value={parseFloat(form.card_sales) || 0} />
              <TotalRow label="Deposits Used" value={parseFloat(form.deposits_used) || 0} />
              <TotalRow label="Gift Vouchers Redeemed" value={parseFloat(form.gift_cards_redeemed) || 0} />
              {!hasDenomsEntered && <TotalRow label="Petty Cash" value={pettyVal} />}

              <div style={{ ...s.totalsDivider, marginTop: 4 }} />
              <TotalRow label="Grand Total" value={grandTotal} accent />
            </div>
          </div>

          <button type="submit" disabled={saving}
            style={{ ...s.submitBtn, fontSize: isMobile ? 16 : 15, padding: isMobile ? '16px 0' : '14px 0' }}>
            {saving ? 'Saving…' : editId ? 'Update Report' : 'Submit End of Day Report'}
          </button>
        </form>
      </div>

      {/* ── History column ─────────────────────────────────────────────── */}
      <div style={isMobile ? { ...s.histCol, position: 'static' } : s.histCol}>
        <div style={s.histHeader}>
          <h2 style={s.histTitle}>Report History</h2>
          <div style={s.histFilters}>
            <select value={filter.venue_id} onChange={e => setFilter(f => ({ ...f, venue_id: e.target.value }))} style={s.filterSelect}>
              <option value="">All venues</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <input type="date" value={filter.from} onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} style={s.filterInput} />
            <span style={{ color: '#a89078', fontSize: 12 }}>–</span>
            <input type="date" value={filter.to} onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} style={s.filterInput} />
          </div>
        </div>

        <div style={s.histCard}>
          {loading ? <p style={s.empty}>Loading…</p> :
           reports.length === 0 ? <p style={s.empty}>No reports found.</p> : (
            isMobile ? (
              <div>
                {reports.map(r => (
                  <div key={r.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f5ede0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#2d1f14' }}>{fDate(r.date)}</span>
                      <RecPill hasSquare={!!r.has_square} locked={!!r.locked} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <VenuePill name={r.venue_name} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        {!r.has_square && !r.locked && (
                          <button onClick={() => handleEdit(r)} style={{ ...s.delBtn, color: '#2563eb' }} title="Edit">✎</button>
                        )}
                        <button onClick={() => handleDelete(r.id)} style={s.delBtn} title="Delete">✕</button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 6 }}>
                      <div style={{ fontSize: 11, color: '#7d6553' }}>Cash<br/><span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>£{f2(r.cash_sales)}</span></div>
                      <div style={{ fontSize: 11, color: '#7d6553' }}>Card<br/><span style={{ fontSize: 13, fontWeight: 700, color: '#2d1f14' }}>£{f2(r.card_sales)}</span></div>
                      <div style={{ fontSize: 11, color: '#7d6553' }}>Total<br/><span style={{ fontSize: 13, fontWeight: 700, color: '#c1440e' }}>£{f2(r.grand_total||r.total_sales)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>{['Date','Venue','Cash','Card','Grand Total','Status',''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r.id} style={s.tr}>
                      <td style={s.td}>{fDate(r.date)}</td>
                      <td style={s.td}><VenuePill name={r.venue_name} /></td>
                      <td style={s.td}>£{f2(r.cash_sales)}</td>
                      <td style={s.td}>£{f2(r.card_sales)}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: '#c1440e' }}>£{f2(r.grand_total || r.total_sales)}</td>
                      <td style={s.td}><RecPill hasSquare={!!r.has_square} locked={!!r.locked} /></td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!r.has_square && !r.locked && (
                            <button onClick={() => handleEdit(r)} style={{ ...s.delBtn, color: '#2563eb', fontSize: 14 }} title="Edit">✎</button>
                          )}
                          <button onClick={() => handleDelete(r.id)} style={s.delBtn} title="Delete">✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ label, icon, open, onToggle, children, isMobile }) {
  return (
    <div style={s.section}>
      <button type="button" onClick={onToggle}
        style={{ ...s.sectionBtn, padding: isMobile ? '12px 16px' : '13px 24px' }}>
        <span style={s.sectionIcon}>{icon}</span>
        <span style={s.sectionLabel}>{label}</span>
        <span style={{ ...s.sectionChevron, transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {open && (
        <div style={{ ...s.sectionBody, padding: isMobile ? '4px 16px 16px' : '4px 24px 18px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange, prefix, readOnly, badge, hint, isMobile }) {
  return (
    <label style={s.fieldLabel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{label}</span>
        {badge && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#5a7a30', color: '#fff', letterSpacing: '0.3px' }}>
            {badge}
          </span>
        )}
      </div>
      <div style={s.prefixWrap}>
        {prefix && <span style={s.prefix}>{prefix}</span>}
        <input type="number" step="0.01" min="0" placeholder="0.00"
          value={value} onChange={e => onChange(e.target.value)}
          readOnly={readOnly}
          style={{ ...s.input, fontSize: isMobile ? 16 : 14, paddingLeft: prefix ? 28 : 10,
            ...(readOnly ? { background: '#f5f9f0', color: '#3d6018', fontWeight: 700, cursor: 'default', border: '1.5px solid #b5d08a' } : {}) }} />
      </div>
      {hint && <span style={{ fontSize: 10, color: '#5a7a30', marginTop: 1 }}>{hint}</span>}
    </label>
  );
}

function DenomField({ label, value, onChange, isMobile }) {
  return (
    <div style={{ ...s.denomField, minWidth: isMobile ? 64 : 52 }}>
      <span style={s.denomBadge}>{label}</span>
      <input type="number" min="0" step="1" placeholder="0"
        value={value} onChange={e => onChange(e.target.value)}
        style={{ ...s.denomInput, width: isMobile ? 64 : 52, padding: isMobile ? '10px 6px' : '6px 4px', fontSize: isMobile ? 16 : 14 }} />
    </div>
  );
}

function TotalRow({ label, value, bold, accent, accent2 }) {
  const color = accent ? '#c1440e' : accent2 ? '#c88a2e' : '#2d1f14';
  const fwt   = bold || accent || accent2 ? 800 : 500;
  return (
    <div style={s.totalRow}>
      <span style={{ fontSize: 13, color: accent ? '#c1440e' : accent2 ? '#c88a2e' : '#7d6553', fontWeight: bold || accent || accent2 ? 700 : 400 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: fwt, color }}>
        £{(Number(value) || 0).toFixed(2)}
      </span>
    </div>
  );
}

function VenuePill({ name }) {
  const color = name?.includes('Waterfront') ? '#2563eb' : '#c1440e';
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: color + '18', color }}>{name}</span>;
}

function RecPill({ hasSquare, locked }) {
  if (locked) return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#eff6ff', color: '#1e40af' }}>Locked</span>;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
    background: hasSquare ? '#f0f5e8' : '#fdf5e0', color: hasSquare ? '#5a7a30' : '#c88a2e' }}>
    {hasSquare ? 'Reconciled' : 'Pending'}
  </span>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  root:    { display: 'grid', gap: 24, alignItems: 'start' },
  formCol: { display: 'flex', flexDirection: 'column', gap: 0 },
  formCard:{ background: '#fff', borderRadius: 14, border: '1.5px solid #ede8e0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(45,31,20,0.07)' },
  formHeader:{ padding: '20px 24px 16px', borderBottom: '1px solid #f5ede0', background: '#fefcf9' },
  formTitle: { fontSize: 17, fontWeight: 800, color: '#2d1f14' },
  formSub:   { fontSize: 12, color: '#a89078', marginTop: 3 },

  basicRow: { display: 'grid', gap: 14, padding: '16px 24px' },

  section:    { borderTop: '1px solid #f5ede0' },
  sectionBtn: { width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' },
  sectionIcon: { fontSize: 14 },
  sectionLabel:{ fontSize: 13, fontWeight: 700, color: '#2d1f14', flex: 1 },
  sectionChevron:{ fontSize: 9, color: '#a89078', transition: 'transform 0.15s' },
  sectionBody: { padding: '4px 24px 18px' },

  grid2:   { display: 'grid', gap: 12 },
  hint:    { fontSize: 12, color: '#a89078', marginBottom: 10 },
  req:     { color: '#c1440e' },

  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600, color: '#4a3728' },
  input:      { padding: '8px 10px', border: '1.5px solid #ede8e0', borderRadius: 8, fontSize: 14, color: '#2d1f14', background: '#fff', width: '100%', boxSizing: 'border-box' },
  inputErr:   { borderColor: '#c1440e' },
  errMsg:     { color: '#c1440e', fontSize: 11, marginTop: 2 },
  prefixWrap: { position: 'relative' },
  prefix:     { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#a89078', pointerEvents: 'none' },

  denomGroup: { marginBottom: 12 },
  denomLabel: { fontSize: 11, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 },
  denomRow:   { display: 'flex', gap: 8, flexWrap: 'wrap' },
  denomField: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 52 },
  denomBadge: { fontSize: 11, fontWeight: 700, color: '#fff', background: '#c1440e', padding: '2px 7px', borderRadius: 5 },
  denomInput: { width: 52, padding: '6px 4px', border: '1.5px solid #ede8e0', borderRadius: 7, fontSize: 14, textAlign: 'center', color: '#2d1f14' },

  calcBox:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fef3ee', border: '1px solid #f5c9a8', borderRadius: 9, padding: '10px 14px', marginTop: 8 },
  calcLabel: { fontSize: 13, fontWeight: 600, color: '#7d6553' },
  calcValue: { fontSize: 18, fontWeight: 800, color: '#c1440e' },

  finalCashBox: { background: '#fdf5e0', border: '1px solid #e8c97a', borderRadius: 9, padding: '10px 14px', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 },
  finalCashRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },

  discBlock: { display: 'flex', flexDirection: 'column', gap: 12 },
  discRow:   { display: 'grid', gap: 10 },

  totalsBox:   { margin: '0', padding: '16px 24px', background: '#fefcf9', borderTop: '1.5px solid #f5ede0' },
  totalsTitle: { fontSize: 13, fontWeight: 700, color: '#4a3728', marginBottom: 10 },
  totalsGrid:  { display: 'flex', flexDirection: 'column', gap: 6 },
  totalRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' },
  totalsDivider:{ height: 1, background: '#ede8e0', margin: '4px 0' },

  submitBtn: { width: '100%', background: '#c1440e', color: '#fff', border: 'none',
               fontWeight: 700, cursor: 'pointer', letterSpacing: '0.2px' },

  histCol:     { display: 'flex', flexDirection: 'column', gap: 0, position: 'sticky', top: 88 },
  histHeader:  { marginBottom: 12 },
  histTitle:   { fontSize: 16, fontWeight: 800, color: '#2d1f14', marginBottom: 10 },
  histFilters: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  filterSelect:{ padding: '7px 10px', border: '1.5px solid #ede8e0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#2d1f14' },
  filterInput: { padding: '7px 8px', border: '1.5px solid #ede8e0', borderRadius: 8, fontSize: 13, color: '#2d1f14' },
  histCard:    { background: '#fff', borderRadius: 14, border: '1.5px solid #ede8e0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(45,31,20,0.06)' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#a89078', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f5ede0' },
  tr:          { borderBottom: '1px solid #faf5ee' },
  td:          { padding: '11px 14px', fontSize: 13, color: '#4a3728' },
  empty:       { padding: 40, color: '#a89078', textAlign: 'center', fontSize: 14 },
  delBtn:      { background: 'none', border: 'none', color: '#d4c4b0', fontSize: 13, padding: 4, borderRadius: 4, cursor: 'pointer' },
};
