import React, { useState, useEffect } from 'react';
import { api } from './api/client.js';
import Dashboard from './pages/Dashboard.jsx';
import Reconcile from './pages/Reconcile.jsx';
import ManagerReports from './pages/ManagerReports.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard',       icon: IconGrid },
  { id: 'reports',   label: 'Manager Reports', icon: IconDoc },
  { id: 'history',   label: 'History',         icon: IconClock },
  { id: 'settings',  label: 'Settings',        icon: IconGear },
];

const ALL_PAGES = {
  dashboard: { label: 'Dashboard' },
  reconcile:  { label: 'Reconciliation' },
  reports:    { label: 'Manager Reports' },
  history:    { label: 'History' },
  settings:   { label: 'Settings' },
};

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [venues, setVenues] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.getVenues().then(setVenues).catch(() => {});
  }, []);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const pageProps = {
    venues,
    showToast,
    navigateTo: setPage,
    refreshVenues: () => api.getVenues().then(setVenues),
  };

  const pageTitle = ALL_PAGES[page]?.label ?? 'Dashboard';

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <img src="/rasoi-logo.jpg" alt="Rasoi" style={s.logoImg} />
        </div>

        <p style={s.navLabel}>Navigate</p>
        <nav style={s.nav}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <button key={id} onClick={() => setPage(id)} style={{ ...s.navBtn, ...(active ? s.navBtnActive : {}) }}>
                <span style={{ ...s.navIcon, ...(active ? s.navIconActive : {}) }}>
                  <Icon />
                </span>
                <span>{label}</span>
                {active && <span style={s.navDot} />}
              </button>
            );
          })}
        </nav>

        <div style={s.sidebarFooter}>
          <p style={s.venueFooterLabel}>Venues</p>
          <div style={s.venuePills}>
            {venues.map(v => (
              <div key={v.id} style={s.venuePill}>{v.name}</div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={s.main}>
        <header style={s.topbar}>
          <h1 style={s.pageTitle}>{pageTitle}</h1>
          <span style={s.topDate}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </header>

        <div style={s.content}>
          {page === 'dashboard' && <Dashboard {...pageProps} />}
          {page === 'reconcile' && <Reconcile {...pageProps} />}
          {page === 'reports'   && <ManagerReports {...pageProps} />}
          {page === 'history'   && <History {...pageProps} />}
          {page === 'settings'  && <Settings {...pageProps} />}
        </div>
      </div>

      {toast && (
        <div style={{ ...s.toast, background: toast.type === 'error' ? '#c1440e' : '#5a7a30' }}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Icons (inline SVG) ────────────────────────────────────────────────────────

function IconGrid() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
}
function IconDoc() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>;
}
function IconClock() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IconGear() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  root: { display: 'flex', minHeight: '100vh', background: '#faf7f2' },

  sidebar: {
    width: 240, minHeight: '100vh', background: '#111827',
    display: 'flex', flexDirection: 'column', padding: '0 0 24px',
    position: 'sticky', top: 0, height: '100vh', flexShrink: 0,
  },
  sidebarLogo: {
    background: '#faf7f2', borderBottom: '1px solid #e8dcc8',
    padding: '14px 20px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', minHeight: 72,
  },
  logoImg: { height: 44, width: 'auto', objectFit: 'contain', display: 'block' },

  navLabel: { color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', padding: '16px 20px 8px' },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px' },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
    background: 'none', border: 'none', borderRadius: 8,
    color: '#9ca3af', fontSize: 14, fontWeight: 500, textAlign: 'left',
    transition: 'all 0.15s', position: 'relative', width: '100%',
  },
  navBtnActive: { background: 'rgba(201,168,124,0.14)', color: '#c9a87c', fontWeight: 600 },
  navIcon: { color: '#6b7280', flexShrink: 0 },
  navIconActive: { color: '#c9a87c' },
  navDot: {
    width: 4, height: 4, borderRadius: '50%', background: '#c9a87c',
    position: 'absolute', right: 12,
  },

  sidebarFooter: { marginTop: 'auto', padding: '0 12px' },
  venueFooterLabel: { color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', padding: '0 8px 6px' },
  venuePills: { display: 'flex', flexDirection: 'column', gap: 4 },
  venuePill: {
    padding: '6px 10px', borderRadius: 6, background: 'rgba(201,168,124,0.08)',
    color: '#9ca3af', fontSize: 11, fontWeight: 500, border: '1px solid rgba(201,168,124,0.12)',
  },

  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topbar: {
    background: '#fff9f4', borderBottom: '1px solid #ede8e0',
    padding: '0 28px', height: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 10,
  },
  pageTitle: { fontSize: 17, fontWeight: 700, color: '#2d1f14' },
  topDate: { fontSize: 13, color: '#a89078' },

  content: { padding: 28, flex: 1 },

  toast: {
    position: 'fixed', bottom: 24, right: 24,
    color: '#fff', padding: '12px 20px', borderRadius: 9,
    fontSize: 14, fontWeight: 500, boxShadow: '0 4px 16px rgba(45,31,20,0.25)',
    zIndex: 100,
  },
};
