import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client.js';

const EMPTY = {
  date: today(), venue_id: '',
  cash_sales: '', card_sales: '', deposits_used: '', gift_cards_redeemed: '',
  notes_50: '', notes_20: '', notes_10: '', notes_5: '',
  coins_200: '', coins_100: '', coins_50: '', coins_20: '', coins_10: '', coins_2: '', coins_1: '',
  petty_cash: '', petty_cash_notes: '',
  staff_discount: '', staff_discount_notes: '',
  fnf_discount: '', fnf_discount_notes: '',
  complimentary: '', complimentary_notes: '',
  card_tips: '', cash_tips: '',
  shift_notes: '',
};

const NOTES   = [{ k: 'notes_50', label: '£50', val: 50 }, { k: 'notes_20', label: '£20', val: 20 }, { k: 'notes_10', label: '£10', val: 10 }, { k: 'notes_5', label: '£5', val: 5 }];
const COINS   = [
  { k: 'coins_200', label: '£2', val: 2 }, { k: 'coins_100', label: '£1', val: 1 },
  { k: 'coins_50',  label: '50p', val: 0.5 }, { k: 'coins_20', label: '20p', val: 0.2 },
  { k: 'coins_10',  label: '10p', val: 0.1 }, { k: 'coins_2',  label: '2p',  val: 0.02 },
  { k: 'coins_1',   label: '1p',  val: 0.01 },
];

