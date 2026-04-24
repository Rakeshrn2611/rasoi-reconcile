import React, { useState, useEffect } from 'react';
import { api } from './api/client.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import Dashboard from './pages/Dashboard.jsx';
import Reconcile from './pages/Reconcile.jsx';
import ManagerReports from './pages/ManagerReports.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import CashSales from './pages/CashSales.jsx';
import CardSales from './pages/CardSales.jsx';
import Refunds from './pages/Refunds.jsx';
import Discounts from './pages/Discounts.jsx';
import GiftCards from './pages/GiftCards.jsx';
import DiscrepanciesPage from './pages/Discrepancies.jsx';

const NAV = [
  { id: 'dashboard',      label: 'Dashboard',       icon: IconGrid },
  { id: 'reports',        label: 'Manager Reports', icon: IconDoc },
  { id: 'discrepancies',  label: 'Discrepancies',   icon: IconAlert },
  { id: 'history',        label: 'History',         icon: IconClock },
  { id: 'settings',       label: 'Settings',        icon: IconGear },
];

const ALL_PAGES = {
  dashboard:      { label: 'Dashboard' },
  reconcile:      { label: 'Reconciliation' },
  reports:        { label: 'Manager Reports' },
  discrepancies:  { label: 'Discrepancies' },
  history:        { label: 'History' },
  settings:       { label: 'Settings' },
  cash:           { label: 'Cash Sales',    parent: 'dashboard' },
  card:           { label: 'Card Sales',    parent: 'dashboard' },
  refunds:        { label: 'Refunds',       parent: 'dashboard' },
  discounts:      { label: 'Discounts',     parent: 'dashboard' },
  gift_cards:     { label: 'Gift Vouchers', parent: 'dashboard' },
};

