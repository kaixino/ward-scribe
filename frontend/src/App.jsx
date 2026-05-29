import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import RecordingPanel from './components/RecordingPanel';
import ReportCard from './components/ReportCard';
import CombinedReport from './components/CombinedReport';
import LoginPage from './components/LoginPage';
import WardSelector from './components/WardSelector';
import RoomSelector from './components/RoomSelector';
import DoctorPanel from './components/DoctorPanel';
import PassingOverPanel from './components/PassingOverPanel';
import ShiftReportsView from './components/ShiftReportsView';
import { ClipboardList, Mic, FileText, ChevronLeft, User, Layers, Stethoscope, ArrowLeftRight, DoorOpen, Building2, Search } from 'lucide-react';
import './App.css';

const API_BASE = '/api';

export default function App() {
  const [view, setView] = useState('login'); // login | wardSelect | roomSelect | dashboard | recording | review | combined | doctor | doctorSelect | passing | shiftReports
  const [patients, setPatients] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedWard, setSelectedWard] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [currentNurse, setCurrentNurse] = useState(null);
  const [report, setReport] = useState(null);
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPatients = patients.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.bed_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  async function fetchPatientsByRoom(roomId) {
    try {
      const res = await fetch(`${API_BASE}/patients?room=${roomId}`);
      const data = await res.json();
      setPatients(data);
    } catch (err) {
      console.error('Failed to fetch patients:', err);
    }
  }

  async function fetchPatientReports(patientId) {
    try {
      const res = await fetch(`${API_BASE}/patients/${patientId}/all-reports`);
      if (res.ok) {
        const data = await res.json();
        setAllReports(data);
        if (data.length > 0) setReport(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    }
  }

  const isDoctor = currentNurse && /dr\.|doctor|MO|consultant|medical officer/i.test(currentNurse.role || '');

  function handleLogin(nurse) {
    setCurrentNurse(nurse);
    const isDoctor = /dr\.|doctor|MO|consultant|medical officer/i.test(nurse.role || '');
    if (isDoctor) {
      handleDoctorView();
    } else {
      setView('wardSelect');
    }
  }

  function handleLogout() {
    setCurrentNurse(null);
    setSelectedWard(null);
    setSelectedRoom(null);
    setPatients([]);
    setReport(null);
    setView('login');
  }

  function handleWardSelect(ward) {
    setSelectedWard(ward);
    setSelectedRoom(null);
    setPatients([]);
    setView('roomSelect');
  }

  async function handleRoomSelect(room) {
    setSelectedRoom(room);
    setView('dashboard');
    await fetchPatientsByRoom(room.id);
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
    await fetchPatientReports(patient.id);
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
      // Real-time state update: re-fetch all reports immediately
      await fetchPatientReports(selectedPatient.id);
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
      // Refresh all reports to maintain sync
      await fetchPatientReports(selectedPatient.id);
    } catch (err) {
      console.error('Failed to update report:', err);
    }
  }

  function handleViewReports() {
    setSelectedPatient(null);
    setView('shiftReports');
  }

  function handleViewPassingFromWard() {
    fetch(`${API_BASE}/patients`)
      .then(r => r.json())
      .then(data => setPatients(data))
      .catch(() => {});
    setView('passing');
  }

  function handleDoctorSelectPatient(patient) {
    setSelectedPatient(patient);
    setReport(null);
    setAllReports([]);
    setView('doctor');
  }

  function handleDoctorView() {
    fetch(`${API_BASE}/patients`)
      .then(r => r.json())
      .then(data => setPatients(data))
      .catch(() => {});
    setView('doctorSelect');
  }

  function handleBack() {
    if (view === 'shiftReports' || view === 'doctorSelect') {
      setView('wardSelect');
    } else if (view === 'combined') {
      setView('dashboard');
      setSelectedPatient(null);
      setReport(null);
    } else if (view === 'doctor') {
      // Go back to patient selection if from doctorSelect, else back to dashboard
      setView('doctorSelect');
      setSelectedPatient(null);
      setReport(null);
    } else if (view === 'passing') {
      setView('wardSelect');
      setSelectedPatient(null);
      setReport(null);
    } else if (view === 'recording' || view === 'review') {
      setView('dashboard');
      setSelectedPatient(null);
      setReport(null);
    } else if (view === 'dashboard') {
      setView('roomSelect');
      setSelectedRoom(null);
      setPatients([]);
    } else if (view === 'roomSelect') {
      setView('wardSelect');
      setSelectedWard(null);
      setSelectedRoom(null);
    }
  }

  function getLocationName() {
    if (selectedRoom) return selectedRoom.name;
    if (selectedWard) return selectedWard.name;
    if (report && selectedPatient) return selectedPatient.ward_name || 'Ward';
    return 'WardScribe';
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
              <h1 className="app-title">WardScribe</h1>
            </div>
          </div>
          <div className="header-center">
            <span className="badge-ward">
              {selectedWard && <Building2 size={14} style={{ marginRight: 4 }} />}
              {getLocationName()}
              {selectedRoom && <> <span style={{ opacity: 0.5 }}>·</span> <DoorOpen size={12} style={{ margin: '0 2px' }} />{selectedRoom.name}</>}
            </span>
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
            onViewReports={handleViewReports}
            onViewPassing={handleViewPassingFromWard}
            onViewDoctor={handleDoctorView}
          />
        )}

        {view === 'roomSelect' && selectedWard && (
          <RoomSelector
            ward={selectedWard}
            onSelectRoom={handleRoomSelect}
            onBack={handleBack}
          />
        )}

        {view === 'dashboard' && (
          <Dashboard
            patients={patients}
            ward={selectedWard}
            room={selectedRoom}
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
            onReportsUpdated={() => fetchPatientReports(selectedPatient.id)}
          />
        )}

        {view === 'shiftReports' && (
          <ShiftReportsView
            currentNurse={currentNurse}
            onBack={handleBack}
          />
        )}

        {view === 'doctorSelect' && (
          <div className="sr-view">
            <div className="sr-header">
              <button className="btn-icon" onClick={handleBack}><ChevronLeft size={22} /></button>
              <div>
                <h2><Stethoscope size={20} /> Doctor's Log</h2>
                <p className="sr-subtitle">Select a patient to view and append to their progress notes</p>
              </div>
            </div>
            <div className="sr-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search patient name or bed..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="sr-patient-grid">
              {filteredPatients.length > 0 ? filteredPatients.map(p => (
                <button key={p.id} className="sr-patient-card" onClick={() => handleDoctorSelectPatient(p)}>
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
              )) : <div className="sr-empty">No patients found</div>}
            </div>
          </div>
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
            onViewReport={() => {
              // Re-fetch reports to ensure latest data before viewing
              fetchPatientReports(selectedPatient.id).then(() => setView('review'));
            }}
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