export default function ManagerReports({ venues, showToast }) {
  const [form, setForm]       = useState({ ...EMPTY });
  const [errors, setErrors]   = useState({});
  const [saving, setSaving]   = useState(false);
  const [reports, setReports] = useState([]);
  const [filter, setFilter]   = useState({ venue_id: '', from: monthStart(), to: today() });
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState({ sales: true, cash: true, petty: true, discounts: false, tips: false, notes: false });

  // Auto-set venue when only one venue or when venue changes
  useEffect(() => {
    if (venues.length === 1 && !form.venue_id) {
      setForm(f => ({ ...f, venue_id: venues[0].id }));
    }
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
    return total;
  }, [form]);

  const totalCash = physicalCash + (parseFloat(form.petty_cash) || 0);

  const grandTotal = useMemo(() => {
    return (parseFloat(form.cash_sales) || 0) +
           (parseFloat(form.card_sales) || 0) +
           (parseFloat(form.deposits_used) || 0) +
           (parseFloat(form.gift_cards_redeemed) || 0) +
           (parseFloat(form.petty_cash) || 0);
  }, [form]);

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

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await api.submitEODReport(form);
      showToast('End of day report saved');
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

  const f2 = n => (Number(n) || 0).toFixed(2);
  const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={s.root}>

      {/* ── Form column ────────────────────────────────────────────────── */}
      <div style={s.formCol}>
        <form onSubmit={handleSubmit} style={s.formCard}>
          <div style={s.formHeader}>
            <h2 style={s.formTitle}>End of Day Report</h2>
            <p style={s.formSub}>Fill in all sections then submit</p>
          </div>

          {/* Basic info */}
          <div style={s.basicRow}>
            <label style={s.fieldLabel}>
              Date <span style={s.req}>*</span>
              <input type="date" value={form.date} max={today()}
                onChange={e => set('date', e.target.value)} style={{ ...s.input, ...(errors.date ? s.inputErr : {}) }} />
              {errors.date && <span style={s.errMsg}>{errors.date}</span>}
            </label>
            <label style={s.fieldLabel}>
              Venue <span style={s.req}>*</span>
              <select value={form.venue_id} onChange={e => set('venue_id', e.target.value)}
                style={{ ...s.input, ...(errors.venue_id ? s.inputErr : {}) }}>
                <option value="">Select venue…</option>
                {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {errors.venue_id && <span style={s.errMsg}>{errors.venue_id}</span>}
            </label>
          </div>

          {/* ── Sales ── */}
          <Section label="Sales" icon="£" open={open.sales} onToggle={() => toggle('sales')}>
            <div style={s.grid2}>
              <NumField label="Cash Sales" value={form.cash_sales} onChange={v => set('cash_sales', v)} prefix="£" />
              <NumField label="Card Sales" value={form.card_sales} onChange={v => set('card_sales', v)} prefix="£" />
              <NumField label="Deposits Used" value={form.deposits_used} onChange={v => set('deposits_used', v)} prefix="£" />
              <NumField label="Gift Vouchers Redeemed" value={form.gift_cards_redeemed} onChange={v => set('gift_cards_redeemed', v)} prefix="£" />
            </div>
          </Section>

          {/* ── Cash Breakdown ── */}
          <Section label="Cash Count" icon="🪙" open={open.cash} onToggle={() => toggle('cash')}>
            <p style={s.hint}>Count each denomination. Total is auto-calculated.</p>
            <div style={s.denomGroup}>
              <p style={s.denomLabel}>Notes</p>
              <div style={s.denomRow}>
                {NOTES.map(({ k, label }) => (
                  <DenomField key={k} label={label} value={form[k]} onChange={v => set(k, v)} />
                ))}
              </div>
            </div>
            <div style={s.denomGroup}>
              <p style={s.denomLabel}>Coins</p>
              <div style={s.denomRow}>
                {COINS.map(({ k, label }) => (
                  <DenomField key={k} label={label} value={form[k]} onChange={v => set(k, v)} />
                ))}
              </div>
            </div>
            <div style={s.calcBox}>
              <span style={s.calcLabel}>Physical Cash Total</span>
              <span style={s.calcValue}>£{f2(physicalCash)}</span>
            </div>
          </Section>

          {/* ── Petty Cash ── */}
          <Section label="Petty Cash" icon="📋" open={open.petty} onToggle={() => toggle('petty')}>
            <p style={s.hint}>Petty cash is included in the grand total.</p>
            <div style={s.grid2}>
              <NumField label="Amount" value={form.petty_cash} onChange={v => set('petty_cash', v)} prefix="£" />
              <label style={s.fieldLabel}>
                Notes <span style={s.req}>*</span>
                <input value={form.petty_cash_notes} onChange={e => set('petty_cash_notes', e.target.value)}
                  placeholder="What was it used for?" style={{ ...s.input, ...(errors.petty_cash_notes ? s.inputErr : {}) }} />
                {errors.petty_cash_notes && <span style={s.errMsg}>{errors.petty_cash_notes}</span>}
              </label>
            </div>
          </Section>

          {/* ── Discounts ── */}
          <Section label="Discounts & Complimentary (not in sales)" icon="%" open={open.discounts} onToggle={() => toggle('discounts')}>
            <p style={s.hint}>These are tracked separately — not deducted from sales totals.</p>
            <div style={s.discBlock}>
              <div style={s.discRow}>
                <NumField label="Staff Discount" value={form.staff_discount} onChange={v => set('staff_discount', v)} prefix="£" />
                <label style={s.fieldLabel}>
                  Notes
                  <input value={form.staff_discount_notes} onChange={e => set('staff_discount_notes', e.target.value)}
                    placeholder="Staff name / reason" style={s.input} />
                </label>
              </div>
              <div style={s.discRow}>
                <NumField label="Friends & Family" value={form.fnf_discount} onChange={v => set('fnf_discount', v)} prefix="£" />
                <label style={s.fieldLabel}>
                  Notes
                  <input value={form.fnf_discount_notes} onChange={e => set('fnf_discount_notes', e.target.value)}
                    placeholder="Name / occasion" style={s.input} />
                </label>
              </div>
              <div style={s.discRow}>
                <NumField label="Complimentary Items" value={form.complimentary} onChange={v => set('complimentary', v)} prefix="£" />
                <label style={s.fieldLabel}>
                  Notes
                  <input value={form.complimentary_notes} onChange={e => set('complimentary_notes', e.target.value)}
                    placeholder="What was given / why" style={s.input} />
                </label>
              </div>
            </div>
          </Section>

          {/* ── Tips ── */}
          <Section label="Tips" icon="★" open={open.tips} onToggle={() => toggle('tips')}>
            <div style={s.grid2}>
              <NumField label="Card Tips" value={form.card_tips} onChange={v => set('card_tips', v)} prefix="£" />
              <NumField label="Cash Tips" value={form.cash_tips} onChange={v => set('cash_tips', v)} prefix="£" />
            </div>
          </Section>

          {/* ── Shift Notes ── */}
          <Section label="Shift Notes" icon="📝" open={open.notes} onToggle={() => toggle('notes')}>
            <textarea value={form.shift_notes} onChange={e => set('shift_notes', e.target.value)}
              placeholder="Any incidents, observations, or handover notes…"
              style={{ ...s.input, height: 80, resize: 'vertical' }} />
          </Section>

          {/* ── Totals summary ── */}
          <div style={s.totalsBox}>
            <h3 style={s.totalsTitle}>Auto-Calculated Totals</h3>
            <div style={s.totalsGrid}>
              <TotalRow label="Physical Cash (counted)" value={physicalCash} />
              <TotalRow label="+ Petty Cash" value={parseFloat(form.petty_cash) || 0} />
              <TotalRow label="= Total Cash in Till" value={totalCash} bold />
              <div style={s.totalsDivider} />
              <TotalRow label="Cash Sales" value={parseFloat(form.cash_sales) || 0} />
              <TotalRow label="Card Sales" value={parseFloat(form.card_sales) || 0} />
              <TotalRow label="Deposits Used" value={parseFloat(form.deposits_used) || 0} />
              <TotalRow label="Gift Vouchers" value={parseFloat(form.gift_cards_redeemed) || 0} />
              <TotalRow label="Petty Cash" value={parseFloat(form.petty_cash) || 0} />
              <div style={{ ...s.totalsDivider, marginTop: 4 }} />
              <TotalRow label="Grand Total" value={grandTotal} accent />
            </div>
          </div>

          <button type="submit" disabled={saving} style={s.submitBtn}>
            {saving ? 'Saving…' : 'Submit End of Day Report'}
          </button>
        </form>
      </div>

      {/* ── History column ─────────────────────────────────────────────── */}
      <div style={s.histCol}>
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
                    <td style={s.td}><RecPill hasSquare={!!r.has_square} /></td>
                    <td style={s.td}>
                      <button onClick={() => handleDelete(r.id)} style={s.delBtn} title="Delete">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ label, icon, open, onToggle, children }) {
  return (
    <div style={s.section}>
      <button type="button" onClick={onToggle} style={s.sectionBtn}>
        <span style={s.sectionIcon}>{icon}</span>
        <span style={s.sectionLabel}>{label}</span>
        <span style={{ ...s.sectionChevron, transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  );
}

function NumField({ label, value, onChange, prefix }) {
  return (
    <label style={s.fieldLabel}>
      {label}
      <div style={s.prefixWrap}>
        {prefix && <span style={s.prefix}>{prefix}</span>}
        <input type="number" step="0.01" min="0" placeholder="0.00"
          value={value} onChange={e => onChange(e.target.value)}
          style={{ ...s.input, paddingLeft: prefix ? 28 : 10 }} />
      </div>
    </label>
  );
}

function DenomField({ label, value, onChange }) {
  return (
    <div style={s.denomField}>
      <span style={s.denomBadge}>{label}</span>
      <input type="number" min="0" step="1" placeholder="0"
        value={value} onChange={e => onChange(e.target.value)} style={s.denomInput} />
    </div>
  );
}

function TotalRow({ label, value, bold, accent }) {
  return (
    <div style={s.totalRow}>
      <span style={{ fontSize: 13, color: accent ? '#c1440e' : '#7d6553', fontWeight: bold || accent ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold || accent ? 800 : 500, color: accent ? '#c1440e' : '#2d1f14' }}>
        £{(Number(value) || 0).toFixed(2)}
      </span>
    </div>
  );
}

function VenuePill({ name }) {
  const color = name?.includes('Waterfront') ? '#2563eb' : '#c1440e';
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: color + '18', color }}>{name}</span>;
}

