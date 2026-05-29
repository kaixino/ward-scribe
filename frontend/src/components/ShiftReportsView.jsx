import React, { useState, useEffect } from 'react';
import { FileText, Clock, User, ChevronLeft, Loader2, Mic, Stethoscope, ClipboardList, Calendar, Search } from 'lucide-react';
import './ShiftReportsView.css';

const API_BASE = '/api';

export default function ShiftReportsView({ currentNurse, onBack, onNavigateToPatient }) {
  const [allPatients, setAllPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [shiftData, setShiftData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAllPatients();
  }, []);

  async function fetchAllPatients() {
    setLoadingPatients(true);
    try {
      const res = await fetch(`${API_BASE}/patients`);
      const data = await res.json();
      setAllPatients(data);
    } catch (err) {
      console.error('Failed to fetch patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  }

  async function fetchShiftReports(patientId) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/patients/${patientId}/shift-reports`);
      if (res.ok) {
        const data = await res.json();
        setShiftData(data);
      } else {
        setShiftData(null);
      }
    } catch (err) {
      console.error('Failed to fetch shift reports:', err);
      setShiftData(null);
    } finally {
      setLoading(false);
    }
  }

  function handlePatientSelect(patient) {
    setSelectedPatient(patient);
    fetchShiftReports(patient.id);
  }

  function handleBack() {
    if (selectedPatient) {
      setSelectedPatient(null);
      setShiftData(null);
    } else {
      onBack();
    }
  }

  function handleTextHover(e, info) {
    const rect = e.target.getBoundingClientRect();
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      nurseName: info.nurseName,
      nurseRole: info.nurseRole,
      timeFormatted: info.timeFormatted,
    });
  }

  function handleTextLeave() {
    setTooltip(null);
  }

  // Tooltip element
  const tooltipEl = tooltip && (
    <div className="attribution-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
      <div className="tooltip-nurse">
        <User size={13} />
        <strong>{tooltip.nurseName}</strong>
        <span className="tooltip-role">{tooltip.nurseRole}</span>
      </div>
      <div className="tooltip-time">
        <Clock size={11} /> {tooltip.timeFormatted}
      </div>
    </div>
  );

  const filteredPatients = allPatients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.bed_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Patient List View ──
  if (!selectedPatient) {
    return (
      <div className="sr-view">
        {tooltipEl}
        <div className="sr-header">
          <button className="btn-icon" onClick={handleBack}><ChevronLeft size={22} /></button>
          <div>
            <h2><FileText size={20} /> All Patient Reports</h2>
            <p className="sr-subtitle">Select a patient to view their combined handover & progress notes</p>
          </div>
        </div>

        {/* Search */}
        <div className="sr-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search patient name or bed..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {loadingPatients ? (
          <div className="sr-loading"><Loader2 size={24} className="spin" /> Loading patients...</div>
        ) : (
          <div className="sr-patient-grid">
            {filteredPatients.map(p => (
              <button key={p.id} className="sr-patient-card" onClick={() => handlePatientSelect(p)}>
                <div className="sr-patient-top">
                  <span className="sr-patient-name">{p.name}</span>
                  <span className="sr-patient-bed">{p.bed_number}</span>
                </div>
                <div className="sr-patient-meta">
                  {p.age && <span>{p.age} yrs</span>}
                  {p.gender && <span>{p.gender}</span>}
                  {p.ward_name && <span>{p.ward_name}</span>}
                </div>
              </button>
            ))}
            {filteredPatients.length === 0 && (
              <div className="sr-empty">No patients found</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Patient Detail: Shift-Combined Reports ──
  return (
    <div className="sr-view">
      {tooltipEl}

      <div className="sr-header">
        <button className="btn-icon" onClick={handleBack}><ChevronLeft size={22} /></button>
        <div>
          <h2>{selectedPatient.name} <span className="bed-tag-sm">{selectedPatient.bed_number}</span></h2>
        </div>
      </div>

      {/* Patient Profile — always visible */}
      <div className="sr-patient-profile">
        <div className="sr-profile-row">
          <span className="sr-profile-label">Age</span>
          <span className="sr-profile-value">{selectedPatient.age || 'N/A'} years</span>
        </div>
        <div className="sr-profile-row">
          <span className="sr-profile-label">Gender</span>
          <span className="sr-profile-value">{selectedPatient.gender || 'N/A'}</span>
        </div>
        <div className="sr-profile-row">
          <span className="sr-profile-label">Medical History</span>
          <span className="sr-profile-value">{selectedPatient.medical_history || 'None documented'}</span>
        </div>
        <div className="sr-profile-row">
          <span className="sr-profile-label">Ward / Room</span>
          <span className="sr-profile-value">{selectedPatient.ward_name || 'N/A'} · {selectedPatient.room_name || 'N/A'}</span>
        </div>
      </div>

      {loading ? (
        <div className="sr-loading"><Loader2 size={24} className="spin" /> Loading reports...</div>
      ) : !shiftData || shiftData.shiftGroups.length === 0 ? (
        <div className="sr-empty-state">
          <FileText size={36} />
          <h3>No reports yet</h3>
          <p>No reports have been recorded for this patient.</p>
        </div>
      ) : (
        <div className="sr-shift-groups">
          {shiftData.shiftGroups.map((group, gi) => (
            <div key={gi} className="sr-shift-group">
              <div className="sr-shift-label">
                <Calendar size={15} />
                <strong>{group.date}</strong>
                <span className="sr-shift-badge">{group.shift}</span>
                <span className="sr-shift-time">{group.timeFormatted}</span>
              </div>

              <div className="sr-shift-content">
                <div className="sr-shift-columns">
                  {/* Handover Report — LEFT column */}
                  <div className="sr-column sr-handover-column">
                    <div className="sr-column-header">
                      <Mic size={13} /> Handover Report
                    </div>
                    <div className="sr-column-entries">
                      {group.handoverEntries.length > 0 ? group.handoverEntries.map((entry, ei) => (
                        <div key={ei} className="sr-entry-line">
                          <span className="sr-entry-time">{entry.timeFormatted}</span>
                          <pre
                            className="sr-entry-text hover-reveal"
                            onMouseMove={(e) => handleTextHover(e, entry)}
                            onMouseLeave={handleTextLeave}
                          >{entry.text}</pre>
                        </div>
                      )) : <div className="sr-column-empty">No handover entries</div>}
                    </div>
                  </div>

                  {/* Progress Note — RIGHT column */}
                  <div className="sr-column sr-progress-column">
                    <div className="sr-column-header">
                      <ClipboardList size={13} /> Progress Note
                    </div>
                    <div className="sr-column-entries">
                      {group.progressEntries.length > 0 ? group.progressEntries.map((entry, ei) => (
                        <div key={ei} className="sr-entry-line">
                          <span className="sr-entry-time">{entry.timeFormatted}</span>
                          <pre
                            className="sr-entry-text hover-reveal"
                            onMouseMove={(e) => handleTextHover(e, entry)}
                            onMouseLeave={handleTextLeave}
                          >{entry.text}</pre>
                        </div>
                      )) : <div className="sr-column-empty">No progress entries</div>}
                    </div>

                    {/* Doctor's Notes — below progress entries, highlighted blue */}
                    {group.doctorEntries && group.doctorEntries.length > 0 && (
                      <div className="sr-doctor-section">
                        <div className="sr-doctor-header">
                          <Stethoscope size={13} /> Doctor's Notes
                        </div>
                        {group.doctorEntries.map((entry, ei) => (
                          <div key={ei} className="sr-entry-line sr-doctor-line">
                            <span className="sr-entry-time sr-doctor-time">{entry.timeFormatted}</span>
                            <pre
                              className="sr-entry-text sr-doctor-text hover-reveal"
                              onMouseMove={(e) => handleTextHover(e, {
                                nurseName: entry.doctorName,
                                nurseRole: entry.doctorRole,
                                timeFormatted: entry.timeFormatted,
                              })}
                              onMouseLeave={handleTextLeave}
                            >{entry.text}</pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
