import React, { useState, useEffect } from 'react';
import { Users, Clock, User, ChevronLeft, Loader2, FileText, Mic, Stethoscope } from 'lucide-react';
import './CombinedReport.css';

const API_BASE = '/api';

export default function CombinedReport({ patient, currentNurse, onBack, onNewEntry }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredLine, setHoveredLine] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

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

  function handleMouseEnter(e, entry) {
    const rect = e.target.getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    setHoveredLine(entry);
  }

  function handleMouseLeave() {
    setHoveredLine(null);
  }

  // Group entries by individual report, including doctor notes inside each box
  function groupByReport(reports) {
    return reports.map(r => ({
      reportId: r.id,
      nurseName: r.nurse_name,
      nurseRole: r.nurse_role,
      nurseId: r.created_by_nurse_id,
      timestamp: r.timestamp,
      timeFormatted: new Date(r.timestamp).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
      handoverText: r.handover_text,
      progressText: r.progress_note_text,
      doctorNotes: r.doctorNotes || [],
      lines: (r.progress_note_text || '').split('\n').filter(l => l.trim()).map((line, i) => ({
        text: line,
        nurseName: r.nurse_name,
        nurseRole: r.nurse_role,
        nurseId: r.created_by_nurse_id,
        reportId: r.id,
        timestamp: r.timestamp,
        timeFormatted: new Date(r.timestamp).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }),
      })),
    }));
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
        <p>No nurse entries have been recorded for this patient.</p>
        <button className="btn-primary" onClick={onNewEntry}>Record First Entry</button>
      </div>
    );
  }

  const reportGroups = groupByReport(data.reports);

  return (
    <div className="combined-report">
      {/* Header */}
      <div className="combined-header">
        <div className="combined-header-top">
          <button className="btn-icon" onClick={onBack} title="Back"><ChevronLeft size={22} /></button>
          <div>
            <h2>{patient.name} <span className="bed-tag-sm">{patient.bed_number}</span></h2>
          </div>
        </div>
        <div className="combined-meta">
          <div className="combined-meta-item">
            <Users size={15} />
            <span><strong>{data.nurseCount}</strong> nurse{data.nurseCount !== 1 ? 's' : ''} · <strong>{data.reportCount}</strong> entr{data.reportCount !== 1 ? 'ies' : 'y'}</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredLine && (
        <div className="attribution-tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <div className="tooltip-nurse">
            <User size={13} />
            <strong>{hoveredLine.nurseName}</strong>
            <span className="tooltip-role">{hoveredLine.nurseRole}</span>
          </div>
          <div className="tooltip-time">
            <Clock size={11} />
            {hoveredLine.timeFormatted}
          </div>
        </div>
      )}

      {/* Per-Report Boxes — each entry = one box */}
      {reportGroups.map((grp, gi) => {
        const isYou = grp.nurseId === currentNurse?.id;
        const accent = getColor(grp.nurseName);
        return (
          <div key={grp.reportId || gi} className={`nurse-box ${isYou ? 'nurse-box-you' : ''}`} style={{ borderLeftColor: accent }}>
            <div className="nurse-box-header">
              <div className="nurse-box-title">
                <User size={16} />
                <strong>{grp.nurseName}</strong>
                <span className="nurse-box-role">{grp.nurseRole}</span>
                {isYou && <span className="you-badge" style={{ marginLeft: 6 }}>You</span>}
              </div>
              <span className="nurse-box-count">{grp.timeFormatted}</span>
            </div>
            <div className="nurse-box-entries">
              {grp.lines.map((entry, idx) => (
                <div
                  key={idx}
                  className="entry-line"
                  onMouseEnter={(e) => handleMouseEnter(e, entry)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="entry-indicator" style={{ backgroundColor: accent }} />
                  <span className="entry-text">{entry.text}</span>
                </div>
              ))}
            </div>

            {/* Doctor's Notes inside same box */}
            {grp.doctorNotes.length > 0 && (
              <div className="nurse-box-doctor">
                <div className="nurse-box-doctor-divider">👨‍⚕️ Doctor's Notes</div>
                {grp.doctorNotes.map((dn, dIdx) => (
                  <div key={dIdx} className="nurse-box-doctor-entry">
                    <div className="nurse-box-doctor-meta">
                      <Stethoscope size={12} />
                      <strong>{dn.doctorName}</strong>
                      <span className="nurse-box-doctor-role">{dn.doctorRole}</span>
                      <span className="nurse-box-doctor-time">{dn.timeFormatted}</span>
                    </div>
                    <pre className="nurse-box-doctor-text">{dn.text}</pre>
                  </div>
                ))}
              </div>
            )}

            <div className="nurse-box-footer">
              <Mic size={12} /> {grp.timeFormatted}
            </div>
          </div>
        );
      })}

      <button className="btn-primary combined-new-btn" onClick={onNewEntry}>
        <FileText size={16} /> Add New Entry
      </button>
    </div>
  );
}

const nurseColors = {};
const colorPalette = ['#3a7d5c', '#5b7faf', '#b88dc4', '#c97065', '#e8c87a', '#5b9f7a'];

function getColor(nurseName) {
  if (!nurseColors[nurseName]) {
    const idx = Object.keys(nurseColors).length % colorPalette.length;
    nurseColors[nurseName] = colorPalette[idx];
  }
  return nurseColors[nurseName];
}