function RecPill({ hasSquare }) {
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
  root:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' },
  formCol: { display: 'flex', flexDirection: 'column', gap: 0 },
  formCard:{ background: '#fff', borderRadius: 14, border: '1.5px solid #ede8e0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(45,31,20,0.07)' },
  formHeader:{ padding: '20px 24px 16px', borderBottom: '1px solid #f5ede0', background: '#fefcf9' },
  formTitle: { fontSize: 17, fontWeight: 800, color: '#2d1f14' },
  formSub:   { fontSize: 12, color: '#a89078', marginTop: 3 },

  basicRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '16px 24px' },

  section:    { borderTop: '1px solid #f5ede0' },
  sectionBtn: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 24px',
                background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' },
  sectionIcon: { fontSize: 14 },
  sectionLabel:{ fontSize: 13, fontWeight: 700, color: '#2d1f14', flex: 1 },
  sectionChevron:{ fontSize: 9, color: '#a89078', transition: 'transform 0.15s' },
  sectionBody: { padding: '4px 24px 18px' },

  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  hint:    { fontSize: 12, color: '#a89078', marginBottom: 10 },
  req:     { color: '#c1440e' },

  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600, color: '#4a3728' },
  input:      { padding: '8px 10px', border: '1.5px solid #ede8e0', borderRadius: 8, fontSize: 14, color: '#2d1f14', background: '#fff', width: '100%' },
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

  discBlock: { display: 'flex', flexDirection: 'column', gap: 12 },
  discRow:   { display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 },

  totalsBox:   { margin: '0', padding: '16px 24px', background: '#fefcf9', borderTop: '1.5px solid #f5ede0' },
  totalsTitle: { fontSize: 13, fontWeight: 700, color: '#4a3728', marginBottom: 10 },
  totalsGrid:  { display: 'flex', flexDirection: 'column', gap: 6 },
  totalRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' },
  totalsDivider:{ height: 1, background: '#ede8e0', margin: '4px 0' },

  submitBtn: { width: '100%', padding: '14px 0', background: '#c1440e', color: '#fff', border: 'none',
               fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.2px' },

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
