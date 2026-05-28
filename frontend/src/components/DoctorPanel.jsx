import React, { useState, useEffect, useRef } from 'react';
import { FileText, Mic, Square, Loader2, ChevronLeft, Clock, User, AlertTriangle, Stethoscope, Trash2, Calendar } from 'lucide-react';
import './DoctorPanel.css';

const API_BASE = '/api';

export default function DoctorPanel({ patient, selectedWard, currentNurse, onBack, onReportsUpdated }) {
  const [allReports, setAllReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [speechError, setSpeechError] = useState(null);
  const [step, setStep] = useState('selectReport'); // selectReport | writeNote
  const [tooltip, setTooltip] = useState(null);
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const textareaRef = useRef(null);

  // Fetch all reports for this patient on mount
  useEffect(() => {
    fetchReports();
  }, [patient?.id]);

  async function fetchReports() {
    try {
      const res = await fetch(`${API_BASE}/patients/${patient.id}/all-reports`);
      if (res.ok) {
        const data = await res.json();
        setAllReports(data);
        if (data.length > 0) {
          setSelectedReport(data[0]);
        }
      }
    } catch { /* ignore */ }
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

  /** Group reports by day */
  function groupByDay(reports) {
    const groups = {};
    reports.forEach(r => {
      const dateKey = new Date(r.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(r);
    });
    return Object.entries(groups).map(([date, entries]) => ({ date, entries }));
  }

  // Speech-to-text
  function createRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    r.onresult = (e) => {
      let final = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript + ' ';
        else interim += res[0].transcript;
      }
      if (final) setTranscript(prev => prev + final);
      setInterimText(interim);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed') setSpeechError('Microphone blocked.');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setSpeechError(`Error: ${e.error}`);
    };
    r.onend = () => {
      if (isRecordingRef.current) {
        const nr = createRecognition();
        if (nr) { recognitionRef.current = nr; try { nr.start(); } catch {} }
      }
    };
    return r;
  }

  function toggleRecording() {
    if (isRecording) {
      isRecordingRef.current = false;
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
      recognitionRef.current = null;
      setIsRecording(false); setInterimText('');
    } else {
      setSpeechError(null);
      const r = createRecognition();
      if (!r) { setSpeechError('Speech recognition not available. Type your note instead.'); return; }
      recognitionRef.current = r;
      try { r.start(); isRecordingRef.current = true; setIsRecording(true); }
      catch { setSpeechError('Could not start microphone.'); }
    }
  }

  async function handleSubmit() {
    if (!transcript.trim() || !selectedReport) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          nurse_id: currentNurse.id,
          doctor_name: currentNurse.name,
          parent_report_id: selectedReport.id,
          transcript,
          report_type: 'doctor',
        }),
      });
      if (res.ok) {
        setTranscript('');
        if (onReportsUpdated) onReportsUpdated();
        await fetchReports();
      }
    } catch (err) {
      setSpeechError('Failed to save doctor\'s note.');
    } finally {
      setLoading(false);
    }
  }

  // ---- Tooltip (shared) ----
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

  // ==================================================================
  // STEP 1: Select a Progress Note — grouped by day with hover tooltips
  // ==================================================================
  if (step === 'selectReport') {
    const dayGroups = groupByDay(allReports);
    return (
      <div className="dp-nurse-select">
        {tooltipEl}
        <div className="dp-header">
          <button className="btn-icon" onClick={onBack}><ChevronLeft size={22} /></button>
          <div>
            <h2>{patient.name} <span className="bed-tag-sm">{patient.bed_number}</span></h2>
            <p className="dp-subtitle">
              <Stethoscope size={13} /> Select a progress note to append your doctor's note to
            </p>
          </div>
        </div>

        {allReports.length === 0 ? (
          <div className="dp-empty-state">
            <FileText size={36} />
            <h3>No progress notes found</h3>
            <p>There are no nurse progress notes for this patient yet. A nurse needs to create a report first.</p>
            <button className="btn-primary" onClick={onBack}>Go Back</button>
          </div>
        ) : (
          <>
            <p className="dp-report-prompt">Progress Notes — select one to append your note to:</p>
            {dayGroups.map((dg, dgi) => (
              <div key={dgi} className="dp-day-group">
                <div className="dp-day-label">
                  <Calendar size={14} />
                  <span>{dg.date}</span>
                  <span className="dp-day-count">{dg.entries.length} note{dg.entries.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="dp-day-reports">
                  {dg.entries.map((r, i) => (
                    <button key={r.id} className={`dp-report-card ${i === 0 ? 'dp-report-latest' : ''}`}
                      onClick={() => { setSelectedReport(r); setStep('writeNote'); }}>
                      <div className="dp-report-card-top">
                        <Clock size={12} />
                        <strong>{new Date(r.timestamp).toLocaleString()}</strong>
                        {i === 0 && <span className="timeline-latest-badge">Latest</span>}
                      </div>
                      <pre
                        className="dp-report-preview hover-reveal"
                        onMouseMove={(e) => handleTextHover(e, {
                          nurseName: r.created_by_name,
                          nurseRole: r.created_by_role,
                          timeFormatted: new Date(r.timestamp).toLocaleString(),
                        })}
                        onMouseLeave={handleTextLeave}
                      >{r.progress_note_text?.substring(0, 180)}...</pre>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  // ==================================================================
  // STEP 2: Write & Append — show all reports divided by day with tooltips
  // ==================================================================
  const dayGroups = groupByDay(allReports);
  return (
    <div className="doctor-panel">
      {tooltipEl}
      <div className="dp-header">
        <button className="btn-icon" onClick={() => setStep('selectReport')}><ChevronLeft size={22} /></button>
        <div>
          <h2>{patient.name} <span className="bed-tag-sm">{patient.bed_number}</span></h2>
          <p className="dp-subtitle">
            <Stethoscope size={13} /> Appending to progress note from{' '}
            <strong>{new Date(selectedReport?.timestamp).toLocaleString()}</strong>
          </p>
        </div>
      </div>

      {speechError && (
        <div className="speech-error" style={{ marginBottom: 12 }}>
          <AlertTriangle size={16} /><span>{speechError}</span>
          <button className="speech-error-close" onClick={() => setSpeechError(null)}>×</button>
        </div>
      )}

      {/* Input area */}
      <div className="dp-input-card">
        <div className="dp-input-header">
          <span>✏️ New Doctor's Note</span>
          <button className={`dp-mic-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>
            {isRecording ? <Square size={16} /> : <Mic size={16} />}
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="dp-textarea"
          value={transcript + (interimText ? ' ' + interimText : '')}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={isRecording ? '🎤 Listening...' : 'Dictate or type your clinical note here...'}
          rows={4}
        />
        <button className="btn-primary" onClick={handleSubmit} disabled={!transcript.trim() || loading}
          style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}>
          {loading ? <><Loader2 size={16} className="spin" /> Saving...</> : <><FileText size={16} /> Append Doctor's Note</>}
        </button>
      </div>

      {/* All patient reports — divided by day, nurse name on hover only */}
      <div className="dp-combined-view">
        <div className="dp-all-notes-header">All Progress Notes</div>
        {dayGroups.map((dg, dgi) => (
          <div key={dgi} className="dp-day-group">
            <div className="dp-day-label">
              <Calendar size={14} />
              <span>{dg.date}</span>
            </div>
            {dg.entries.map(r => {
              const isSelected = r.id === selectedReport?.id;
              return (
                <div key={r.id} className={`dp-nurse-section ${isSelected ? 'dp-nurse-selected' : ''}`}>
                  <div className="dp-section-label">
                    <Clock size={13} /> {new Date(r.timestamp).toLocaleString()}
                    {isSelected && <span className="timeline-latest-badge" style={{ marginLeft: 8 }}>Selected</span>}
                  </div>
                  <pre
                    className="dp-nurse-note-text hover-reveal"
                    onMouseMove={(e) => handleTextHover(e, {
                      nurseName: r.created_by_name,
                      nurseRole: r.created_by_role,
                      timeFormatted: new Date(r.timestamp).toLocaleString(),
                    })}
                    onMouseLeave={handleTextLeave}
                  >{r.progress_note_text}</pre>

                  {/* Doctor's notes appended to this report */}
                  <DoctorNotesAppended
                    patientId={patient.id}
                    parentReportId={r.id}
                    currentNurse={currentNurse}
                    onDeleted={() => fetchReports()}
                    hoverHandlers={{ onMouseMove: handleTextHover, onMouseLeave: handleTextLeave }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Helper component to show doctor's notes appended to a specific progress note */
function DoctorNotesAppended({ patientId, parentReportId, currentNurse, onDeleted, hoverHandlers }) {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/patients/${patientId}/doctor-notes`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const filtered = data.filter(n => n.parent_report_id === parentReportId);
        setNotes(filtered);
      })
      .catch(() => {});
  }, [patientId, parentReportId]);

  async function handleDelete(noteId) {
    if (!window.confirm('Delete this doctor\'s note?')) return;
    try {
      const res = await fetch(`${API_BASE}/reports/${noteId}`, { method: 'DELETE' });
      if (res.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
        if (onDeleted) onDeleted();
      }
    } catch { /* ignore */ }
  }

  if (notes.length === 0) return null;

  return (
    <div className="dp-doctor-inside">
      <div className="dp-doctor-divider">👨‍⚕️ Doctor's Notes</div>
      {notes.map(note => (
        <div key={note.id} className="dp-doctor-entry">
          <div className="dp-doctor-entry-meta">
            <Stethoscope size={12} />
            <Clock size={11} />
            <span className="dp-note-time">{new Date(note.timestamp).toLocaleString()}</span>
            <button className="dp-delete-btn" onClick={() => handleDelete(note.id)} title="Delete">
              <Trash2 size={12} />
            </button>
          </div>
          <pre
            className="dp-doctor-entry-text hover-reveal"
            onMouseMove={(e) => hoverHandlers?.onMouseMove?.(e, {
              nurseName: note.created_by_name,
              nurseRole: note.created_by_role,
              timeFormatted: new Date(note.timestamp).toLocaleString(),
            })}
            onMouseLeave={hoverHandlers?.onMouseLeave}
          >{note.progress_note_text}</pre>
        </div>
      ))}
    </div>
  );
}
