import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import RecordingPanel from './components/RecordingPanel';
import ReportCard from './components/ReportCard';
import CombinedReport from './components/CombinedReport';
import LoginPage from './components/LoginPage';
import WardSelector from './components/WardSelector';
import DoctorPanel from './components/DoctorPanel';
import PassingOverPanel from './components/PassingOverPanel';
import { ClipboardList, Mic, FileText, ChevronLeft, User, Layers, Stethoscope, ArrowLeftRight } from 'lucide-react';
import './App.css';

const API_BASE = '/api';

export default function App() {
  const [view, setView] = useState('login'); // login | wardSelect | dashboard | recording | review | combined | doctor | passing
  const [patients, setPatients] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedWard, setSelectedWard] = useState(null);
  const [currentNurse, setCurrentNurse] = useState(null);
  const [report, setReport] = useState(null);
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWards();
  }, []);

  async function fetchWards() {
    try {
      const res = await fetch(`${API_BASE}/wards`);
      const data = await res.json();
      setWards(data);
    } catch (err) {
      console.error('Failed to fetch wards:', err);
    }
  }

  async function fetchPatients(wardId) {
    try {
      const res = await fetch(`${API_BASE}/patients?ward=${wardId}`);
      const data = await res.json();
      setPatients(data);
    } catch (err) {
      console.error('Failed to fetch patients:', err);
    }
  }

  const isDoctor = currentNurse && /dr\.|doctor|MO|consultant|medical officer/i.test(currentNurse.role || '');

  function handleLogin(nurse) {
    setCurrentNurse(nurse);
    setView('wardSelect');
  }

  function handleLogout() {
    setCurrentNurse(null);
    setSelectedWard(null);
    setPatients([]);
    setReport(null);
    setView('login');
  }

  async function handleWardSelect(ward) {
    setSelectedWard(ward);
    setView('dashboard');
    await fetchPatients(ward.id);
  }

  async function handlePatientSelect(patient) {
    setSelectedPatient(patient);
    if (isDoctor) {
      setView('doctor');
      return;
    }
    setView('recording');
    setReport(null);
    setAllReports([]);
    // Fetch all reports for timeline view
    try {
      const res = await fetch(`${API_BASE}/patients/${patient.id}/all-reports`);
      if (res.ok) {
        const data = await res.json();
        setAllReports(data);
        if (data.length > 0) setReport(data[0]); // latest for recording panel
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    }
  }

  async function handleTranscribe(transcript) {
    if (!selectedPatient || !currentNurse) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          nurse_id: currentNurse.id,
          transcript,
          report_type: isDoctor ? 'doctor' : 'nurse',
        }),
      });
      const data = await res.json();
      setReport(data);
      if (isDoctor) {
        setView('doctor');
      } else {
        setView('review');
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteReport(reportId) {
    try {
      const res = await fetch(`${API_BASE}/reports/${reportId}`, { method: 'DELETE' });
      if (res.ok) {
        // Remove from local state
        setAllReports(prev => prev.filter(r => r.id !== reportId));
        if (report?.id === reportId) setReport(allReports.find(r => r.id !== reportId) || null);
      }
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  }

  async function handleSaveEdit(handoverText, progressNoteText) {
    if (!report || !currentNurse) return;
    try {
      const res = await fetch(`${API_BASE}/reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handover_text: handoverText,
          progress_note_text: progressNoteText,
          edited_by_nurse_id: currentNurse.id,
        }),
      });
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error('Failed to update report:', err);
    }
  }

  function handleBack() {
    if (view === 'combined' || view === 'doctor' || view === 'passing') {
      setView('dashboard');
      setSelectedPatient(null);
      setReport(null);
    } else if (view === 'recording' || view === 'review') {
      setView('dashboard');
      setSelectedPatient(null);
      setReport(null);
    } else if (view === 'dashboard') {
      setView('wardSelect');
      setSelectedWard(null);
      setPatients([]);
    }
  }

  function getWardName() {
    if (selectedWard) return selectedWard.name;
    if (report && selectedPatient) return selectedPatient.ward_name || 'Ward';
    return 'CareNotes';
  }

  const showHeader = view !== 'login';

  return (
    <div className="app">
      {showHeader && (
        <header className="app-header">
          <div className="header-left">
            {view !== 'wardSelect' && (
              <button className="btn-icon" onClick={handleBack} title="Back">
                <ChevronLeft size={22} />
              </button>
            )}
            <div className="app-logo" onClick={() => setView('wardSelect')} style={{ cursor: 'pointer' }}>
              <ClipboardList size={24} className="logo-icon" />
              <h1 className="app-title">CareNotes</h1>
            </div>
          </div>
          <div className="header-center">
            <span className="badge-ward">{getWardName()}</span>
          </div>
          <div className="header-right">
            {currentNurse && (
              <div className="nurse-badge" onClick={handleLogout} style={{ cursor: 'pointer' }} title="Switch nurse">
                <span className="nurse-avatar">{currentNurse.name.charAt(0)}</span>
                <div className="nurse-info">
                  <span className="nurse-name">{currentNurse.name}</span>
                  <span className="nurse-role">{currentNurse.role} · {currentNurse.shift} Shift</span>
                </div>
              </div>
            )}
          </div>
        </header>
      )}

      <main className={`app-main ${view === 'login' ? 'app-main--full' : ''}`}>
        {view === 'login' && (
          <LoginPage onLogin={handleLogin} />
        )}

        {view === 'wardSelect' && (
          <WardSelector
            wards={wards}
            currentNurse={currentNurse}
            onSelectWard={handleWardSelect}
            onLogout={handleLogout}
          />
        )}

        {view === 'dashboard' && (
          <Dashboard
            patients={patients}
            ward={selectedWard}
            currentNurse={currentNurse}
            onSelectPatient={handlePatientSelect}
            onViewPassing={(patient) => {
              setSelectedPatient(patient);
              setView('passing');
            }}
          />
        )}

        {view === 'doctor' && selectedPatient && (
          <DoctorPanel
            patient={selectedPatient}
            selectedWard={selectedWard}
            currentNurse={currentNurse}
            onBack={handleBack}
          />
        )}

        {view === 'passing' && (
          <PassingOverPanel
            patients={patients}
            currentNurse={currentNurse}
            onBack={handleBack}
          />
        )}

        {view === 'recording' && selectedPatient && (
          <RecordingPanel
            patient={selectedPatient}
            existingReport={report}
            onTranscribe={handleTranscribe}
            loading={loading}
            onViewReport={() => setView('review')}
            onViewCombined={() => setView('combined')}
          />
        )}

        {view === 'combined' && selectedPatient && (
          <CombinedReport
            patient={selectedPatient}
            currentNurse={currentNurse}
            onBack={handleBack}
            onNewEntry={() => {
              setReport(null);
              setView('recording');
            }}
          />
        )}

        {view === 'review' && allReports.length > 0 && (
          <div className="review-container">
            <div className="review-header">
              <h2>
                {selectedPatient?.name} — <span className="bed-tag">{selectedPatient?.bed_number}</span>
              </h2>
              <div className="review-nurse-bar">
                <span className="review-meta">
                  <strong>{allReports.length}</strong> report{allReports.length !== 1 ? 's' : ''} recorded
                </span>
              </div>
              <button className="btn-outline combined-btn" onClick={() => setView('combined')}>
                <Layers size={16} /> View Combined Report
              </button>
            </div>

            <div className="report-timeline">
              {allReports.map((rpt, idx) => {
                const isLatest = idx === 0;
                const isYours = rpt.created_by_name === currentNurse?.name;
                return (
                  <div key={rpt.id} className={`timeline-box ${isYours ? 'timeline-yours' : ''} ${isLatest ? 'timeline-latest' : ''}`}>
                    <div className="timeline-marker">
                      <span className="timeline-dot" />
                      {idx < allReports.length - 1 && <span className="timeline-line" />}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <div className="timeline-author">
                          <User size={14} />
                          <strong>{rpt.created_by_name}</strong>
                          <span className="timeline-role">{rpt.created_by_role}</span>
                          {isYours && <span className="review-nurse-badge">You</span>}
                          {isLatest && <span className="timeline-latest-badge">Latest</span>}
                        </div>
                        <span className="timeline-time">{new Date(rpt.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="timeline-cards">
                        <ReportCard
                          title="🔄 Handover — Shift Handoff"
                          icon={<Mic size={16} />}
                          content={rpt.handover_text}
                          variant="handover"
                          reportId={rpt.id}
                          recordedByName={rpt.created_by_name}
                          onSave={(text) => handleSaveEdit(text, rpt.progress_note_text)}
                          onDelete={() => handleDeleteReport(rpt.id)}
                        />
                        <ReportCard
                          title="📋 Progress Note — Patient Record"
                          icon={<FileText size={16} />}
                          content={rpt.progress_note_text}
                          variant="progress"
                          reportId={rpt.id}
                          recordedByName={rpt.created_by_name}
                          onSave={(text) => handleSaveEdit(rpt.handover_text, text)}
                          onDelete={() => handleDeleteReport(rpt.id)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
