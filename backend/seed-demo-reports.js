/**
 * Seed demo reports for testing the UI.
 * Run: node seed-demo-reports.js
 * This creates realistic reports across different patients, days, and shifts.
 */

const { initDatabase, getDatabase } = require('./database');
const { v4: uuidv4 } = require('uuid');

// Simulated synthesis functions (same as in routes/reports.js)
function synthesizeNurseNotes(transcript, patientProfile) {
  const t = transcript.trim();
  const lower = t.toLowerCase();
  const profile = patientProfile || {};

  const vitals = [];
  const bpMatch = lower.match(/(?:bp|blood pressure)\s*(?:is|of|:)?\s*(\d{2,3}\s*\/\s*\d{2,3})/i);
  if (bpMatch) vitals.push(`BP ${bpMatch[1]}`);
  const hrMatch = lower.match(/(?:hr|heart rate|pulse)\s*(?:is|of|:)?\s*(\d{2,3})/i);
  if (hrMatch) vitals.push(`HR ${hrMatch[1]}`);
  const spo2Match = lower.match(/(?:spo2|o2 sat|oxygen sat|sats)\s*(?:is|of|:)?\s*(\d{2,3})\s*%?/i);
  if (spo2Match) vitals.push(`SpO2 ${spo2Match[1]}%`);
  const tempMatch = lower.match(/(?:temp|temperature|fever)\s*(?:is|of|:)?\s*(\d{2}\.?\d*\s*°?c?)/i);
  if (tempMatch) vitals.push(`Temp ${tempMatch[1]}°C`);

  const hasPain = /pain|ache|discomfort|headache|analgesia|prn/i.test(t);
  const hasFall = /fall|fell|collapse|trip|slip|unsteady|stumble/i.test(t);
  const hasNotify = /notif|inform|call|page|doctor|dr\.|consult|review/i.test(t);
  const hasMeds = /medication|given|administer|tablet|dose|prescribed|pm|prn|IV|oral/i.test(t);

  const sentences = t.replace(/\.\s+/g, '•').split(/[!?\n]/).flatMap(s => s.split('•')).filter(s => s.trim()).map(s => s.trim());

  // Handover — short, informal, task-focused (no emojis)
  const h = [];
  sentences.forEach(s => {
    const timeIn = s.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{3,4}\s*(?:hrs?)?)/i);
    const timePrefix = timeIn ? '[' + timeIn[1] + '] ' : '';
    h.push(`${timePrefix}${s.charAt(0).toUpperCase() + s.slice(1)}`);
  });
  if (!/pending|to do|follow up|due|scheduled/i.test(t)) {
    if (hasFall) h.push(`Bed alarm ON. Assist with all transfers.`);
    if (hasPain) h.push(`Continue to monitor pain. PRN analgesia available.`);
    if (vitals.length > 0) h.push(`Continue vital signs monitoring.`);
    if (hasNotify) h.push(`Medical review pending.`);
  }

  // Progress note — chronological narrative
  const p = [];
  const entryTime = new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) + ' hrs';

  const narrative = [];
  sentences.forEach(s => {
    const lowerS = s.toLowerCase();
    if (/pain|ache|discomfort|headache|abdomen|nausea|vomit|cramp/i.test(lowerS)) {
      const cleaned = s.replace(/^(Patient\s+)?(was\s+|is\s+|has\s+)?/i, '').trim();
      narrative.push(`${entryTime}: Patient complained of ${cleaned.toLowerCase()}.`);
    } else if (/bp|blood press|hr|heart rate|spo2|temp|vitals|obs/i.test(lowerS)) {
      narrative.push(`${entryTime}: Vital signs assessed: ${s}.`);
    } else if (/given|administer|received|paracetamol|panadol|morphine|antibiotic|iv|oral|tablet|medication/i.test(lowerS)) {
      const cleaned = s.replace(/^(Patient\s+)?(was\s+|is\s+|has\s+)?/i, '').trim();
      narrative.push(`${entryTime}: ${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}. Patient tolerated well.`);
    } else if (/fall|fell|collapse|trip|slip/i.test(lowerS)) {
      narrative.push(`${entryTime}: Patient found ${s.replace(/patient\s+/i, '').toLowerCase().trim()}. Assessed for injury. No visible injury noted. Assisted back to bed. Bed alarm applied.`);
    } else if (/wound|dressing|surgical|incision|skin|ulcer|pressure|suture|bandage/i.test(lowerS)) {
      narrative.push(`${entryTime}: Wound assessed: ${s}. Dressing noted to be clean, dry, and intact.`);
    } else if (/doctor|dr\.|notif|call|page|inform|consult|review/i.test(lowerS)) {
      narrative.push(`${entryTime}: ${s}. Medical team notified of findings.`);
    } else if (/family|wife|husband|daughter|son|relatives|next of kin/i.test(lowerS)) {
      narrative.push(`${entryTime}: Family updated: ${s}.`);
    } else if (/o2|oxygen|breath|resp|nebuliser|ventilat|spo2/i.test(lowerS)) {
      narrative.push(`${entryTime}: Respiratory assessment: ${s}.`);
    } else if (/mobil|walk|ambulat|transfer|exercise|deep breath|physio|move/i.test(lowerS)) {
      narrative.push(`${entryTime}: Patient mobilised: ${s}. Encouraged deep breathing exercises and ambulation.`);
    } else if (/conscious|alert|confused|drowsy|gcs|neuro|avpu|responsive/i.test(lowerS)) {
      narrative.push(`${entryTime}: Neurological assessment: ${s}.`);
    } else if (/urine|catheter|output|renal|incontine|toilet|bathroom/i.test(lowerS)) {
      narrative.push(`${entryTime}: Genitourinary assessment: ${s}.`);
    } else if (/diet|feed|eat|drink|appetite|fluid.*intake|hydrat/i.test(lowerS)) {
      narrative.push(`${entryTime}: Encouraged oral intake and hydration: ${s}.`);
    } else if (/lab|blood|test|result|fbc|ue|troponin|swab|culture|xray|x-ray|scan|ecg/i.test(lowerS)) {
      narrative.push(`${entryTime}: Investigations reviewed: ${s}.`);
    } else {
      narrative.push(`${entryTime}: ${s}.`);
    }
  });

  const seen = new Set();
  narrative.forEach(line => {
    const key = line.toLowerCase().trim();
    if (!seen.has(key)) { seen.add(key); p.push(line); }
  });

  const isPositive = /improving|better|stable|good|well|responding|clear|normal/i.test(t);
  const isNegative = /worsen|deteriorat|concern|declin|critical|unstable|severe|abnormal|complication|failing/i.test(t);
  p.push(``);
  p.push(`Patient reviewed. ${isPositive ? 'Condition appears stable and improving.' : isNegative ? 'Signs of deterioration noted — close monitoring required.' : 'Condition currently stable.'} Will continue to monitor and reassess per clinical protocol.`);

  let planItems = [];
  if (hasFall) planItems.push('Fall precautions in place. Assist with all transfers.');
  if (hasPain) planItems.push('Monitor pain. PRN analgesia available as ordered.');
  if (vitals.length > 0) planItems.push('Continue vital signs monitoring per protocol.');
  if (hasMeds) planItems.push('Medications administered as prescribed.');
  if (hasNotify) planItems.push('Notify medical team if any changes.');
  planItems.push('Encourage mobility and deep breathing exercises.');
  planItems.push('Reassess next shift.');

  p.push(``);
  p.push(`Plan:`);
  planItems.forEach(item => p.push(`- ${item}`));

  return { handover_text: h.join('\n'), progress_note_text: p.join('\n') };
}

