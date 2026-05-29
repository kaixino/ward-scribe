const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database');

const router = express.Router();

// GET /api/wards — list all wards
router.get('/wards', (req, res) => {
  const db = getDatabase();
  const wards = db.prepare('SELECT * FROM wards ORDER BY name').all();
  res.json(wards);
});

// GET /api/rooms?ward=ward-gw — list rooms for a ward
router.get('/rooms', (req, res) => {
  const db = getDatabase();
  const { ward } = req.query;
  if (!ward) return res.status(400).json({ error: 'ward query parameter is required' });
  const rooms = db.prepare(
    'SELECT * FROM rooms WHERE ward_id = ? ORDER BY name'
  ).all(ward);
  res.json(rooms);
});

// GET /api/patients — list patients, optionally filtered by ward or room
router.get('/patients', (req, res) => {
  const db = getDatabase();
  const { ward, room } = req.query;
  let patients;
  if (room) {
    patients = db.prepare(
      'SELECT p.*, w.name as ward_name, r.name as room_name FROM patients p LEFT JOIN wards w ON p.ward_id = w.id LEFT JOIN rooms r ON p.room_id = r.id WHERE p.room_id = ? ORDER BY p.bed_number'
    ).all(room);
  } else if (ward) {
    patients = db.prepare(
      'SELECT p.*, w.name as ward_name, r.name as room_name FROM patients p LEFT JOIN wards w ON p.ward_id = w.id LEFT JOIN rooms r ON p.room_id = r.id WHERE p.ward_id = ? ORDER BY r.name, p.bed_number'
    ).all(ward);
  } else {
    patients = db.prepare(
      'SELECT p.*, w.name as ward_name, r.name as room_name FROM patients p LEFT JOIN wards w ON p.ward_id = w.id LEFT JOIN rooms r ON p.room_id = r.id ORDER BY w.name, r.name, p.bed_number'
    ).all();
  }
  res.json(patients);
});

// GET /api/patients/:id/reports — get latest report for a patient
router.get('/patients/:id/reports', (req, res) => {
  const db = getDatabase();
  const report = db.prepare(
    `SELECT r.*, u.name as created_by_name 
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? 
     ORDER BY r.timestamp DESC 
     LIMIT 1`
  ).get(req.params.id);
  res.json(report || null);
});

// Determine shift label from timestamp: 07:00-18:59 = Day, 19:00-06:59 = Night
function getShiftLabel(ts) {
  const h = new Date(ts).getHours();
  return (h >= 7 && h < 19) ? 'Day Shift' : 'Night Shift';
}

