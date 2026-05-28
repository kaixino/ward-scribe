import React, { useState, useEffect } from 'react';
import { BedDouble, AlertCircle, CheckCircle2, Clock, Users, Stethoscope, ArrowLeftRight } from 'lucide-react';
import './Dashboard.css';

const API_BASE = '/api';

export default function Dashboard({ patients, onSelectPatient, currentNurse, onViewPassing, ward, room }) {
  const isDoctor = currentNurse && /dr\.|doctor|MO|consultant|medical officer/i.test(currentNurse.role || '');
  const [reportStatus, setReportStatus] = useState({});

  useEffect(() => {
    patients.forEach(p => checkReportStatus(p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients]);

  async function checkReportStatus(patientId) {
    try {
      const res = await fetch(`${API_BASE}/patients/${patientId}/reports`);
      const data = await res.json();
      // Also check consolidated count
      let nurseCount = 0;
      let hasYourReport = false;
      try {
        const cRes = await fetch(`${API_BASE}/patients/${patientId}/consolidated`);
        if (cRes.ok) {
          const cData = await cRes.json();
          nurseCount = cData.nurseCount || 0;
          hasYourReport = cData.reports?.some(r => r.nurse_name === currentNurse?.name);
        }
      } catch { /* ignore */ }

      setReportStatus(prev => ({
        ...prev,
        [patientId]: {
          status: data ? data.status : null,
          nurseCount,
          hasYourReport: data ? hasYourReport : false,
        },
      }));
    } catch {
      // ignore
    }
  }

  function getStatusInfo(patientId) {
    const info = reportStatus[patientId];
    if (!info || !info.status) return { icon: Clock, className: '', label: 'No report', nurseCount: 0 };
    if (info.status === 'draft') return { icon: AlertCircle, className: 'status-pending', label: 'Pending review', nurseCount: info.nurseCount };
    if (info.status === 'signed') return { icon: CheckCircle2, className: 'status-signed', label: 'Signed off', nurseCount: info.nurseCount };
    return { icon: Clock, className: '', label: 'No report', nurseCount: 0 };
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>{room?.name || 'Ward Overview'}</h2>
        <p className="dashboard-subtitle">Select a patient bed to create or review documentation</p>
      </div>

      <div className="bed-grid">
        {patients.map(patient => {
          const { icon: StatusIcon, className, label, nurseCount } = getStatusInfo(patient.id);
          return (
            <button
              key={patient.id}
              className={`bed-card ${className}`}
              onClick={() => onSelectPatient(patient)}
            >
              <div className="bed-card-header">
                <BedDouble size={18} className="bed-icon" />
                <span className="bed-number">{patient.bed_number}</span>
                {nurseCount > 1 && (
                  <span className="multi-nurse-badge" title={`${nurseCount} nurses have reported`}>
                    <Users size={12} />
                    {nurseCount}
                  </span>
                )}
              </div>
              <div className="bed-card-body">
                <span className="patient-name">{patient.name}</span>
              </div>
              <div className="bed-card-footer">
                <span className={`status-badge ${className}`}>
                  <StatusIcon size={12} />
                  {label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Role-specific action bar */}
      {!isDoctor && onViewPassing && (
        <div className="dash-actions">
          <button className="dash-action-btn passing-btn" onClick={() => {
            if (patients.length > 0) {
              onViewPassing(patients[0]);
            }
          }}>
            <ArrowLeftRight size={18} />
            <div>
              <strong>End of Shift — Passing Over</strong>
              <span>Record handoff notes & audio for the next nurse</span>
            </div>
          </button>
        </div>
      )}
      {isDoctor && (
        <div className="dash-actions">
          <div className="dash-info-bar">
            <Stethoscope size={18} />
            <span>You are logged in as a clinician. Select a patient to view their clinical notes and add a progress note.</span>
          </div>
        </div>
      )}

      <div className="dashboard-footer-note">
        <span className="legend-item">
          <span className="legend-dot pending"></span> Pending review
        </span>
        <span className="legend-item">
          <span className="legend-dot signed"></span> Signed off
        </span>
        <span className="legend-item">
          <span className="legend-dot multi"></span> Multiple nurses
        </span>
        <span className="legend-item">
          <span className="legend-dot none"></span> No report
        </span>
      </div>
    </div>
  );
}
