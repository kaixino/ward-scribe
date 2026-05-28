import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Play, ChevronLeft, Clock, FileText, Loader2, User, AlertTriangle, Headphones, Search } from 'lucide-react';
import './PassingOverPanel.css';

const API_BASE = '/api';

export default function PassingOverPanel({ patients, currentNurse, onBack }) {
  const [allPatients, setAllPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [passingOvers, setPassingOvers] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [targetShift, setTargetShift] = useState('Next');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [speechError, setSpeechError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const textareaRef = useRef(null);
  const sttRecognitionRef = useRef(null);
  const sttActiveRef = useRef(false);

  // Fetch ALL patients on mount so nurses can choose any patient
  useEffect(() => {
    fetchAllPatients();
  }, []);

  async function fetchAllPatients() {
    try {
      const res = await fetch(`${API_BASE}/patients`);
      if (res.ok) {
        const data = await res.json();
        setAllPatients(data);
        if (data.length > 0 && !selectedPatient) {
          setSelectedPatient(data[0]);
        }
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (selectedPatient) fetchPassingOvers();
    if (textareaRef.current) textareaRef.current.focus();
  }, [selectedPatient]);

  async function fetchPassingOvers() {
    if (!selectedPatient) return;
    try {
      const res = await fetch(`${API_BASE}/passing-over/${selectedPatient.id}`);
      if (res.ok) setPassingOvers(await res.json());
    } catch { /* ignore */ }
  }

  function generateSummaryFromTranscript(text, patient) {
    if (!text.trim()) return 'No notes recorded.';
    const lines = [];
    const t = text.toLowerCase();
    lines.push(`📋 SHIFT HANDOFF — ${patient?.name || 'Patient'} (${patient?.bed_number || ''})`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`⏰ **Shift Events from Transcript:**`);

    // Extract key info from transcript
    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim());
    sentences.forEach(s => {
      const trimmed = s.trim();
      if (!trimmed) return;
      // Detect clinical categories
      if (/fall|fell|collapse|trip/i.test(trimmed)) lines.push(`   ⚠️ ${trimmed}`);
      else if (/pain|ache|discomfort/i.test(trimmed)) lines.push(`   💊 ${trimmed}`);
      else if (/bp|hr|spo2|vital|temp|blood|oxygen/i.test(trimmed)) lines.push(`   📊 ${trimmed}`);
      else if (/medication|given|administer|paracetamol|antibiotic|tablet|dose/i.test(trimmed)) lines.push(`   💊 ${trimmed}`);
      else if (/wound|dressing|skin|ulcer|pressure/i.test(trimmed)) lines.push(`   🩹 ${trimmed}`);
      else if (/family|wife|husband|son|daughter/i.test(trimmed)) lines.push(`   👨‍👩‍👧 ${trimmed}`);
      else if (/doctor|dr\.|notif|call|page|review/i.test(trimmed)) lines.push(`   📞 ${trimmed}`);
      else lines.push(`   📝 ${trimmed}`);
    });

    if (sentences.length === 0) {
      lines.push(`   📝 Routine observations completed, patient stable.`);
    }

    lines.push(`📌 **Pending for Next Shift:**`);
    if (/fall|fell|collapse|unsteady/i.test(t)) lines.push(`   ⚠️ Monitor fall risk, bed alarm ON`);
    if (/pain|ache|discomfort/i.test(t)) lines.push(`   💊 Continue pain management`);
    if (/bp|hr|spo2|temp|vital|obs|oxygen/i.test(t)) lines.push(`   📊 Continue vital signs monitoring`);
    if (/medication|given|administer|antibiotic|prescribed/i.test(t)) lines.push(`   💊 Continue medication schedule`);
    if (/wound|dressing|skin|ulcer/i.test(t)) lines.push(`   🩹 Wound care as ordered`);
    if (/family|wife|husband|son|daughter|relatives/i.test(t)) lines.push(`   👨‍👩‍👧 Keep family updated`);
    if (/doctor|dr\.|notif|call|page|review/i.test(t)) lines.push(`   📞 Medical review pending`);
    lines.push(`   🔄 Continue current nursing care plan`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🤖 AI-generated summary from shift handoff transcript`);

    return lines.join('\n');
  }

  // Audio recording + Speech-to-Text (live transcription from mic)
  async function toggleRecording() {
    if (isRecording) {
      // STOP both recorder and STT
      sttActiveRef.current = false;
      if (sttRecognitionRef.current) {
        try { sttRecognitionRef.current.stop(); } catch {}
        sttRecognitionRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // START both recorder and STT
      setSpeechError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // 1. MediaRecorder for audio playback
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          setRecordedBlob(blob);
          setAudioUrl(URL.createObjectURL(blob));
          stream.getTracks().forEach(t => t.stop());
          // Generate summary from the transcribed speech
          if (transcript.trim()) {
            setSummary(generateSummaryFromTranscript(transcript, selectedPatient));
          }
        };

        recorder.onerror = () => {
          setSpeechError('Recording error.');
          setIsRecording(false);
        };

        mediaRecorderRef.current = recorder;
        recorder.start();

        // 2. SpeechRecognition for live transcription
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
          const stt = new SR();
          stt.continuous = true;
          stt.interimResults = true;
          stt.lang = 'en-US';

          stt.onresult = (event) => {
            let final = '';
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              if (res.isFinal) final += res[0].transcript + ' ';
              else interim += res[0].transcript;
            }
            if (final) {
              setTranscript(prev => {
                const updated = prev + final;
                // Live-update summary from spoken words
                if (updated.trim()) {
                  setSummary(generateSummaryFromTranscript(updated, selectedPatient));
                }
                return updated;
              });
            }
            setInterimText(interim);
          };

          stt.onerror = (e) => {
            if (e.error !== 'aborted' && e.error !== 'no-speech') {
              setSpeechError(`Speech error: ${e.error}. Type manually.`);
            }
          };

          stt.onend = () => {
            // Auto-restart with new instance if still recording
            if (sttActiveRef.current && SR) {
              try {
                const newStt = new SR();
                newStt.continuous = true;
                newStt.interimResults = true;
                newStt.lang = 'en-US';
                // Re-bind events
                newStt.onresult = stt.onresult;
                newStt.onerror = stt.onerror;
                newStt.onend = stt.onend;
                sttRecognitionRef.current = newStt;
                newStt.start();
              } catch {}
            }
          };

          sttRecognitionRef.current = stt;
          sttActiveRef.current = true;
          stt.start();
        }

        setIsRecording(true);
      } catch (err) {
        setSpeechError('Microphone access denied. Allow microphone permissions.');
      }
    }
  }

  async function handleSave() {
    if (!audioUrl && !transcript.trim()) return;
    setLoading(true);
    try {
      let audioBase64 = null;
      if (recordedBlob) {
        audioBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(recordedBlob);
        });
      }

      const finalSummary = summary || generateSummaryFromTranscript(transcript, selectedPatient);

      const res = await fetch(`${API_BASE}/passing-over`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          from_nurse_id: currentNurse.id,
          audio_data: audioBase64,
          transcript: transcript,
          summary: finalSummary,
          target_shift: targetShift,
        }),
      });

      if (res.ok) {
        setTranscript('');
        setSummary('');
        setRecordedBlob(null);
        setAudioUrl(null);
        await fetchPassingOvers();
      }
    } catch (err) {
      setSpeechError('Failed to save handoff.');
    } finally {
      setLoading(false);
    }
  }

  async function playAudio(entryId) {
    if (playingId === entryId) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setPlayingId(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/passing-over/${entryId}/audio`);
      if (!res.ok) { setSpeechError('No audio available for this entry.'); return; }
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setSpeechError('Audio playback failed.'); setPlayingId(null); };
      audioRef.current = audio;
      await audio.play();
      setPlayingId(entryId);
    } catch {
      setSpeechError('Failed to load audio.');
    }
  }

  return (
    <div className="po-panel">
      <div className="po-header">
        <button className="btn-icon" onClick={onBack}><ChevronLeft size={22} /></button>
        <div>
          <h2>🔄 Shift Handoff</h2>
          <p className="po-subtitle">Record information to pass to the next nurse</p>
        </div>
      </div>

      {speechError && (
        <div className="speech-error" style={{ marginBottom: 12 }}>
          <AlertTriangle size={16} /><span>{speechError}</span>
          <button className="speech-error-close" onClick={() => setSpeechError(null)}>×</button>
        </div>
      )}

      {/* Patient selector */}
      <div className="po-patient-select">
        <label>Select patient you're handing over:</label>
        <select value={selectedPatient?.id || ''} onChange={(e) => {
          const p = allPatients.find(p => p.id === e.target.value);
          setSelectedPatient(p);
          setTranscript('');
          setSummary('');
          setRecordedBlob(null);
          setAudioUrl(null);
        }}>
          {allPatients.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.bed_number})</option>
          ))}
        </select>
      </div>

      {/* Record new handoff */}
      {selectedPatient && (
        <div className="po-record-card">
          <div className="po-record-top">
            <span className="po-record-label">
              Handoff for <strong>{selectedPatient.name}</strong> ({selectedPatient.bed_number})
            </span>
            <select className="po-shift-select" value={targetShift} onChange={(e) => setTargetShift(e.target.value)}>
            <option value="Next">Next Shift</option>
            <option value="Night">Night Shift</option>
            <option value="Day">Day Shift</option>
            <option value="Weekend">Weekend Shift</option>
          </select>
        </div>

        <div className="po-event-hints">
          <strong>What happened during your shift?</strong>
          <div className="po-hint-chips">
            <span>🩸 Vitals</span><span>💊 Medications</span><span>⚠️ Incidents</span>
            <span>🩹 Wound Care</span><span>🫁 Respiratory</span><span>🧠 Neuro</span>
            <span>🛏️ Mobility</span><span>📞 Dr Notified</span><span>👨‍👩‍👧 Family</span>
          </div>
        </div>

        <div className="po-mic-area">
          <button className={`po-mic-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>
            {isRecording ? <Square size={28} /> : <Mic size={28} />}
          </button>
          <span className="po-mic-label">
            {isRecording ? '🟡 Recording... describe shift events clearly' : '🎤 Tap to record shift events'}
          </span>
        </div>

        {audioUrl && (
          <div className="po-playback">
            <audio src={audioUrl} controls className="po-audio-player" />
            <span className="po-audio-check">✅ Recorded {Math.round(recordedBlob?.size / 1024)}KB</span>
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="po-textarea"
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            if (e.target.value.trim()) {
              setSummary(generateSummaryFromTranscript(e.target.value, selectedPatient));
            } else {
              setSummary('');
            }
          }}
          placeholder="Type what happened during your shift here..."
          rows={3}
        />

        <div className="po-summary-area">
          <label>🤖 AI-Generated Summary from Your Notes</label>
          <pre className="po-summary-text">{summary || 'Type your shift notes above to generate the summary...'}</pre>
        </div>

        <button className="btn-primary" onClick={handleSave} disabled={(!audioUrl && !transcript.trim()) || loading}
          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
          {loading ? <><Loader2 size={16} className="spin" /> Saving...</> : <><FileText size={16} /> Save Handoff for {selectedPatient.name}</>}
        </button>
      </div>
      )}

      {/* Previous handoffs for selected patient */}
      <div className="po-history">
        <h3>Previous Handoffs — {selectedPatient?.name}</h3>
        {passingOvers.length === 0 && <p className="po-empty">No handoffs recorded yet for this patient.</p>}
        {passingOvers.map(entry => (
          <div key={entry.id} className="po-entry">
            <div className="po-entry-meta">
              <User size={13} /> <strong>{entry.nurse_name}</strong>
              <span className="po-entry-shift">{entry.target_shift}</span>
              <span className="dp-note-sep">·</span>
              <Clock size={12} /> {new Date(entry.created_at).toLocaleString()}
              {entry.audio_size > 0 && (
                <button className={`po-play-btn ${playingId === entry.id ? 'playing' : ''}`}
                  onClick={() => playAudio(entry.id)}>
                  {playingId === entry.id ? '🔴 Stop' : <><Play size={12} /> Play Audio</>}
                </button>
              )}
            </div>
            {entry.transcript && <pre className="po-entry-transcript">{entry.transcript}</pre>}
            {entry.summary && <div className="po-entry-summary"><Headphones size={13} /> {entry.summary}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
