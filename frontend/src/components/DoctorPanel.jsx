import React, { useState, useEffect, useRef } from 'react';
import { FileText, Mic, Square, Loader2, ChevronLeft, Clock, User, AlertTriangle, Stethoscope, Trash2 } from 'lucide-react';
import './DoctorPanel.css';

const API_BASE = '/api';

export default function DoctorPanel({ patient, selectedWard, currentNurse, onBack }) {
  const [wardNurses, setWardNurses] = useState([]);
  const [selectedNurse, setSelectedNurse] = useState(null);
  const [nurseReport, setNurseReport] = useState(null);
  const [doctorNotes, setDoctorNotes] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [speechError, setSpeechError] = useState(null);
  const [step, setStep] = useState('selectNurse'); // selectNurse | selectReport | writeNote
  const [nurseReports, setNurseReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const textareaRef = useRef(null);

  // Load nurses for this ward on mount
  useEffect(() => {
    fetch(`${API_BASE}/nurses`)
      .then(r => r.json())
      .then(data => setWardNurses(data))
      .catch(() => {});
  }, []);

  function handleNurseSelect(nurse) {
    setSelectedNurse(nurse);
    // Fetch ALL reports by this nurse for this patient
    fetch(`${API_BASE}/patients/${patient.id}/all-reports`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const byNurse = data.filter(r => r.created_by_nurse_id === nurse.id);
        setNurseReports(byNurse);
        setNurseReport(byNurse.length > 0 ? byNurse[0] : null);
        setSelectedReport(byNurse.length > 0 ? byNurse[0] : null);
        setStep(byNurse.length > 1 ? 'selectReport' : 'writeNote');
      })
      .catch(() => { setStep('writeNote'); });
    // Fetch existing doctor notes
    fetch(`${API_BASE}/patients/${patient.id}/doctor-notes`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setDoctorNotes(data))
      .catch(() => {});
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
      if (!r) { setSpeechError('Not available.'); return; }
      recognitionRef.current = r;
      try { r.start(); isRecordingRef.current = true; setIsRecording(true); }
      catch { setSpeechError('Could not start mic.'); }
    }
  }

  async function handleSubmit() {
    if (!transcript.trim() || !selectedNurse) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          nurse_id: selectedNurse.id,
          doctor_name: currentNurse.name,
          parent_report_id: selectedReport?.id || null,
          transcript,
          report_type: 'doctor',
        }),
      });
      if (res.ok) {
        setTranscript('');
        // Refresh doctor notes
        const notesRes = await fetch(`${API_BASE}/patients/${patient.id}/doctor-notes`);
        if (notesRes.ok) setDoctorNotes(await notesRes.json());
      }
    } catch (err) {
      setSpeechError('Failed to save.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteDoctorNote(noteId) {
    if (!window.confirm('Delete this doctor\'s note?')) return;
    try {
      const res = await fetch(`${API_BASE}/reports/${noteId}`, { method: 'DELETE' });
      if (res.ok) {
        setDoctorNotes(prev => prev.filter(n => n.id !== noteId));
      }
    } catch { /* ignore */ }
  }

  // ---- STEP 1: Select Nurse ----
  if (step === 'selectNurse') {
    return (
      <div className="dp-nurse-select">
        <div className="dp-header">
          <button className="btn-icon" onClick={onBack}><ChevronLeft size={22} /></button>
          <div>
            <h2>{patient.name} <span className="bed-tag-sm">{patient.bed_number}</span></h2>
            <p className="dp-subtitle">Select the nurse on shift for this patient</p>
          </div>
        </div>
        <div className="dp-nurse-grid">
          {wardNurses.map(n => (
            <button key={n.id} className="dp-nurse-card" onClick={() => handleNurseSelect(n)}>
              <div className="dp-nurse-avatar">{n.name.charAt(0)}</div>
              <strong>{n.name}</strong>
              <span className="dp-nurse-role-tag">{n.role}</span>
            </button>
          ))}
        </div>
        {wardNurses.length === 0 && <p className="dp-empty-text">No nurses assigned to this ward.</p>}
      </div>
    );
  }

  // ---- STEP 2: Select specific report ----
  if (step === 'selectReport') {
    return (
      <div className="dp-nurse-select">
        <div className="dp-header">
          <button className="btn-icon" onClick={() => setStep('selectNurse')}><ChevronLeft size={22} /></button>
          <div>
            <h2>{patient.name} <span className="bed-tag-sm">{patient.bed_number}</span></h2>
            <p className="dp-subtitle">
              <Stethoscope size={13} /> {selectedNurse?.name} has {nurseReports.length} report{nurseReports.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <p className="dp-report-prompt">Which progress note do you want to add your doctor's note to?</p>
        <div className="dp-report-list">
          {nurseReports.map((r, i) => (
            <button key={r.id} className={`dp-report-card ${i === 0 ? 'dp-report-latest' : ''}`}
              onClick={() => { setSelectedReport(r); setNurseReport(r); setStep('writeNote'); }}>
              <div className="dp-report-card-top">
                <strong>{new Date(r.timestamp).toLocaleString()}</strong>
                {i === 0 && <span className="timeline-latest-badge">Latest</span>}
              </div>
              <pre className="dp-report-preview">{r.handover_text?.substring(0, 120)}...</pre>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- STEP 3: Write Note ----
  return (
    <div className="doctor-panel">
      <div className="dp-header">
        <button className="btn-icon" onClick={() => setStep(nurseReports.length > 1 ? 'selectReport' : 'selectNurse')}><ChevronLeft size={22} /></button>
        <div>
          <h2>{patient.name} <span className="bed-tag-sm">{patient.bed_number}</span></h2>
          <p className="dp-subtitle">
            <Stethoscope size={13} /> Adding note to <strong>{selectedNurse?.name}'s</strong> chart
            {selectedReport && <span className="dp-report-ref"> — {new Date(selectedReport.timestamp).toLocaleString()}</span>}
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
          <span>✏️ New Doctor's Note for {selectedNurse?.name}</span>
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
          {loading ? <><Loader2 size={16} className="spin" /> Saving...</> : <><FileText size={16} /> Attach Note to {selectedNurse?.name}'s Chart</>}
        </button>
      </div>

      {/* Nurse's progress note box — with doctor's notes INSIDE */}
      <div className="dp-combined-view">
        {nurseReport && (
          <div className="dp-nurse-section">
            <div className="dp-section-label">
              <User size={14} /> <strong>{nurseReport.created_by_name}</strong> — Progress Note
              <span className="dp-note-time">{new Date(nurseReport.timestamp).toLocaleString()}</span>
            </div>
            <pre className="dp-nurse-note-text">{nurseReport.progress_note_text}</pre>

            {/* Doctor's notes inside same box */}
            {doctorNotes.filter(n => n.created_by_nurse_id === selectedNurse?.id).length > 0 && (
              <div className="dp-doctor-inside">
                <div className="dp-doctor-divider">👨‍⚕️ Doctor's Note</div>
                {doctorNotes.filter(n => n.created_by_nurse_id === selectedNurse?.id).map(note => (
                  <div key={note.id} className="dp-doctor-entry">
                    <div className="dp-doctor-entry-meta">
                      <Stethoscope size={12} />
                      <strong>{note.created_by_name}</strong>
                      <span className="dp-note-time">{new Date(note.timestamp).toLocaleString()}</span>
                      <button className="dp-delete-btn" onClick={() => handleDeleteDoctorNote(note.id)} title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <pre className="dp-doctor-entry-text">{note.progress_note_text}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reference: All doctor's notes for other nurses */}
        {doctorNotes.filter(n => n.created_by_nurse_id !== selectedNurse?.id).length > 0 && (
          <div className="dp-all-notes">
            <h4>Doctor's Notes for Other Nurses</h4>
            {doctorNotes.filter(n => n.created_by_nurse_id !== selectedNurse?.id).map(note => {
              const linkedNurse = wardNurses.find(n => n.id === note.created_by_nurse_id);
              return (
                <div key={note.id} className="dp-doctor-ref-card">
                  <div className="dp-note-meta">
                    <Stethoscope size={12} />
                    <strong>{note.created_by_name}</strong>
                    {linkedNurse && <span className="dp-nurse-ref">→ on {linkedNurse.name}'s chart</span>}
                    <span className="dp-note-sep">·</span>
                    <Clock size={11} /> {new Date(note.timestamp).toLocaleString()}
                    <button className="dp-delete-btn" onClick={() => handleDeleteDoctorNote(note.id)} title="Delete">
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <pre className="dp-note-text">{note.progress_note_text}</pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
