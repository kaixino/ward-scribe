/**
 * One-off cleanup: normalises existing report text to remove duplicated
 * [HH:MM AM/PM] timestamp markers that were embedded by the old synthesis
 * logic (RecordingPanel + backend each added a time, causing repeats).
 *
 * - Handover report: strips all bracketed time markers (view shows time per line).
 * - Progress note:   strips all bracketed markers and keeps a single
 *                    [time] header at the top of the block.
 *
 * Run: node cleanup-times.js
 */
const { initDatabase, getDatabase } = require('./database');

const TIME_MARKER = /\s*\[[^\]]*\]\s*/g;
const FIRST_TIME = /(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;

function cleanHandover(text) {
  if (!text) return null;
  const lines = text
    .split('\n')
    .map(l => l.replace(TIME_MARKER, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const cleaned = lines.join('\n');
  return cleaned !== text ? cleaned : null;
}

function cleanProgress(text) {
  if (!text) return null;
  const lines = text
    .split('\n')
    .map(l => l.replace(TIME_MARKER, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const firstTime = (text.match(FIRST_TIME) || [])[1];
  let cleaned = lines.join('\n');
  if (firstTime) cleaned = `[${firstTime}]\n${cleaned}`;
  return cleaned !== text ? cleaned : null;
}

async function main() {
  await initDatabase();
  const db = getDatabase();
  const reports = db.prepare('SELECT id, handover_text, progress_note_text FROM reports').all();
  let updated = 0;

  for (const r of reports) {
    const newHandover = cleanHandover(r.handover_text);
    const newProgress = cleanProgress(r.progress_note_text);
    if (newHandover || newProgress) {
      db.prepare('UPDATE reports SET handover_text = ?, progress_note_text = ? WHERE id = ?')
        .run(newHandover ?? r.handover_text, newProgress ?? r.progress_note_text, r.id);
      updated++;
    }
  }

  console.log(`Cleaned ${updated} of ${reports.length} reports.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
