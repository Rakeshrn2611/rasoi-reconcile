import React, { useState } from 'react';
import { api } from '../api/client.js';

export default function Settings({ venues, showToast, refreshVenues }) {
  return (
    <div style={s.root}>
      <div style={s.card}>
        <h3 style={s.cardTitle}>Venues</h3>
        <p style={s.hint}>Set the Square Location ID for each venue to enable live data fetching.</p>
        <div style={s.venueList}>
          {venues.map(v => <VenueRow key={v.id} venue={v} showToast={showToast} onSave={refreshVenues} />)}
        </div>
      </div>

      <div style={s.card}>
        <h3 style={s.cardTitle}>API Keys Status</h3>
        <div style={s.apiList}>
          <ApiRow label="Square API" env="SQUARE_TOKEN" doc="developer.squareup.com → Apps → Access Token" />
          <ApiRow label="Anthropic (Claude)" env="ANTHROPIC_API_KEY" doc="console.anthropic.com → API Keys" />
          <ApiRow label="Google Vision" env="GOOGLE_APPLICATION_CREDENTIALS" doc="console.cloud.google.com → Vision API → Credentials → JSON key" />
        </div>
      </div>

      <div style={s.card}>
        <h3 style={s.cardTitle}>Reconciliation Thresholds</h3>
        <p style={s.hint}>Variances beyond these amounts will be flagged as warnings.</p>
        <div style={s.thresholds}>
          <ThresholdRow label="Cash variance threshold" value="£5.00" />
          <ThresholdRow label="Card variance threshold" value="£5.00" />
          <ThresholdRow label="High discounts alert" value="£200.00" />
          <ThresholdRow label="High comps alert" value="£50.00" />
        </div>
      </div>
    </div>
  );
}

function VenueRow({ venue, showToast, onSave }) {
  const [name, setName] = useState(venue.name);
  const [locationId, setLocationId] = useState(venue.square_location_id || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateVenue(venue.id, { name, square_location_id: locationId });
      showToast('Venue updated');
      onSave();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  }

  return (
    <div style={s.venueRow}>
      <div style={s.venueMark}>{name[0]}</div>
      <div style={s.venueFields}>
        <input value={name} onChange={e => setName(e.target.value)} style={s.input} placeholder="Venue name" />
        <input value={locationId} onChange={e => setLocationId(e.target.value)} style={{ ...s.input, fontFamily: 'monospace', fontSize: 12 }} placeholder="Square Location ID (e.g. LXXXXXXXXXXXXXXXX)" />
      </div>
      <button onClick={save} disabled={saving} style={s.saveBtn}>{saving ? '…' : 'Save'}</button>
    </div>
  );
}

function ApiRow({ label, env, doc }) {
  return (
    <div style={s.apiRow}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{label}</p>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Get key: {doc}</p>
      </div>
      <div style={s.envTag}>{env}</div>
    </div>
  );
}

function ThresholdRow({ label, value }) {
  return (
    <div style={s.thresholdRow}>
      <span style={{ fontSize: 14, color: '#374151' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>{value}</span>
    </div>
  );
}

const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 },
  card: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#0f172a' },
  hint: { fontSize: 13, color: '#64748b', marginTop: -8 },
  venueList: { display: 'flex', flexDirection: 'column', gap: 12 },
  venueRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' },
  venueMark: { width: 36, height: 36, borderRadius: 9, background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 },
  venueFields: { flex: 1, display: 'flex', gap: 8 },
  input: { flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, color: '#0f172a' },
  saveBtn: { padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600 },
  apiList: { display: 'flex', flexDirection: 'column', gap: 14 },
  apiRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' },
  envTag: { fontFamily: 'monospace', fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: 5 },
  thresholds: { display: 'flex', flexDirection: 'column', gap: 10 },
  thresholdRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 14 },
};
