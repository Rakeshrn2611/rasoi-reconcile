const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  getVenues: () => request('/venues'),
  createVenue: (data) => request('/venues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateVenue: (id, data) => request(`/venues/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  getDashboardStats: (params = {}) => request(`/dashboard/stats?${new URLSearchParams(params)}`),

  getReports: (params = {}) => request(`/reports?${new URLSearchParams(params)}`),
  submitReport: (formData) => request('/reports', { method: 'POST', body: formData }),
  submitEODReport: (data) => request('/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteReport: (id) => request(`/reports/${id}`, { method: 'DELETE' }),

  fetchSquare: (venue_id, date) => request('/square/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id, date }) }),
  getSquareDetails: (venue_id, date) => request(`/square/details?${new URLSearchParams({ venue_id, date })}`),

  reconcile: (venue_id, date) => request(`/reconcile?${new URLSearchParams({ venue_id, date })}`),
  getSummary: (params = {}) => request(`/reconcile/summary?${new URLSearchParams(params)}`),

  getRefunds:   (params = {}) => request(`/refunds?${new URLSearchParams(params)}`),
  getComps:     (params = {}) => request(`/comps?${new URLSearchParams(params)}`),
  getDiscounts: (params = {}) => request(`/discounts?${new URLSearchParams(params)}`),
  getGiftCards: (params = {}) => request(`/gift-cards?${new URLSearchParams(params)}`),
  updateReport: (id, data) => request(`/reports/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  getReportEntries: (id) => request(`/reports/${id}/entries`),

  saveReconNotes: (venue_id, date, notes) => request('/square/notes', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ venue_id, date, recon_notes: notes }),
  }),
  lockRecon: (venue_id, date) => request('/square/lock', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id, date }) }),
  unlockRecon: (venue_id, date) => request('/square/unlock', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id, date }) }),

  setActualCash: (id, actual_cash_held, actual_cash_notes) => request(`/reports/${id}/actual-cash`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actual_cash_held, actual_cash_notes }) }),
  getDiscrepancies: (params = {}) => request(`/discrepancies?${new URLSearchParams(params)}`),
  setDiscrepancyStatus: (venue_id, date, category, status, notes) => request('/discrepancies/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id, date, category, status, notes }) }),
  getTips: (params = {}) => request(`/tips?${new URLSearchParams(params)}`),
  setCashTipsFinal: (id, cash_tips_final) => request(`/reports/${id}/cash-tips-final`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cash_tips_final }) }),
  exportExcel: (params = {}) => {
    const url = `${BASE}/export/excel?${new URLSearchParams(params)}`;
    window.location.href = url;
  },
};