export default function App() {
  const [page,           setPage]           = useState('dashboard');
  const [venues,         setVenues]         = useState([]);
  const [toast,          setToast]          = useState(null);
  const [selectedVenue,  setSelectedVenue]  = useState('all');
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    api.getVenues().then(setVenues).catch(() => {});
  }, []);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function navigateTo(p) {
    setPage(p);
    if (isMobile) setSidebarOpen(false);
  }

  const pageProps = {
    venues,
    showToast,
    navigateTo,
    refreshVenues: () => api.getVenues().then(setVenues),
    selectedVenue,
    setSelectedVenue,
  };

  const pageMeta  = ALL_PAGES[page];
  const pageTitle = pageMeta?.label ?? 'Dashboard';
  const parentPage = pageMeta?.parent;

  const navActive = (id) =>
    page === id || (id === 'dashboard' && ALL_PAGES[page]?.parent === 'dashboard');

  return (
    <div style={s.root}>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div style={s.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside style={{
        ...s.sidebar,
        ...(isMobile ? {
          position: 'fixed',
          zIndex: 200,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        } : {}),
      }}>
        <div style={s.sidebarLogo}>
          <img src="/rasoi-logo.jpg" alt="Rasoi" style={s.logoImg} />
        </div>

        <p style={s.navLabel}>Navigate</p>
        <nav style={s.nav}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = navActive(id);
            return (
              <button key={id} onClick={() => navigateTo(id)}
                style={{ ...s.navBtn, ...(active ? s.navBtnActive : {}) }}>
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
      <div style={{ ...s.main, ...(isMobile ? { paddingBottom: 64 } : {}) }}>
        <header style={s.topbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isMobile && (
              <button onClick={() => setSidebarOpen(o => !o)} style={s.hamburger}>
                <IconMenu />
              </button>
            )}
            {parentPage && (
              <button onClick={() => navigateTo(parentPage)} style={s.backBtn}>
                ← Back
              </button>
            )}
            <h1 style={s.pageTitle}>{pageTitle}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!isMobile && (
              <span style={s.topDate}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            )}
            {venues.length > 0 && (
              <select
                value={selectedVenue}
                onChange={e => setSelectedVenue(e.target.value)}
                style={s.venueSelect}
              >
                <option value="all">All Venues</option>
                {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
          </div>
        </header>

        <div style={s.content}>
          {page === 'dashboard'  && <Dashboard      {...pageProps} />}
          {page === 'reconcile'  && <Reconcile      {...pageProps} />}
          {page === 'reports'    && <ManagerReports {...pageProps} />}
          {page === 'history'    && <History        {...pageProps} />}
          {page === 'settings'   && <Settings       {...pageProps} />}
          {page === 'cash'       && <CashSales      {...pageProps} />}
          {page === 'card'       && <CardSales      {...pageProps} />}
          {page === 'refunds'    && <Refunds        {...pageProps} />}
          {page === 'discounts'  && <Discounts      {...pageProps} />}
          {page === 'gift_cards'    && <GiftCards        {...pageProps} />}
          {page === 'discrepancies' && <DiscrepanciesPage {...pageProps} />}
        </div>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav style={s.bottomNav}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = navActive(id);
            return (
              <button key={id} onClick={() => navigateTo(id)}
                style={{ ...s.bottomNavBtn, ...(active ? s.bottomNavBtnActive : {}) }}>
                <span style={{ color: active ? '#c9a87c' : '#6b7280' }}><Icon /></span>
                <span style={{ fontSize: 10, marginTop: 2 }}>{label}</span>
              </button>
            );
          })}
        </nav>
      )}

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
function IconMenu() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}
function IconAlert() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  root: { display: 'flex', minHeight: '100vh', background: '#faf7f2' },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(30,20,10,0.45)', zIndex: 199,
  },

  sidebar: {
    width: 240, minHeight: '100vh', background: '#1e140a',
    display: 'flex', flexDirection: 'column', padding: '0 0 24px',
    position: 'sticky', top: 0, height: '100vh', flexShrink: 0,
  },
  sidebarLogo: {
    background: '#faf7f2', borderBottom: '1px solid #e8dcc8',
    padding: '14px 20px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', minHeight: 72,
  },
  logoImg: { height: 44, width: 'auto', objectFit: 'contain', display: 'block', mixBlendMode: 'multiply' },

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
    background: '#ffffff', borderBottom: '1px solid #e8dfd4',
    padding: '0 28px', height: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 10,
  },
  hamburger: {
    background: 'none', border: 'none', padding: 6, borderRadius: 7,
    color: '#4a3728', cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
  backBtn: {
    padding: '5px 12px', background: '#f5ede0', border: '1px solid #e8dcc8',
    borderRadius: 7, fontSize: 13, color: '#7d6553', cursor: 'pointer', fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  pageTitle: { fontSize: 21, fontWeight: 800, color: '#1a0b04', letterSpacing: '-0.4px' },
  topDate: { fontSize: 13, color: '#a89078' },
  venueSelect: {
    padding: '6px 10px', border: '1.5px solid #ede8e0', borderRadius: 8,
    fontSize: 13, color: '#2d1f14', background: '#fff', cursor: 'pointer', fontWeight: 500,
  },

  content: { padding: 28, flex: 1 },

  bottomNav: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    height: 64, background: '#fff', borderTop: '1px solid #e8dfd4',
    display: 'flex', alignItems: 'stretch', zIndex: 100,
  },
  bottomNavBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 2, background: 'none', border: 'none',
    color: '#6b7280', fontSize: 10, fontWeight: 500, cursor: 'pointer',
  },
  bottomNavBtnActive: {
    color: '#c9a87c', fontWeight: 700,
  },

  toast: {
    position: 'fixed', bottom: 24, right: 24,
    color: '#fff', padding: '12px 20px', borderRadius: 9,
    fontSize: 14, fontWeight: 500, boxShadow: '0 4px 16px rgba(45,31,20,0.25)',
    zIndex: 100,
  },
};
