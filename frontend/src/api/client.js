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
  deleteReport: (id) => request(`/reports/${id}`, { method: 'DELETE' }),

  fetchSquare: (venue_id, date) => request('/square/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue_id, date }) }),
  getSquareDetails: (venue_id, date) => request(`/square/details?${new URLSearchParams({ venue_id, date })}`),

  reconcile: (venue_id, date) => request(`/reconcile?${new URLSearchParams({ venue_id, date })}`),
  getSummary: (params = {}) => request(`/reconcile/summary?${new URLSearchParams(params)}`),
};
