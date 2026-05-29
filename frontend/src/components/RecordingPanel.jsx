import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Loader2, FileText, Volume2, AlertTriangle, Layers, Play, Clock } from 'lucide-react';
import './RecordingPanel.css';

export default function RecordingPanel({
  patient,
  existingReport,
  onTranscribe,
  loading,
  onViewReport,
  onViewCombined,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [waveformActive, setWaveformActive] = useState(false);
  const [speechError, setSpeechError] = useState(null);
  const [supported, setSupported] = useState(true);
  const [browserOk, setBrowserOk] = useState(null); // null=checking, true, false
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);

  const barCount = 30;

  // Detect browser support on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setBrowserOk(true);
      setSupported(true);
    } else {
      setBrowserOk(false);
      setSupported(false);
      setSpeechError(
        'Your browser does not support speech recognition. Use Chrome or Edge, or type the report manually below.'
      );
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current && !isRecording) {
      textareaRef.current.focus();
    }
  }, [isRecording]);

  // Create a fresh SpeechRecognition instance and wire all handlers
  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
      }
      setInterimText(interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      if (event.error === 'not-allowed') {
        setSpeechError('Microphone access blocked. Click the lock icon in your browser URL bar and allow microphone access, then try again.');
      } else if (event.error === 'aborted') {
        // User stopped — expected
      } else if (event.error === 'no-speech') {
        // Silent — keep going, will auto-restart via onend
      } else {
        setSpeechError(`Speech error: ${event.error}. Try typing instead.`);
      }
    };

    recognition.onend = () => {
      // Critical fix: must create a BRAND NEW instance for re-start
      if (isRecordingRef.current) {
        const newRec = createRecognition();
        if (newRec) {
          recognitionRef.current = newRec;
          try {
            newRec.start();
          } catch (e) {
            setSpeechError('Failed to restart recording. Try again.');
            isRecordingRef.current = false;
            setIsRecording(false);
            setWaveformActive(false);
          }
        }
      } else {
        recognitionRef.current = null;
      }
    };

    return recognition;
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch { /* already stopped */ }
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setWaveformActive(false);
    setInterimText('');
  }, []);

  const startRecording = useCallback(() => {
    setSpeechError(null);
    const recognition = createRecognition();
    if (!recognition) {
      setSpeechError('Speech recognition not available in this browser.');
      return;
    }

    recognitionRef.current = recognition;

    try {
      recognition.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      setWaveformActive(true);
    } catch (err) {
      setSpeechError('Could not access microphone. Check browser permissions and try again.');
    }
  }, [createRecognition]);

  // Demo mode — fills in a realistic transcript for testing
  function loadDemoTranscript() {
    const time = getCurrentTime();
    setTranscript(
      `[${time}] Bed 3 Mrs Tan Mei Ling had a fall in the bathroom at approximately 2pm this afternoon. No injury sustained but she appears unsteady on her feet.\n[${time}] Vital signs: BP 130/80, HR 78, SpO2 97% on room air. She denies any pain.\n[${time}] Bed alarm has been applied. Doctor Smith was notified at 2:15pm. Family has been informed.\n[${time}] Plan is to assist with all bathroom visits for the next 24 hours.`
    );
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  /** Get current time string for timestamping */
  function getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  /** Prepend timestamp to transcript lines */
  function timestampTranscript(raw) {
    const time = getCurrentTime();
    const lines = raw.split('\n').filter(l => l.trim());
    return lines.map(l => `[${time}] ${l.trim()}`).join('\n');
  }

  function handleSubmit() {
    if (!transcript.trim()) return;
    // Add timestamp to transcript before submitting
    const timestamped = timestampTranscript(transcript);
    onTranscribe(timestamped);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const isActive = waveformActive || loading;
  const micDisabled = loading || browserOk === false;

  return (
    <div className="recording-panel">
      <div className="recording-top">
        <div className="patient-context">
          <h2>
            {patient.name}
            <span className="bed-tag-sm">{patient.bed_number}</span>
          </h2>
          {existingReport && (
            <button className="btn-outline" onClick={onViewReport}>
              <FileText size={15} />
              View existing report
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {speechError && (
        <div className="speech-error">
          <AlertTriangle size={16} />
          <span>{speechError}</span>
          <button className="speech-error-close" onClick={() => setSpeechError(null)}>×</button>
        </div>
      )}

      {/* Browser Detection Banner */}
      {browserOk === false && (
        <div className="speech-error" style={{ borderLeft: '3px solid var(--color-accent-amber)', background: '#faf3e0' }}>
          <AlertTriangle size={16} style={{ color: '#8b7a3e' }} />
          <span style={{ color: '#5a4e2a' }}>
            Speech-to-text requires <strong>Chrome</strong> or <strong>Edge</strong>. Type below or use the <strong>Demo button</strong> to test.
          </span>
        </div>
      )}

      {/* Waveform Visualization */}
      <div className={`waveform-container ${isActive ? 'active' : ''}`}>
        <div className="waveform-visual">
          {Array.from({ length: barCount }).map((_, i) => (
            <div
              key={i}
              className={`waveform-bar ${isActive ? 'animate' : ''}`}
              style={{
                animationDelay: `${i * 0.08}s`,
                height: isActive ? `${20 + Math.sin(i * 0.5) * 30 + Math.random() * 20}px` : '4px',
              }}
            />
          ))}
        </div>
        <div className="waveform-label">
          {isRecording ? (
            <span className="recording-indicator">
              <span className="rec-dot" /> Listening... speak clearly into your microphone
            </span>
          ) : loading ? (
            <span className="processing-indicator">
              <Loader2 size={16} className="spin" /> AI is analyzing transcript & extracting clinical points...
            </span>
          ) : (
            <span className="idle-indicator">
              <Volume2 size={16} />
              {supported
                ? 'Tap the mic to start dictation, or type below'
                : 'Type your report below, or use the Demo button'}
            </span>
          )}
        </div>
      </div>

      {/* Controls — Mic + Demo button side by side */}
      <div className="recording-controls">
        <button
          className={`btn-record ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
          disabled={micDisabled}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <Square size={22} /> : <Mic size={22} />}
        </button>
        {!isRecording && !loading && (
          <button className="btn-demo" onClick={loadDemoTranscript} title="Load a sample report to test">
            <Play size={16} />
            Demo
          </button>
        )}
      </div>

      {/* Transcript Area */}
      <div className="transcript-area">
        <label className="transcript-label">
          <Clock size={13} />
          {isRecording ? `🎤 Recording at ${getCurrentTime()}` : `📝 Dictation at ${getCurrentTime()}`}
        </label>
        <textarea
          ref={textareaRef}
          className="transcript-input"
          value={transcript + (interimText ? ' ' + interimText : '')}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={isRecording ? 'Listening...' : "Type the nurse's verbal report here, or use the microphone above..."}
          rows={6}
          onKeyDown={handleKeyDown}
        />
        <div className="transcript-actions">
          <span className="char-count">{transcript.length} characters</span>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!transcript.trim() || loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                AI Synthesizing...
              </>
            ) : (
              <>
                <FileText size={16} />
                Generate Reports
              </>
            )}
          </button>
        </div>
        <p className="shortcut-hint">
          <kbd>Shift</kbd> + <kbd>Enter</kbd> to submit
        </p>
      </div>

      {onViewCombined && (
        <div className="combined-shortcut">
          <button className="btn-outline" onClick={onViewCombined}>
            <Layers size={15} />
            View Combined Report (all nurses)
          </button>
        </div>
      )}
    </div>
  );
}
