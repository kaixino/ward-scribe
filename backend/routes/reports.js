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

// GET /api/patients?ward=ward-gw — list patients, optionally filtered by ward
router.get('/patients', (req, res) => {
  const db = getDatabase();
  const { ward } = req.query;
  let patients;
  if (ward) {
    patients = db.prepare(
      'SELECT p.*, w.name as ward_name FROM patients p LEFT JOIN wards w ON p.ward_id = w.id WHERE p.ward_id = ? ORDER BY p.bed_number'
    ).all(ward);
  } else {
    patients = db.prepare(
      'SELECT p.*, w.name as ward_name FROM patients p LEFT JOIN wards w ON p.ward_id = w.id ORDER BY w.name, p.bed_number'
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

// POST /api/reports — create a new report (AI-generated)
// Body: patient_id, nurse_id, transcript, report_type ('nurse' | 'doctor')
router.post('/reports', (req, res) => {
  const { patient_id, nurse_id, transcript, report_type } = req.body;

  if (!patient_id || !nurse_id || !transcript) {
    return res.status(400).json({ error: 'patient_id, nurse_id, and transcript are required' });
  }

  const db = getDatabase();
  const type = report_type === 'doctor' ? 'doctor' : 'nurse';

  // AI processing
  let handover_text = '';
  let progress_note_text = '';

  if (type === 'doctor') {
    // Doctor notes — structured template
    const doctorName = req.body.doctor_name || 'Doctor';
    progress_note_text = synthesizeDoctorNote(transcript, doctorName);
    handover_text = '';
  } else {
    // Nurse notes — both handover (integrated) + progress note
    const result = synthesizeNurseNotes(transcript);
    handover_text = result.handover_text;
    progress_note_text = result.progress_note_text;
  }

  const parentReportId = req.body.parent_report_id || null;

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

// GET /api/patients/:id/consolidated — combine all reports + doctor notes for a patient
router.get('/patients/:id/consolidated', (req, res) => {
  const db = getDatabase();

  // Get nurse reports (latest first)
  const reports = db.prepare(
    `SELECT r.*, u.name as nurse_name, u.role as nurse_role 
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? AND r.report_type = 'nurse'
     ORDER BY r.timestamp DESC`
  ).all(req.params.id);

  // Get doctor notes for this patient
  const doctorNotes = db.prepare(
    `SELECT r.*, u.name as created_by_name, u.role as created_by_role
     FROM reports r 
     LEFT JOIN users u ON r.created_by_nurse_id = u.id 
     WHERE r.patient_id = ? AND r.report_type = 'doctor'
     ORDER BY r.timestamp DESC`
  ).all(req.params.id);

  if (reports.length === 0 && doctorNotes.length === 0) {
    return res.status(404).json({ error: 'No reports found for this patient' });
  }

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);

  // Build all entries (only for nurse reports)
  const allEntries = [];
  reports.forEach((report) => {
    const lines = (report.progress_note_text || '').split('\n');
    const timestamp = new Date(report.timestamp);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      allEntries.push({
        text: line,
        nurseId: report.created_by_nurse_id,
        nurseName: report.nurse_name,
        nurseRole: report.nurse_role,
        reportId: report.id,
        timestamp: report.timestamp,
        timeFormatted: timestamp.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      });
    });
  });

  // Group doctor notes by parent_report_id (specific report they're attached to)
  const doctorNotesByParent = {};
  doctorNotes.forEach(n => {
    const parentId = n.parent_report_id || 'orphan';
    if (!doctorNotesByParent[parentId]) doctorNotesByParent[parentId] = [];
    doctorNotesByParent[parentId].push({
      id: n.id,
      doctorName: n.created_by_name,
      doctorRole: n.created_by_role,
      text: n.progress_note_text,
      timestamp: n.timestamp,
      timeFormatted: new Date(n.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  });

  // Build combined text
  let combinedText = '';
  reports.forEach((report) => {
    combinedText += `--- Entry by ${report.nurse_name} (${report.nurse_role}) at ${new Date(report.timestamp).toLocaleString()} ---\n${report.progress_note_text}\n\n`;
    const attachedNotes = doctorNotesByParent[report.id] || [];
    attachedNotes.forEach(n => {
      combinedText += `--- Doctor's Note by ${n.doctorName} at ${n.timeFormatted} ---\n${n.text}\n\n`;
    });
  });

  // Calculate unique nurses (including doctors who wrote notes)
  const allNurses = [...new Set(reports.map(r => r.nurse_name))];
  const allDoctors = [...new Set(doctorNotes.map(n => n.created_by_name))];

  res.json({
    patient,
    reportCount: reports.length + doctorNotes.length,
    nurseCount: allNurses.length,
    doctorCount: allDoctors.length,
    nurses: allNurses,
    doctors: allDoctors,
    allEntries,
    combinedText: combinedText.trim(),
    reports: reports.map(r => ({
      id: r.id,
      nurse_name: r.nurse_name,
      nurse_role: r.nurse_role,
      created_by_nurse_id: r.created_by_nurse_id,
      timestamp: r.timestamp,
      handover_text: r.handover_text,
      progress_note_text: r.progress_note_text,
      // Include doctor notes attached to this nurse
      doctorNotes: doctorNotesByParent[r.id] || [],
    })),
    // Unattached doctor notes
    orphanDoctorNotes: doctorNotes.filter(n => !reports.some(r => r.id === n.parent_report_id)),
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
 *  Template: Date/time | Seen by Dr___. Noted patient's vital signs/condition.
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

  // Build vital signs string
  let vitalsStr = '';
  if (bp) vitalsStr += `BP ${bp}`;
  if (hr) vitalsStr += (vitalsStr ? ', ' : '') + `HR ${hr}`;
  if (spo2) vitalsStr += (vitalsStr ? ', ' : '') + `SpO2 ${spo2}%`;
  if (temp) vitalsStr += (vitalsStr ? ', ' : '') + `Temp ${temp}°C`;
  const hasVitals = !!vitalsStr;

  // Extract condition / complaint (single sentence)
  const complaintMatch = t.match(/(?:complaint?|complain|condition|presented with|c\/o|complains of)\s*[^.!?]*/i);
  let conditionText = '';
  if (complaintMatch) {
    conditionText = complaintMatch[0].trim();
  } else {
    conditionText = (t.split(/\.\s|\.$/)[0] || '').trim();
    // Remove "Patient" prefix for cleaner output
    conditionText = conditionText.replace(/^(Patient\s+)?(was\s+|is\s+|has\s+)?/i, '').trim();
  }

  // Extract investigations reviewed (one sentence only, stop at period)
  let investStr = '';
  const investRegex = /(?:investigation|lab\s*(?:result|work|test)?|blood\s*(?:test|work|result)?(?!\s+pressure)|ct\s+scan|mri|ecg|result(?!ing|s\s+of)|scan|test\s*(?:result)?|fbc|U\/E|U&E|crp)\s*[^.]*/gi;
  const investMatches = [...t.matchAll(investRegex)];
  if (investMatches.length > 0) {
    const unique = [...new Set(investMatches.map(m => m[0].trim()))];
    investStr = unique.slice(0, 2).join('; ');
  }

  // Extract doctor's orders - capture until sentence-ending period (but not mid-word periods like "x-ray")
  let ordersStr = '';
  // First try to find text after "Ordered for" - use a smarter approach
  const orderIdx = lower.indexOf('ordered for');
  if (orderIdx >= 0) {
    const after = t.substring(orderIdx + 'ordered for'.length).trim();
    // Find the next sentence-ending period (period followed by space or end of string)
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

  // --- Build the note using the template ---
  let note = '';

  // 1. Date/Time header
  note += `${dateStr} ${timeStr}\n`;

  // 2. Seen by Dr. (avoid double "Dr." if name already includes it)
  const cleanName = doctorName.replace(/^(Dr\.?\s*)+/i, '').trim();
  note += `Had seen by Dr. ${cleanName}. `;

  // 3. Noted patient's vital signs / condition / complaint
  if (hasVitals) {
    note += `Noted patient's ${vitalsStr} — ${conditionText}. `;
  } else {
    const capCondition = conditionText.charAt(0).toUpperCase() + conditionText.slice(1);
    note += `${capCondition}. `;
  }

  // 4. Investigations reviewed
  if (investStr) {
    note += `Investigations reviewed: ${investStr}. `;
  }

  // 5. Ordered for
  if (ordersStr && !/continue\s+same|cont\s+same|no\s+change/i.test(ordersStr)) {
    note += `Ordered for ${ordersStr}. `;
  }

  // 6. Commenced on (medication)
  if (medsStr && !/continue\s+same|cont\s+same|no\s+change/i.test(medsStr)) {
    note += `Commenced on ${medsStr}. `;
  }

  // 7. The rest continue same
  if (contSame || (!ordersStr && !medsStr && lower.includes('cont')) || /cont\s+same/i.test(t)) {
    note += `The rest continue same.`;
  } else if (!ordersStr && !medsStr && !investStr && !contSame) {
    // Nothing specific extracted - check if doctor said "continue same"
    if (!/same|continue|cont/i.test(t)) {
      note += `The rest continue same.`;
    }
  }

  return note;
}

/**
 * AI Synthesis Engine — transforms raw transcript into structured nursing notes
 * Extracts clinical data points, medications, vital signs, notifications, and actions
 */
function synthesizeNurseNotes(transcript) {
  const t = transcript.trim();
  const lower = t.toLowerCase();

  // --- Extract structured data points from raw text ---

  const timeMatch = t.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/gi);
  const times = timeMatch ? timeMatch.map(m => m.trim()) : [];

  // Extract vital signs
  const vitals = [];
  const bpMatch = lower.match(/(?:bp|blood pressure)\s*(?:is|of|:)?\s*(\d{2,3}\s*\/\s*\d{2,3})/i);
  if (bpMatch) vitals.push(`BP ${bpMatch[1]}`);
  const hrMatch = lower.match(/(?:hr|heart rate|pulse)\s*(?:is|of|:)?\s*(\d{2,3})/i);
  if (hrMatch) vitals.push(`HR ${hrMatch[1]}`);
  const spo2Match = lower.match(/(?:spo2|o2 sat|oxygen sat|sats)\s*(?:is|of|:)?\s*(\d{2,3})\s*%?/i);
  if (spo2Match) vitals.push(`SpO2 ${spo2Match[1]}%`);
  const tempMatch = lower.match(/(?:temp|temperature|fever)\s*(?:is|of|:)?\s*(\d{2}\.?\d*\s*°?c?)/i);
  if (tempMatch) vitals.push(`Temp ${tempMatch[1]}°C`);

  // Extract medications
  const meds = [];
  const medMatches = t.matchAll(/(\w+)\s*(?:given|administered|prescribed|taken)\s*(?:\w+\s+){0,3}?(\d+\s*(?:mg|mcg|g|ml|units|tablets?|puffs?))?/gi);
  for (const m of medMatches) {
    meds.push(`${m[1]}${m[2] ? ' ' + m[2] : ''}`);
  }

  // Detect clinical categories
  const hasNeuro = /conscious|alert|confused|drowsy|gcs|avpu/i.test(t);
  const hasResp = /breath|o2|oxygen|spo2|resp|ventilat|nebuliser/i.test(t);
  const hasCardio = /heart|hr|bp|blood pressure|pulse|ecg|chest pain|palpitat/i.test(t);
  const hasPain = /pain|ache|discomfort|analgesia|prn/i.test(t);
  const hasMobility = /mobil|walk|ambulat|bed|transfer|fall|fell|unsteady|stumble/i.test(t);
  const hasGI = /bowel|nausea|vomit|diet|feed|appetite|constipat|diarrhoea|stoma/i.test(t);
  const hasGU = /urine|catheter|output|renal|kidney|incontine/i.test(t);
  const hasSkin = /wound|skin|dressing|pressure|breakdown|ulcer|sore|tear/i.test(t);
  const hasMeds = /medication|given|administer|tablet|dose|prescribed|pm|prn|IV|oral/i.test(t);
  const hasLabs = /lab|blood|fbc|fbe|ue|troponin|result|test|swab|culture|hgt|glucose/i.test(t);
  const hasFall = /fall|fell|collapse|trip|slip|lift|assist/i.test(t);
  const hasNotify = /notif|inform|call|page|doctor|dr\.|consult|review/i.test(t);
  const hasFamily = /family|wife|husband|son|daughter|relatives|cousin|next of kin/i.test(t);
  const hasEvent = /event|incident|happened|occurred|occur/i.test(t);

  const vitalsStr = vitals.length > 0 ? vitals.join(', ') : 'See chart';

  // --- Build Handover Report (short, informal, task-focused for shift change) ---
  const h = [];

  // Extract bed/patient reference
  const bedMatch = t.match(/bed\s*(\d+)/i);
  const bedRef = bedMatch ? `Bed ${bedMatch[1]}` : extractPatientRef(t);

  // Build concise handover notes (split on sentence period+space, not decimal points)
  const sentences = t.replace(/\.\s+/g, '•').split(/[!?\n]/).flatMap(s => s.split('•')).filter(s => s.trim()).map(s => s.trim());
  const clinicalPoints = [];

  sentences.forEach(s => {
    const lowerS = s.toLowerCase();
    const timeIn = s.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    const timePrefix = timeIn ? timeIn[1] + ' ' : '';

    if (/fall|fell|collapse|trip|slip/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}⚠️ ${s}`);
    } else if (/pain|ache|discomfort|headache/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}💊 ${s}`);
    } else if (/bp|hr|spo2|vital|blood press|temp/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}📊 ${s}`);
    } else if (/medication|given|administer|paracetamol|panadol|antibiotic|morphine|iv/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}💊 ${s}`);
    } else if (/wound|dressing|skin|ulcer|surgical|incision/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}🩹 ${s}`);
    } else if (/family|wife|husband|daughter|son|relatives|next of kin/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}👨‍👩‍👧 ${s}`);
    } else if (/doctor|dr\.|notif|call|page|consult|review/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}📞 ${s}`);
    } else if (/nausea|vomit|bowel|diet|feed|appetite|abdominal/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}🍽️ ${s}`);
    } else if (/urine|catheter|output|renal/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}🫘 ${s}`);
    } else if (/conscious|alert|confused|drowsy|gcs|neuro/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}🧠 ${s}`);
    } else if (/o2|oxygen|breath|resp|nebuliser|ventilat/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}🫁 ${s}`);
    } else if (/mobil|walk|ambulat|transfer|exercise|deep breath/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}🛏️ ${s}`);
    } else if (/encourage|monitor|reassess|check|observe|watch/i.test(lowerS)) {
      clinicalPoints.push(`${timePrefix}📝 ${s}`);
    } else {
      // Plain text - use as-is
      clinicalPoints.push(`${timePrefix}${s}`);
    }
  });

  // Format: short lines, no bullet prefixes for plain text
  clinicalPoints.forEach(pt => h.push(pt));

  // Add pending items if not already in the text
  if (!/pending|to do|follow|due|scheduled/i.test(t)) {
    h.push(``);
    if (hasFall) h.push(`⚠️ Bed alarm on. Assist with all mobility.`);
    if (hasPain) h.push(`💊 Monitor pain. PRN analgesia available.`);
    if (vitals.length > 0) h.push(`📊 Monitor vitals.`);
    if (hasNotify) h.push(`📞 Medical review pending.`);
  }

  // --- Build Progress Note (chronological, professional, objective) ---
  const p = [];

  // Use first time mentioned or current time
  const entryTime = times.length > 0 ? times[0] : new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) + ' hrs';

  // Chronological entry
  p.push(`${entryTime}:`);

  // Build narrative from transcript
  // Split on sentence-ending punctuation followed by space (not decimal points in numbers)
  const progSentences = t.replace(/\.\s+/g, '•').split(/[!?\n]/).flatMap(s => s.split('•')).filter(s => s.trim()).map(s => s.trim());
  const narrative = [];

  progSentences.forEach(s => {
    const lowerS = s.toLowerCase();
    if (/pain|ache|discomfort|headache|abdomen|nausea|vomit|cramp/i.test(lowerS)) {
      narrative.push(`Patient complained of ${s.replace(/patient\s+/i, '').toLowerCase().trim()}.`);
    } else if (/bp|blood press|hr|heart rate|spo2|temp|vitals|obs/i.test(lowerS)) {
      narrative.push(`Vital signs assessed: ${s}.`);
    } else if (/given|administer|received|paracetamol|panadol|morphine|antibiotic|iv|oral|tablet|medication/i.test(lowerS)) {
      narrative.push(`${s}. Patient tolerated medication well.`);
    } else if (/fall|fell|collapse|trip|slip/i.test(lowerS)) {
      narrative.push(`Patient found ${s.replace(/patient\s+/i, '').toLowerCase().trim()}. Assessed for injury. No visible injury noted. Assisted back to bed. Bed alarm applied.`);
    } else if (/wound|dressing|surgical|incision|skin|ulcer|pressure|suture|bandage/i.test(lowerS)) {
      narrative.push(`Wound assessed: ${s}. Dressing noted to be clean, dry, and intact.`);
    } else if (/doctor|dr\.|notif|call|page|inform|consult|review/i.test(lowerS)) {
      narrative.push(`${s}. Medical team notified of findings.`);
    } else if (/family|wife|husband|daughter|son|relatives|next of kin/i.test(lowerS)) {
      narrative.push(`Family updated: ${s}.`);
    } else if (/o2|oxygen|breath|resp|nebuliser|ventilat|spo2/i.test(lowerS)) {
      narrative.push(`Respiratory assessment: ${s}.`);
    } else if (/mobil|walk|ambulat|transfer|exercise|deep breath|physio|move/i.test(lowerS)) {
      narrative.push(`Patient mobilised: ${s}. Encouraged deep breathing exercises and ambulation.`);
    } else if (/conscious|alert|confused|drowsy|gcs|neuro|avpu|responsive/i.test(lowerS)) {
      narrative.push(`Neurological assessment: ${s}.`);
    } else if (/urine|catheter|output|renal|incontine|toilet|bathroom/i.test(lowerS)) {
      narrative.push(`Genitourinary assessment: ${s}.`);
    } else if (/diet|feed|eat|drink|appetite|fluid.*intake|hydrat/i.test(lowerS)) {
      narrative.push(`Encouraged oral intake and hydration: ${s}.`);
    } else if (/lab|blood|test|result|fbc|ue|troponin|swab|culture|xray|x-ray|scan|ecg/i.test(lowerS)) {
      narrative.push(`Investigations reviewed: ${s}.`);
    } else {
      narrative.push(`${s}.`);
    }
  });

  // Deduplicate and write narrative
  const seen = new Set();
  narrative.forEach(line => {
    const key = line.toLowerCase().trim();
    if (!seen.has(key)) { seen.add(key); p.push(line); }
  });

  // Closing assessment
  const isPositive = /improving|better|stable|good|well|responding|clear|normal/i.test(t);
  const isNegative = /worsen|deteriorat|concern|declin|critical|unstable|severe|abnormal|complication|failing/i.test(t);

  p.push(``);
  p.push(`Patient reviewed. ${isPositive ? 'Condition appears stable and improving.' : isNegative ? 'Signs of deterioration noted — close monitoring required.' : 'Condition currently stable.'} Will continue to monitor and reassess per clinical protocol.`);

  // Plan
  let planItems = [];
  if (hasFall) planItems.push('Fall precautions in place. Assist with all transfers.');
  if (hasPain) planItems.push('Monitor pain. PRN analgesia available as ordered.');
  if (vitals.length > 0) planItems.push('Continue vital signs monitoring per protocol.');
  if (hasMeds) planItems.push('Medications administered as prescribed.');
  if (hasLabs) planItems.push('Follow up on pending investigation results.');
  if (hasNotify) planItems.push('Notify medical team if any changes.');
  planItems.push('Encourage mobility and deep breathing exercises.');
  planItems.push('Reassess next shift.');

  p.push(``);
  p.push(`Plan:`);
  planItems.forEach(item => p.push(`- ${item}`));

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