async function seedDemoReports() {
  await initDatabase();
  const db = getDatabase();

  const patientIds = ['pat-001', 'pat-002', 'pat-003'];
  const nurseIds = ['nurse-001', 'nurse-003', 'nurse-005'];

  // Demo transcripts
  const demos = [
    // Patient 1 - Day Shift, yesterday
    {
      patient_id: 'pat-001',
      nurse_id: 'nurse-001',
      timestamp: new Date(Date.now() - 86400000 + 3600000 * 9), // Yesterday 9am
      transcript: 'Bed 1 Tan Ah Kow complains of mild headache since waking up this morning. BP 140/85, HR 72, SpO2 98% on room air. Given Panadol 1g PO at 0900 with good effect. Blood glucose 7.2 mmol/L before breakfast. Encouraged to increase fluid intake. Family member visited in the afternoon. Will monitor BP and blood glucose levels.',
    },
    // Patient 1 - Same Day Shift, another nurse
    {
      patient_id: 'pat-001',
      nurse_id: 'nurse-003',
      timestamp: new Date(Date.now() - 86400000 + 3600000 * 14), // Yesterday 2pm
      transcript: 'Tan Ah Kow drowsy after lunch. BP 135/80, HR 76. Blood glucose 10.1 mmol/L — elevated. Doctor notified at 1430. Insulin sliding scale commenced as per protocol. Patient drowsy but rousable. Family updated on condition. Continue monitoring blood glucose 4-hourly.',
    },
    // Patient 1 - Night Shift
    {
      patient_id: 'pat-001',
      nurse_id: 'nurse-002',
      timestamp: new Date(Date.now() - 43200000 + 3600000 * 21), // Yesterday 9pm
      transcript: 'Night shift handoff received for Tan Ah Kow. Patient settled and sleeping at 2100. Blood glucose 8.5 mmol/L. Vital signs stable: BP 130/78, HR 70, SpO2 97%. Insulin sliding scale to continue. Next blood glucose check due at 0200. Call doctor if blood glucose above 15.',
    },
    // Patient 2 - Day Shift, today
    {
      patient_id: 'pat-002',
      nurse_id: 'nurse-001',
      timestamp: new Date(Date.now() - 3600000 * 3), // Today 3 hours ago
      transcript: 'Mary Lim complaining of shortness of breath on exertion. O2 sats 94% on room air, improved to 97% on 2L nasal cannula. Chest auscultation revealed mild wheeze. Given salbutamol nebuliser 5mg at 0930 with good effect. BP 145/88, HR 88, Temp 37.1°C. Doctor reviewed and ordered regular nebulisers 4-hourly and chest physiotherapy.',
    },
    // Patient 2 - Same shift, nurse adds more
    {
      patient_id: 'pat-002',
      nurse_id: 'nurse-003',
      timestamp: new Date(Date.now() - 3600000 * 1), // Today 1 hour ago
      transcript: 'Mary Lim breathing more comfortably after second nebuliser. O2 sats 96% on 2L oxygen. Chest physiotherapy done. Patient mobilised to chair with assistance for 30 minutes. Encouraged deep breathing exercises. Continue regular nebulisers and monitor O2 sats.',
    },
    // Patient 3 - Day Shift, today
    {
      patient_id: 'pat-003',
      nurse_id: 'nurse-001',
      timestamp: new Date(Date.now() - 3600000 * 5), // Today 5 hours ago
      transcript: 'Mrs Tan Mei Ling found on the floor beside her bed at approximately 1000. No visible injury. Assisted back to bed. BP 155/90, HR 82, SpO2 96%. Patient confused and disoriented to time and place. Bed alarm applied. Doctor Smith notified at 1015. Family informed. Commenced 15-minute observations for next 2 hours.',
    },
  ];

  console.log('Seeding demo reports...\n');

  for (const demo of demos) {
    const patientProfile = db.prepare('SELECT * FROM patients WHERE id = ?').get(demo.patient_id) || {};
    const result = synthesizeNurseNotes(demo.transcript, patientProfile);

    const id = uuidv4();
    const ts = demo.timestamp.toISOString();

    db.prepare(
      `INSERT INTO reports (id, patient_id, created_by_nurse_id, report_type, handover_text, progress_note_text, timestamp) VALUES (?, ?, ?, 'nurse', ?, ?, ?)`
    ).run(id, demo.patient_id, demo.nurse_id, result.handover_text, result.progress_note_text, ts);

    const nurse = db.prepare('SELECT name FROM users WHERE id = ?').get(demo.nurse_id);
    console.log(`✓ ${nurse?.name || 'Nurse'} — ${demo.patient_id} (${demo.timestamp.toLocaleString()})`);
  }

  // Create doctor's notes
  const doctorNotesData = [
    {
      patient_id: 'pat-003',
      nurse_id: 'nurse-006',
      parent_report: db.prepare(
        "SELECT id FROM reports WHERE patient_id = 'pat-003' AND report_type = 'nurse' ORDER BY timestamp ASC LIMIT 1"
      ).get()?.id || null,
      transcript: 'Patient reviewed post-fall. BP 150/88, HR 80. Neurological assessment grossly intact. No head injury or fracture detected. Ordered for physiotherapy assessment and daily review. Continue same management.',
      doctor_name: 'Dr. Michael Ong',
      timestamp: new Date(Date.now() - 3600000 * 2), // 2 hours ago
    },
    {
      patient_id: 'pat-001',
      nurse_id: 'nurse-006',
      parent_report: db.prepare(
        "SELECT id FROM reports WHERE patient_id = 'pat-001' AND report_type = 'nurse' ORDER BY timestamp ASC LIMIT 1"
      ).get()?.id || null,
      transcript: 'Patient reviewed. BP 140/85, HR 72. Blood glucose controlled at 7.2 mmol/L. Complains of headache. Ordered for regular blood glucose monitoring. Commenced on insulin sliding scale. The rest continue same.',
      doctor_name: 'Dr. Michael Ong',
      timestamp: new Date(Date.now() - 86400000 + 3600000 * 11), // Yesterday 11am
    },
    {
      patient_id: 'pat-002',
      nurse_id: 'nurse-007',
      parent_report: db.prepare(
        "SELECT id FROM reports WHERE patient_id = 'pat-002' AND report_type = 'nurse' ORDER BY timestamp ASC LIMIT 1"
      ).get()?.id || null,
      transcript: 'Patient reviewed for shortness of breath. BP 145/88, HR 88, SpO2 94% on room air. Chest auscultation reveals mild wheeze. Investigations reviewed: Chest X-ray clear. Ordered for regular nebulisers 4-hourly and chest physiotherapy. Commenced on salbutamol nebuliser 5mg PRN. The rest continue same.',
      doctor_name: 'Dr. Sarah Lim',
      timestamp: new Date(Date.now() - 3600000 * 4), // 4 hours ago
    },
  ];

  for (const dn of doctorNotesData) {
    const id = uuidv4();

    // Use the synthesis function if available, otherwise format manually
    const dateStr = dn.timestamp.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = dn.timestamp.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
    const docName = dn.doctor_name.replace(/^(Dr\.?\s*)+/i, '').trim();

    let doctorText = `${dateStr} ${timeStr}\n`;
    doctorText += `Had seen by Dr. ${docName}. `;

    const lower = dn.transcript.toLowerCase();
    const bp = (dn.transcript.match(/(?:bp|blood pressure)\s*(?:is|of|:)?\s*(\d{2,3}\s*\/\s*\d{2,3})/i) || [])[1];
    const hr = (dn.transcript.match(/(?:hr|heart rate|pulse)\s*(?:is|of|:)?\s*(\d{2,3})/i) || [])[1];
    const spo2 = (dn.transcript.match(/(?:spo2|o2 sat|sats)\s*(?:is|of|:)?\s*(\d{2,3})/i) || [])[1];
    let vitalsStr = '';
    if (bp) vitalsStr += `BP ${bp}`;
    if (hr) vitalsStr += (vitalsStr ? ', ' : '') + `HR ${hr}`;
    if (spo2) vitalsStr += (vitalsStr ? ', ' : '') + `SpO2 ${spo2}%`;

    if (vitalsStr) {
      const complaint = (dn.transcript.match(/(?:complaint?|complain|condition|presented with|c\/o|complains of)\s*[^.!?]*/i) || [])[0];
      doctorText += `Noted patient's ${vitalsStr} — ${complaint || 'Patient reviewed'}. `;
    } else {
      const firstSentence = dn.transcript.split(/\.\s|\.$/)[0]?.trim() || '';
      doctorText += `${firstSentence}. `;
    }

    if (/investigation|lab|blood\s*test|chest x-ray|ecg|fbc|ue|crp/i.test(lower)) {
      const investMatch = dn.transcript.match(/(?:investigation|lab|blood\s*(?:test|work|result)|chest\s*x-ray|ecg|fbc|U\/E|U&E|crp)\s*[^.]*/gi);
      if (investMatch) {
        const unique = [...new Set(investMatch.map(m => m.trim()))];
        doctorText += `Investigations reviewed: ${unique.slice(0, 2).join('; ')}. `;
      }
    }

    const orderIdx = lower.indexOf('ordered for');
    if (orderIdx >= 0) {
      const after = dn.transcript.substring(orderIdx + 'ordered for'.length).trim();
      const periodIdx = after.search(/\.\s|\.$/);
      const ordersStr = periodIdx >= 0 ? after.substring(0, periodIdx) : after;
      if (ordersStr) doctorText += `Ordered for ${ordersStr}. `;
    }

    const medMatch = dn.transcript.match(/(?:commence(?:d)?\s+on(?:\s*:)?\s*|start(?:ed)?\s+on(?:\s*:)?\s*)((?:[^.!?]|\.(?!\s))+(?:\.(?:\s|$))?)/i);
    if (medMatch) {
      const medsStr = medMatch[1]?.trim().replace(/\.$/, '') || '';
      if (medsStr) doctorText += `Commenced on ${medsStr}. `;
    }

    if (/continue\s+same|cont\s+same|no\s+change|unchanged/i.test(lower)) {
      doctorText += `The rest continue same.`;
    }

    db.prepare(
      `INSERT INTO reports (id, patient_id, created_by_nurse_id, parent_report_id, report_type, progress_note_text, timestamp) VALUES (?, ?, ?, ?, 'doctor', ?, ?)`
    ).run(id, dn.patient_id, dn.nurse_id, dn.parent_report, doctorText, dn.timestamp.toISOString());

    const nurse = db.prepare('SELECT name FROM users WHERE id = ?').get(dn.nurse_id);
    console.log(`✓ ${dn.doctor_name} — Note for ${dn.patient_id}`);
  }

  console.log('\n✅ Done! 7 demo reports + 3 doctor notes created across 3 patients.');
  process.exit(0);
}

seedDemoReports().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
