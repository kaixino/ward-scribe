import React, { useState, useEffect } from 'react';
import { Users, Clock, User, ChevronLeft, Loader2, FileText, Mic, Stethoscope, ClipboardList, Calendar } from 'lucide-react';
import './CombinedReport.css';

const API_BASE = '/api';

export default function CombinedReport({ patient, currentNurse, onBack, onNewEntry }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    fetchConsolidated();
  }, [patient?.id]);

  async function fetchConsolidated() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/patients/${patient.id}/consolidated`);
      if (!res.ok) throw new Error('No consolidated report yet');
      const d = await res.json();
      setData(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div className="combined-loading">
        <Loader2 size={28} className="spin" />
        <p>Loading combined report...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="combined-empty">
        <FileText size={40} />
        <h3>No combined report yet</h3>
        <p>No entries have been recorded for this patient.</p>
        <button className="btn-primary" onClick={onNewEntry}>Record First Entry</button>
      </div>
    );
  }

  return (
    <div className="combined-report">
      {/* Tooltip */}
      {tooltip && (
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
      )}

      {/* Header with patient info */}
      <div className="combined-header">
        <div className="combined-header-top">
          <button className="btn-icon" onClick={onBack} title="Back"><ChevronLeft size={22} /></button>
          <div>
            <h2>{patient.name} <span className="bed-tag-sm">{patient.bed_number}</span></h2>
          </div>
        </div>
        <div className="combined-meta">
          <div className="combined-meta-item">
            <Calendar size={15} />
            <span><strong>{data.dayGroups?.length || 0}</strong> day{(data.dayGroups?.length || 0) !== 1 ? 's' : ''} · <strong>{data.reportCount}</strong> entr{data.reportCount !== 1 ? 'ies' : 'y'}</span>
          </div>
          <div className="combined-meta-item">
            <Users size={15} />
            <span><strong>{data.nurseCount}</strong> nurse{data.nurseCount !== 1 ? 's' : ''}{data.doctorCount > 0 ? ` · ${data.doctorCount} doctor${data.doctorCount !== 1 ? 's' : ''}` : ''}</span>
          </div>
        </div>
      </div>

      {/* Day-Aggregated Boxes — nurse name shown only on hover */}
      {data.dayGroups?.map((dayGroup, dgi) => (
        <div key={dgi} className="day-group">
          <div className="day-group-label">
            <Calendar size={16} />
            <h3>{dayGroup.date}</h3>
            <span className="day-group-count">{dayGroup.entries.length} entr{dayGroup.entries.length !== 1 ? 'ies' : 'y'}</span>
          </div>

          <div className="day-group-content">
            {dayGroup.entries.map((entry, ei) => {
              const entryInfo = {
                nurseName: entry.nurse_name || entry.created_by_name,
                nurseRole: entry.nurse_role || entry.created_by_role,
                timeFormatted: new Date(entry.timestamp).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                }),
              };
              return (
                <div key={entry.id || ei} className="entry-box">
                  {/* Entry header — show time only, no nurse name */}
                  <div className="entry-box-header">
                    <Clock size={14} />
                    <span className="entry-box-time">
                      {entryInfo.timeFormatted}
                    </span>
                    <span className="entry-type-badge">
                      {entry.report_type === 'doctor' ? 'Doctor' : 'Nurse'}
                    </span>
                  </div>

                  {/* Progress Note */}
                  {entry.progress_note_text && (
                    <div className="entry-section entry-progress">
                      <div className="entry-section-label">
                        <ClipboardList size={13} /> Progress Note
                      </div>
                      <pre
                        className="entry-text hover-reveal"
                        onMouseMove={(e) => handleTextHover(e, entryInfo)}
                        onMouseLeave={handleTextLeave}
                      >{entry.progress_note_text}</pre>
                    </div>
                  )}

                  {/* Doctor's Notes appended to this entry */}
                  {entry.doctorNotes && entry.doctorNotes.length > 0 && (
                    <div className="entry-section entry-doctor">
                      <div className="entry-section-label">
                        <Stethoscope size={13} /> Doctor's Notes
                      </div>
                      {entry.doctorNotes.map((dn, dni) => (
                        <div key={dni} className="entry-doctor-item">
                          <div className="entry-doctor-meta">
                            <span className="entry-doctor-time">
                              <Clock size={11} /> {dn.timeFormatted}
                            </span>
                          </div>
                          <pre
                            className="entry-doctor-text hover-reveal"
                            onMouseMove={(e) => handleTextHover(e, {
                              nurseName: dn.doctorName,
                              nurseRole: dn.doctorRole,
                              timeFormatted: dn.timeFormatted,
                            })}
                            onMouseLeave={handleTextLeave}
                          >{dn.text}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button className="btn-primary combined-new-btn" onClick={onNewEntry}>
        <FileText size={16} /> Add New Entry
      </button>
    </div>
  );
}
