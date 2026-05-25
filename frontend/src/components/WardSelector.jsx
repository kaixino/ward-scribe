import React from 'react';
import { Building2, HeartPulse, Baby, Stethoscope, ArrowRight } from 'lucide-react';
import './WardSelector.css';

const wardIcons = {
  'ward-gw': Building2,
  'ward-icu': HeartPulse,
  'ward-peds': Baby,
  'ward-mat': Stethoscope,
};

const wardColors = {
  'ward-gw': 'var(--color-primary)',
  'ward-icu': '#c97065',
  'ward-peds': '#5b9f7a',
  'ward-mat': '#b88dc4',
};

export default function WardSelector({ wards, currentNurse, onSelectWard, onLogout }) {
  return (
    <div className="ward-selector">
      <div className="ward-header">
        <div>
          <h2>Select Ward</h2>
          <p className="ward-subtitle">
            Welcome, <strong>{currentNurse?.name}</strong> · {currentNurse?.role} · {currentNurse?.shift} Shift
          </p>
        </div>
        <button className="btn-outline" onClick={onLogout}>
          Switch Nurse
        </button>
      </div>

      <div className="ward-grid">
        {wards.map(ward => {
          const Icon = wardIcons[ward.id] || Building2;
          const accent = wardColors[ward.id] || 'var(--color-primary)';
          return (
            <button
              key={ward.id}
              className="ward-card"
              style={{ '--ward-accent': accent }}
              onClick={() => onSelectWard(ward)}
            >
              <div className="ward-card-icon" style={{ background: `${accent}18`, color: accent }}>
                <Icon size={28} />
              </div>
              <div className="ward-card-body">
                <h3>{ward.name}</h3>
                <p>{ward.description}</p>
              </div>
              <div className="ward-card-arrow">
                <ArrowRight size={20} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