// POST /api/reports — create a new report (AI-generated), or append to existing shift report
// Body: patient_id, nurse_id, transcript, report_type ('nurse' | 'doctor')
// If append=true, appends to the latest nurse report in the same shift instead of creating new
router.post('/reports', (req, res) => {
  const { patient_id, nurse_id, transcript, report_type, append } = req.body;

  if (!patient_id || !nurse_id || !transcript) {
    return res.status(400).json({ error: 'patient_id, nurse_id, and transcript are required' });
  }

  const db = getDatabase();
  const type = report_type === 'doctor' ? 'doctor' : 'nurse';

  // Get patient profile for progress note
  const patientProfile = db.prepare('SELECT * FROM patients WHERE id = ?').get(patient_id) || {};

  // AI processing
  let handover_text = '';
  let progress_note_text = '';

  if (type === 'doctor') {
    const doctorName = req.body.doctor_name || 'Doctor';
    progress_note_text = synthesizeDoctorNote(transcript, doctorName);
    handover_text = '';
  } else {
    const result = synthesizeNurseNotes(transcript, patientProfile);
    handover_text = result.handover_text;
    progress_note_text = result.progress_note_text;
  }

  const parentReportId = req.body.parent_report_id || null;

  // Each nurse gets their own report so every line is correctly attributed to them.
  // The shift-reports view (All Patient Reports) combines entries by shift+day
  // and preserves per-line nurse attribution via each report's created_by_nurse_id.
  const id = uuidv4();
  const stmt = db.prepare(
    'INSERT INTO reports (id, patient_id, created_by_nurse_id, parent_report_id, report_type, handover_text, progress_note_text) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(id, patient_id, nurse_id, parentReportId, type, handover_text, progress_note_text);

  const report = db.prepare(
    `SELECT r.*, u.name as created_by_name, u.role as created_by_role 
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.id = ?`
  ).get(id);

  res.status(201).json(report);
});

// PUT /api/reports/:id — update a report (with audit trail)
router.put('/reports/:id', (req, res) => {
  const { handover_text, progress_note_text, edited_by_nurse_id } = req.body;
  const db = getDatabase();

  // Fetch current version
  const current = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Report not found' });

  // Save old version to history
  if (current.handover_text !== handover_text || current.progress_note_text !== progress_note_text) {
    db.prepare(
      'INSERT INTO report_edit_history (report_id, edited_by_nurse_id, previous_handover, previous_progress_note) VALUES (?, ?, ?, ?)'
    ).run(req.params.id, edited_by_nurse_id, current.handover_text, current.progress_note_text);
  }

  // Update with new version
  db.prepare(
    `UPDATE reports SET handover_text = ?, progress_note_text = ?, edited_by_nurse_id = ?, status = 'signed', timestamp = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(handover_text, progress_note_text, edited_by_nurse_id, req.params.id);

  const updated = db.prepare(
    `SELECT r.*, u.name as created_by_name, e.name as edited_by_name 
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     LEFT JOIN users e ON r.edited_by_nurse_id = e.id 
     WHERE r.id = ?`
  ).get(req.params.id);

  res.json(updated);
});

// DELETE /api/reports/:id — delete a report
router.delete('/reports/:id', (req, res) => {
  const db = getDatabase();
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  // Delete edit history first, then report
  db.prepare('DELETE FROM report_edit_history WHERE report_id = ?').run(req.params.id);
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/reports/:id/history — get edit history
router.get('/reports/:id/history', (req, res) => {
  const db = getDatabase();
  const history = db.prepare(
    `SELECT h.*, u.name as edited_by_name 
     FROM report_edit_history h 
     LEFT JOIN users u ON h.edited_by_nurse_id = u.id 
     WHERE h.report_id = ? 
     ORDER BY h.edited_at DESC`
  ).all(req.params.id);
  res.json(history);
});

// POST /api/login — authenticate nurse by username + password
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const db = getDatabase();
  const user = db.prepare(
    'SELECT id, name, username, role, ward_id FROM users WHERE username = ? AND password_hash = ?'
  ).get(username, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const ward = db.prepare('SELECT name FROM wards WHERE id = ?').get(user.ward_id);
  res.json({ ...user, ward_name: ward?.name || 'Unassigned' });
});

// GET /api/nurses — list nurses, optionally filtered by ward (no passwords exposed)
router.get('/nurses', (req, res) => {
  const db = getDatabase();
  const { ward } = req.query;
  let nurses;
  if (ward) {
    nurses = db.prepare(
      "SELECT id, name, username, role, ward_id FROM users WHERE ward_id = ? AND role NOT LIKE '%Dr%' AND role NOT LIKE '%doctor%' AND role NOT LIKE '%MO%' AND role NOT LIKE '%Consultant%' AND role NOT LIKE '%Medical Officer%' ORDER BY name"
    ).all(ward);
  } else {
    nurses = db.prepare('SELECT id, name, username, role FROM users ORDER BY name').all();
  }
  res.json(nurses);
});

// POST /api/passing-over — create a passing-over handoff entry
router.post('/passing-over', (req, res) => {
  const { patient_id, from_nurse_id, audio_data, transcript, summary, target_shift } = req.body;
  if (!patient_id || !from_nurse_id) {
    return res.status(400).json({ error: 'patient_id and from_nurse_id required' });
  }
  const db = getDatabase();
  const id = uuidv4();
  const shift = target_shift || 'Next';
  const autoSummary = summary || generatePassingSummary(transcript || '');

  // Strip data URL prefix, store raw base64 only
  let rawAudio = null;
  if (audio_data) {
    const parts = audio_data.split(',');
    rawAudio = parts.length > 1 ? parts[1] : parts[0];
  }

  db.prepare(
    'INSERT INTO passing_over (id, patient_id, from_nurse_id, target_shift, audio_data, transcript, summary) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, patient_id, from_nurse_id, shift, rawAudio || null, transcript || '', autoSummary);
  const entry = db.prepare(
    `SELECT p.*, u.name as nurse_name FROM passing_over p LEFT JOIN users u ON p.from_nurse_id = u.id WHERE p.id = ?`
  ).get(id);
  res.status(201).json(entry);
});

// GET /api/passing-over/:patientId — list all passing-over entries for a patient
router.get('/passing-over/:patientId', (req, res) => {
  const db = getDatabase();
  const entries = db.prepare(
    `SELECT p.id, p.patient_id, p.from_nurse_id, p.target_shift, p.transcript, p.summary,
            p.created_at, u.name as nurse_name, length(p.audio_data) as audio_size
     FROM passing_over p 
     LEFT JOIN users u ON p.from_nurse_id = u.id 
     WHERE p.patient_id = ?
     ORDER BY p.created_at DESC`
  ).all(req.params.patientId);
  res.json(entries);
});

// GET /api/passing-over/:id/audio — get audio data for playback (decodes base64 -> binary)
router.get('/passing-over/:id/audio', (req, res) => {
  const db = getDatabase();
  const entry = db.prepare('SELECT audio_data FROM passing_over WHERE id = ?').get(req.params.id);
  if (!entry || !entry.audio_data) return res.status(404).json({ error: 'No audio found' });
  try {
    const binary = Buffer.from(entry.audio_data, 'base64');
    res.set('Content-Type', 'audio/webm');
    res.set('Content-Length', binary.length);
    res.send(binary);
  } catch (e) {
    res.status(500).json({ error: 'Audio decode failed' });
  }
});

// GET /api/patients/:id/all-reports — get ALL nurse reports for a patient (for timeline view)
router.get('/patients/:id/all-reports', (req, res) => {
  const db = getDatabase();
  const reports = db.prepare(
    `SELECT r.*, u.name as created_by_name, u.role as created_by_role
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? AND r.report_type = 'nurse'
     ORDER BY r.timestamp DESC`
  ).all(req.params.id);
  res.json(reports);
});

// GET /api/patients/:patientId/nurses/:nurseId/latest-report — get latest report by a specific nurse for a patient
router.get('/patients/:patientId/nurses/:nurseId/latest-report', (req, res) => {
  const db = getDatabase();
  const report = db.prepare(
    `SELECT r.*, u.name as created_by_name, u.role as created_by_role
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? AND r.created_by_nurse_id = ? AND r.report_type = 'nurse'
     ORDER BY r.timestamp DESC LIMIT 1`
  ).get(req.params.patientId, req.params.nurseId);
  res.json(report || null);
});

// GET /api/patients/:id/doctor-notes — get all doctor notes for a patient
router.get('/patients/:id/doctor-notes', (req, res) => {
  const db = getDatabase();
  const notes = db.prepare(
    `SELECT r.*, u.name as created_by_name, u.role as created_by_role
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? AND r.report_type = 'doctor'
     ORDER BY r.timestamp ASC`
  ).all(req.params.id);
  res.json(notes);
});

// GET /api/patients/:id/consolidated — combine all reports + doctor notes for a patient, grouped by day
router.get('/patients/:id/consolidated', (req, res) => {
  const db = getDatabase();

  // Get nurse reports (latest first)
  const reports = db.prepare(
    `SELECT r.*, u.name as nurse_name, u.role as nurse_role 
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? AND r.report_type = 'nurse'
     ORDER BY r.timestamp ASC`
  ).all(req.params.id);

  // Get doctor notes for this patient
  const doctorNotes = db.prepare(
    `SELECT r.*, u.name as created_by_name, u.role as created_by_role
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? AND r.report_type = 'doctor'
     ORDER BY r.timestamp ASC`
  ).all(req.params.id);

  if (reports.length === 0 && doctorNotes.length === 0) {
    return res.status(404).json({ error: 'No reports found for this patient' });
  }

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);

  // Group doctor notes by parent_report_id
  const doctorNotesByParent = {};
  doctorNotes.forEach(n => {
    const parentId = n.parent_report_id || 'orphan';
    if (!doctorNotesByParent[parentId]) doctorNotesByParent[parentId] = [];
    doctorNotesByParent[parentId].push({
      id: n.id,
      doctorName: n.created_by_name,
      doctorRole: n.created_by_role,
      text: n.progress_note_text,
      parentReportId: n.parent_report_id,
      timestamp: n.timestamp,
      timeFormatted: new Date(n.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  });

  // Build combined text and group by day
  const dayGroups = {};
  let combinedText = '';

  reports.forEach((report) => {
    const dateKey = new Date(report.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    if (!dayGroups[dateKey]) dayGroups[dateKey] = [];

    const entry = {
      id: report.id,
      nurse_name: report.nurse_name,
      nurse_role: report.nurse_role,
      created_by_nurse_id: report.created_by_nurse_id,
      timestamp: report.timestamp,
      report_type: 'nurse',
      handover_text: report.handover_text,
      progress_note_text: report.progress_note_text,
      doctorNotes: doctorNotesByParent[report.id] || [],
    };

    dayGroups[dateKey].push(entry);
    combinedText += `--- ${dateKey} | ${report.nurse_name} (${report.nurse_role}) at ${new Date(report.timestamp).toLocaleString()} ---\n${report.progress_note_text}\n\n`;
  });

  // Attach orphan doctor notes to the day of the last report, or their own day
  const orphanNotes = doctorNotes.filter(n => !reports.some(r => r.id === n.parent_report_id));
  orphanNotes.forEach(n => {
    const dateKey = new Date(n.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    if (!dayGroups[dateKey]) dayGroups[dateKey] = [];
    dayGroups[dateKey].push({
      id: n.id,
      nurse_name: n.created_by_name,
      nurse_role: n.created_by_role,
      created_by_nurse_id: n.created_by_nurse_id,
      timestamp: n.timestamp,
      report_type: 'doctor',
      handover_text: null,
      progress_note_text: null,
      doctorNotes: [{
        id: n.id,
        doctorName: n.created_by_name,
        doctorRole: n.created_by_role,
        text: n.progress_note_text,
        parentReportId: n.parent_report_id,
        timestamp: n.timestamp,
        timeFormatted: new Date(n.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      }],
    });
  });

  const allNurses = [...new Set(reports.map(r => r.nurse_name))];
  const allDoctors = [...new Set(doctorNotes.map(n => n.created_by_name))];

  res.json({
    patient,
    reportCount: reports.length + doctorNotes.length,
    nurseCount: allNurses.length,
    doctorCount: allDoctors.length,
    nurses: allNurses,
    doctors: allDoctors,
    combinedText: combinedText.trim(),
    dayGroups: Object.entries(dayGroups).map(([dateKey, entries]) => ({
      date: dateKey,
      entries,
    })),
  });
});

// GET /api/patients/:id/shift-reports — reports grouped by day+shift, handover + progress combined
router.get('/patients/:id/shift-reports', (req, res) => {
  const db = getDatabase();

  const reports = db.prepare(
    `SELECT r.*, u.name as nurse_name, u.role as nurse_role, u.shift as nurse_shift
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? AND r.report_type = 'nurse'
     ORDER BY r.timestamp ASC`
  ).all(req.params.id);

  const doctorNotes = db.prepare(
    `SELECT r.*, u.name as created_by_name, u.role as created_by_role
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? AND r.report_type = 'doctor'
     ORDER BY r.timestamp ASC`
  ).all(req.params.id);

  if (reports.length === 0 && doctorNotes.length === 0) {
    return res.status(404).json({ error: 'No reports found for this patient' });
  }

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);

  // Determine shift label from timestamp: 07:00-18:59 = Day, 19:00-06:59 = Night
  function getShiftLabel(ts) {
    const h = new Date(ts).getHours();
    return (h >= 7 && h < 19) ? 'Day Shift' : 'Night Shift';
  }

  // Group by day+shift key
  const shiftGroups = {};
  reports.forEach(r => {
    const d = new Date(r.timestamp);
    const dayKey = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const shift = getShiftLabel(r.timestamp);
    const groupKey = dayKey + '|' + shift;
    if (!shiftGroups[groupKey]) {
      shiftGroups[groupKey] = {
        date: dayKey,
        shift,
        timeFormatted: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        handoverEntries: [],
        progressEntries: [],
        doctorEntries: [],
      };
    }
    // Collect nurse info for each line in handover and progress
    const handoverLines = (r.handover_text || '').split('\n').filter(l => l.trim());
    handoverLines.forEach(line => {
      shiftGroups[groupKey].handoverEntries.push({
        text: line,
        nurseName: r.nurse_name,
        nurseRole: r.nurse_role,
        timestamp: r.timestamp,
        timeFormatted: new Date(r.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      });
    });
    const progressLines = (r.progress_note_text || '').split('\n').filter(l => l.trim());
    progressLines.forEach(line => {
      shiftGroups[groupKey].progressEntries.push({
        text: line,
        nurseName: r.nurse_name,
        nurseRole: r.nurse_role,
        timestamp: r.timestamp,
        timeFormatted: new Date(r.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      });
    });
  });

  // Group doctor notes by parent report and attach
  const doctorNotesByParent = {};
  doctorNotes.forEach(n => {
    const parentId = n.parent_report_id || 'orphan';
    if (!doctorNotesByParent[parentId]) doctorNotesByParent[parentId] = [];
    doctorNotesByParent[parentId].push({
      id: n.id,
      doctorName: n.created_by_name,
      doctorRole: n.created_by_role,
      text: n.progress_note_text,
      parentReportId: n.parent_report_id,
      timestamp: n.timestamp,
      timeFormatted: new Date(n.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  });

  // Attach doctor notes to their parent report's shift group
  const orphanDoctorEntries = [];
  Object.values(shiftGroups).forEach(group => {
    // Find which report IDs are in this group — we need to map back
  });

  // Add doctor notes as separate doctorEntries in each shift group
  doctorNotes.forEach(n => {
    const d = new Date(n.timestamp);
    const dayKey = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const shift = getShiftLabel(n.timestamp);
    const groupKey = dayKey + '|' + shift;
    if (!shiftGroups[groupKey]) {
      shiftGroups[groupKey] = {
        date: dayKey,
        shift,
        timeFormatted: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        handoverEntries: [],
        progressEntries: [],
        doctorEntries: [],
      };
    }
    if (!shiftGroups[groupKey].doctorEntries) shiftGroups[groupKey].doctorEntries = [];
    shiftGroups[groupKey].doctorEntries.push({
      text: n.progress_note_text,
      doctorName: n.created_by_name,
      doctorRole: n.created_by_role,
      timestamp: n.timestamp,
      timeFormatted: new Date(n.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  });

  const result = Object.entries(shiftGroups).map(([key, group]) => ({
    date: group.date,
    shift: group.shift,
    timeFormatted: group.timeFormatted,
    handoverEntries: group.handoverEntries,
    progressEntries: group.progressEntries,
    doctorEntries: group.doctorEntries || [],
  }));

  res.json({
    patient,
    shiftGroups: result,
    totalReports: reports.length + doctorNotes.length,
  });
});

/** Generate a brief summary from a passing-over transcript */
function generatePassingSummary(transcript) {
  if (!transcript.trim()) return 'No notes recorded.';
  const lines = [];
  lines.push(`📋 Key handoff points: ${transcript.length > 120 ? transcript.substring(0, 120) + '...' : transcript}`);
  if (/fall|fell|unsteady/i.test(transcript)) lines.push('⚠️ Fall risk noted');
  if (/pain|ache/i.test(transcript)) lines.push('💊 Pain management needed');
  if (/bp|hr|spo2|vital|obs/i.test(transcript)) lines.push('📊 Vitals to monitor');
  if (/medication|given|administer/i.test(transcript)) lines.push('💊 Medications due');
  if (/dr\.|doctor|notif|call/i.test(transcript)) lines.push('📞 Medical review pending');
  lines.push(`🔄 ${transcript.split(/[.!?]/).length} clinical observations documented`);
  return lines.join('\n');
}

/** Synthesize a doctor's progress note using structured template
 *  Format: Date/time | Seen by Dr___. Noted patient's vital signs/condition.
 *  Investigations reviewed (if any). Ordered for (orders). Commenced on (meds).
 *  The rest continue same.
 */
function synthesizeDoctorNote(transcript, doctorName) {
  const t = transcript.trim();
  const lower = t.toLowerCase();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });

  // Extract vital signs
  const bp = (t.match(/(?:bp|blood pressure)\s*(?:is|of|:)?\s*(\d{2,3}\s*\/\s*\d{2,3})/i) || [])[1];
  const hr = (t.match(/(?:hr|heart rate|pulse)\s*(?:is|of|:)?\s*(\d{2,3})/i) || [])[1];
  const spo2 = (t.match(/(?:spo2|o2 sat|sats)\s*(?:is|of|:)?\s*(\d{2,3})/i) || [])[1];
  const temp = (t.match(/(?:temp|temperature)\s*(?:is|of|:)?\s*(\d{2}\.?1?\d*\s*°?c?)/i) || [])[1];

  let vitalsStr = '';
  if (bp) vitalsStr += `BP ${bp}`;
  if (hr) vitalsStr += (vitalsStr ? ', ' : '') + `HR ${hr}`;
  if (spo2) vitalsStr += (vitalsStr ? ', ' : '') + `SpO2 ${spo2}%`;
  if (temp) vitalsStr += (vitalsStr ? ', ' : '') + `Temp ${temp}°C`;
  const hasVitals = !!vitalsStr;

  // Extract condition / complaint
  const complaintMatch = t.match(/(?:complaint?|complain|condition|presented with|c\/o|complains of)\s*[^.!?]*/i);
  let conditionText = '';
  if (complaintMatch) {
    conditionText = complaintMatch[0].trim();
  } else {
    conditionText = (t.split(/\.\s|\.$/)[0] || '').trim();
    conditionText = conditionText.replace(/^(Patient\s+)?(was\s+|is\s+|has\s+)?/i, '').trim();
  }

  // Extract investigations reviewed
  let investStr = '';
  const investRegex = /(?:investigation|lab\s*(?:result|work|test)?|blood\s*(?:test|work|result)?(?!\s+pressure)|ct\s+scan|mri|ecg|result(?!ing|s\s+of)|scan|test\s*(?:result)?|fbc|U\/E|U&E|crp|xray|x-ray)\s*[^.]*/gi;
  const investMatches = [...t.matchAll(investRegex)];
  if (investMatches.length > 0) {
    const unique = [...new Set(investMatches.map(m => m[0].trim()))];
    investStr = unique.slice(0, 2).join('; ');
  }

  // Extract doctor's orders
  let ordersStr = '';
  const orderIdx = lower.indexOf('ordered for');
  if (orderIdx >= 0) {
    const after = t.substring(orderIdx + 'ordered for'.length).trim();
    const periodIdx = after.search(/\.\s|\.$/);
    ordersStr = periodIdx >= 0 ? after.substring(0, periodIdx) : after;
  }
  if (!ordersStr) {
    const prescMatch = t.match(/prescribe[d]?\s+([^.!?\n]+[.!?]?)/i);
    if (prescMatch) ordersStr = prescMatch[1]?.trim().replace(/\.$/, '') || '';
  }

  // Extract medications commenced
  let medsStr = '';
  const medMatch = t.match(/(?:commence(?:d)?\s+on(?:\s*:)?\s*|start(?:ed)?\s+on(?:\s*:)?\s*|prescribe[d]?\s+)((?:[^.!?]|\.(?!\s))+(?:\.(?:\s|$))?)/i);
  if (medMatch) {
    medsStr = medMatch[1]?.trim().replace(/\.$/, '') || '';
  }

  // Detect "continue same" / no change
  const contSame = /continue\s+same|cont\s+same|no\s+change|same\s+as\s+before|unchanged/i.test(t);

  // Clean doctor name
  const cleanName = doctorName.replace(/^(Dr\.?\s*)+/i, '').trim();

  // --- Build the note using the template ---
  let note = '';

  // 1. Date/Time header
  note += `${dateStr} ${timeStr}\n`;

  // 2. Seen by Dr.
  note += `Had seen by Dr. ${cleanName}. `;

  // 3. Noted patient's vital signs / condition / complaint
  const cleanCondition = conditionText.replace(/^(patient\s+)?(is\s+|was\s+|has\s+)?(complaint\s*:?\s*)?/i, '').trim();
  if (hasVitals) {
    note += `Noted patient's ${vitalsStr} — ${cleanCondition.charAt(0).toUpperCase() + cleanCondition.slice(1)}. `;
  } else {
    note += `${cleanCondition.charAt(0).toUpperCase() + cleanCondition.slice(1)}. `;
  }

  // 4. Investigations reviewed
  if (investStr) {
    const cleanInvest = investStr.replace(/^(investigations?\s+reviewed\s*:?\s*)/i, '').trim();
    note += `Investigations reviewed: ${cleanInvest}. `;
  }

  // 5. Ordered for
  if (ordersStr && !/continue\s+same|cont\s+same|no\s+change/i.test(ordersStr)) {
    note += `Ordered for ${ordersStr}. `;
  }

  // 6. Commenced on (medication)
  if (medsStr && !/continue\s+same|cont\s+same|no\s+change/i.test(medsStr)) {
    note += `Commenced on ${medsStr}. `;
  }

  // 7. The rest continue same — only if doctor actually said it
  if (/continue\s+same|cont\s+same/i.test(t)) {
    note += `The rest continue same.`;
  }

  return note;
}

/**
 * AI Synthesis Engine — transforms raw transcript into structured nursing notes
 * - Handover Report: Short, informal sentences (no emojis).
 * - Progress Note: Clinical narrative with one timestamp per block.
 */
function synthesizeNurseNotes(transcript, patientProfile) {
  const t = transcript.trim();
  const lower = t.toLowerCase();

  // Extract any time mentioned in the transcript
  const firstTime = (t.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i) || [])[1];
  const recordingTime = firstTime ||
    new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }) + ' hrs';

  // Split into sentences
  const sentences = t.replace(/\.\s+/g, '•').split(/[!?\n]/).flatMap(s => s.split('•')).filter(s => s.trim()).map(s => s.trim());

  // ================================================================
  // A. HANDOVER REPORT — Short, informal sentences
  // ================================================================
  const h = sentences.map(s => {
    const timeIn = s.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)|\b(\d{3,4})\s*(?:hrs?)\b/i);
    const timeStr = timeIn ? (timeIn[1] || timeIn[2]) : null;
    const timePrefix = timeStr ? '[' + timeStr + '] ' : '';
    return timePrefix + s.charAt(0).toUpperCase() + s.slice(1);
  });

  // ================================================================
  // B. PROGRESS NOTE — Clinical narrative, one time per block
  // ================================================================
  const p = [];

  // Recording header — one timestamp for the whole entry
  p.push(`[${recordingTime}]`);

  sentences.forEach(s => {
    const lowerS = s.toLowerCase();

    if (/pain|ache|discomfort|headache|abdomen|nausea|vomit|cramp/i.test(lowerS)) {
      let cleaned = s.replace(/^(Patient\s+)?(was\s+|is\s+|has\s+)?/i, '').trim();
      if (/^complained\s+of/i.test(cleaned)) {
        p.push(`Patient ${cleaned.toLowerCase()}.`);
      } else {
        p.push(`Patient complained of ${cleaned.toLowerCase()}.`);
      }
    } else if (/bp|blood press|hr|heart rate|spo2|temp|vitals|obs/i.test(lowerS)) {
      p.push(`Vital signs assessed: ${s}.`);
    } else if (/(?:paracetamol|panadol|morphine|antibiotic|ceftriaxone|amoxicillin|ibuprofen|aspirin|insulin|heparin|furosemide|omeprazole|metformin|amlodipine|atorvastatin)\s|(?:given|administered|received)\s+(?:\w+\s+){0,3}(?:mg|mcg|g|ml|units|tablet|dose)/i.test(lowerS)) {
      p.push(`${s.charAt(0).toUpperCase() + s.slice(1)}. Patient tolerated well.`);
    } else if (/fall|fell|collapse|trip|slip/i.test(lowerS)) {
      p.push(`Patient found ${s.replace(/patient\s+/i, '').toLowerCase().trim()}. Assessed for injury. No visible injury noted. Assisted back to bed. Bed alarm applied.`);
    } else if (/wound|dressing|surgical|incision|skin|ulcer|pressure|suture|bandage/i.test(lowerS)) {
      p.push(`Wound assessed: ${s}. Dressing noted to be clean, dry, and intact.`);
    } else if (/doctor|dr\.|notif|call|page|inform|consult|review/i.test(lowerS)) {
      p.push(`${s}. Medical team notified of findings.`);
    } else if (/family|wife|husband|daughter|son|relatives|next of kin/i.test(lowerS)) {
      p.push(`Family updated: ${s}.`);
    } else if (/o2|oxygen|breath|resp|nebuliser|ventilat|spo2/i.test(lowerS)) {
      p.push(`Respiratory assessment: ${s}.`);
    } else if (/mobil|walk|ambulat|transfer|exercise|deep breath|physio|move/i.test(lowerS)) {
      p.push(`Patient mobilised: ${s}. Encouraged deep breathing exercises and ambulation.`);
    } else if (/conscious|alert|confused|drowsy|gcs|neuro|avpu|responsive/i.test(lowerS)) {
      p.push(`Neurological assessment: ${s}.`);
    } else if (/urine|catheter|output|renal|incontine|toilet|bathroom/i.test(lowerS)) {
      p.push(`Genitourinary assessment: ${s}.`);
    } else if (/diet|feed|eat|drink|appetite|fluid.*intake|hydrat/i.test(lowerS)) {
      p.push(`Encouraged oral intake and hydration: ${s}.`);
    } else if (/lab|blood|test|result|fbc|ue|troponin|swab|culture|xray|x-ray|scan|ecg/i.test(lowerS)) {
      p.push(`Investigations reviewed: ${s}.`);
    } else {
      const cleaned = s.charAt(0).toUpperCase() + s.slice(1);
      const ended = /[.!?]$/.test(cleaned) ? cleaned : cleaned + '.';
      p.push(ended);
    }
  });

  return {
    handover_text: h.join('\n'),
    progress_note_text: p.join('\n'),
  };
}

/** Extract a patient reference from the text (bed number or name) */
function extractPatientRef(text) {
  const bedMatch = text.match(/bed\s*(\d+)/i);
  if (bedMatch) return `Bed ${bedMatch[1]}`;
  return 'See report';
}

/** Extract a value from text with a regex, falling back to default */
function extractValue(text, regex, fallback) {
  const match = text.match(regex);
  if (match) {
    const val = match[0].trim();
    return val.length > 60 ? val.substring(0, 60) + '...' : val;
  }
  return fallback;
}

module.exports = router;
