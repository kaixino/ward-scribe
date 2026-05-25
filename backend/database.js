const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'nursing_ward.db');

let db = null;
let dbReady = null;

/**
 * Initialise the database (async — call once at startup).
 * If a .db file already exists it is loaded; otherwise a fresh DB is created,
 * tables are built, seed data is inserted, and immediately saved to disk.
 */
async function initDatabase() {
  if (dbReady) return dbReady;

  dbReady = (async () => {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON');

    initializeTables();
    seedData();
    saveDatabase();

    // Attach helper methods so callers can use the familiar better-sqlite3 API
    // Save original references first to avoid recursion
    const _origPrepare = db.prepare.bind(db);
    const _origExec = db.exec.bind(db);
    db.prepare = wrapPrepare(_origPrepare, db);
    db.exec = wrapExec(_origExec, db);

    return db;
  })();

  return dbReady;
}

// ─── Persistence ──────────────────────────────────────────

function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Schema ───────────────────────────────────────────────

function initializeTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS wards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT 'nurse123',
      role TEXT NOT NULL DEFAULT 'RN',
      shift TEXT NOT NULL DEFAULT 'Day',
      ward_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ward_id) REFERENCES wards(id)
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bed_number TEXT NOT NULL,
      ward_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ward_id) REFERENCES wards(id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      created_by_nurse_id TEXT NOT NULL,
      edited_by_nurse_id TEXT,
      parent_report_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      report_type TEXT DEFAULT 'nurse',
      handover_text TEXT,
      progress_note_text TEXT,
      status TEXT DEFAULT 'draft',
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (created_by_nurse_id) REFERENCES users(id),
      FOREIGN KEY (edited_by_nurse_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS report_edit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      edited_by_nurse_id TEXT NOT NULL,
      previous_handover TEXT,
      previous_progress_note TEXT,
      edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id),
      FOREIGN KEY (edited_by_nurse_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS passing_over (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      from_nurse_id TEXT NOT NULL,
      target_shift TEXT NOT NULL DEFAULT 'Next',
      audio_data BLOB,
      transcript TEXT,
      summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (from_nurse_id) REFERENCES users(id)
    );
  `);
}

// ─── Seed data ────────────────────────────────────────────

function seedData() {
  const wardCount = db.exec("SELECT COUNT(*) as count FROM wards");
  if (!wardCount.length || !wardCount[0].values.length || wardCount[0].values[0][0] === 0) {
    db.run("INSERT INTO wards (id, name, description) VALUES (?, ?, ?)", [
      'ward-gw', 'General Ward', 'Adult general medical-surgical ward',
    ]);
    db.run("INSERT INTO wards (id, name, description) VALUES (?, ?, ?)", [
      'ward-icu', 'ICU', 'Intensive Care Unit',
    ]);
    db.run("INSERT INTO wards (id, name, description) VALUES (?, ?, ?)", [
      'ward-peds', 'Paediatrics', 'Children and adolescent ward',
    ]);
    db.run("INSERT INTO wards (id, name, description) VALUES (?, ?, ?)", [
      'ward-mat', 'Maternity', 'Maternal and newborn care',
    ]);
  }

  const userCount = db.exec("SELECT COUNT(*) as count FROM users");
  if (!userCount.length || !userCount[0].values.length || userCount[0].values[0][0] === 0) {
    db.run("INSERT INTO users (id, name, username, password_hash, role, shift, ward_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      'nurse-001', 'Sarah Chen', 'sarah.chen', 'nurse123', 'RN', 'Day', 'ward-gw',
    ]);
    db.run("INSERT INTO users (id, name, username, password_hash, role, shift, ward_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      'nurse-002', 'James Rodriguez', 'james.r', 'nurse123', 'RN', 'Night', 'ward-icu',
    ]);
    db.run("INSERT INTO users (id, name, username, password_hash, role, shift, ward_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      'nurse-003', 'Emily Watson', 'emily.w', 'nurse123', 'CN', 'Day', 'ward-gw',
    ]);
    db.run("INSERT INTO users (id, name, username, password_hash, role, shift, ward_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      'nurse-004', 'Dr. Priya Kumar', 'priya.k', 'nurse123', 'MO', 'Day', 'ward-peds',
    ]);
    db.run("INSERT INTO users (id, name, username, password_hash, role, shift, ward_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      'nurse-005', 'Lisa Tan', 'lisa.tan', 'nurse123', 'RN', 'Day', 'ward-mat',
    ]);
    db.run("INSERT INTO users (id, name, username, password_hash, role, shift, ward_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      'nurse-006', 'Dr. Michael Ong', 'michael.o', 'doctor123', 'Medical Officer', 'Day', 'ward-gw',
    ]);
    db.run("INSERT INTO users (id, name, username, password_hash, role, shift, ward_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      'nurse-007', 'Dr. Sarah Lim', 'sarah.l', 'doctor123', 'Consultant', 'Day', 'ward-icu',
    ]);
  }

  const patientCount = db.exec("SELECT COUNT(*) as count FROM patients");
  if (!patientCount.length || !patientCount[0].values.length || patientCount[0].values[0][0] === 0) {
    const patients = [
      // General Ward
      ['pat-001', 'Tan Ah Kow', 'Bed 1', 'ward-gw'],
      ['pat-002', 'Mary Lim', 'Bed 2', 'ward-gw'],
      ['pat-003', 'Mrs. Tan Mei Ling', 'Bed 3', 'ward-gw'],
      ['pat-004', 'Johnathan Wong', 'Bed 4', 'ward-gw'],
      ['pat-005', 'Priya Sharma', 'Bed 5', 'ward-gw'],
      ['pat-006', 'Robert Johnson', 'Bed 6', 'ward-gw'],
      // ICU
      ['pat-007', 'Mr. K. Siva', 'ICU-1', 'ward-icu'],
      ['pat-008', 'Mdm. Fatimah Ali', 'ICU-2', 'ward-icu'],
      ['pat-009', 'Mr. David Chen', 'ICU-3', 'ward-icu'],
      ['pat-010', 'Mdm. Rosie Tan', 'ICU-4', 'ward-icu'],
      // Paediatrics
      ['pat-011', 'Baby Aisha', 'Cot 1', 'ward-peds'],
      ['pat-012', 'Master Ethan Ng', 'Bed 2', 'ward-peds'],
      ['pat-013', 'Miss Lily Wong', 'Bed 3', 'ward-peds'],
      ['pat-014', 'Master Noah Lim', 'Bed 4', 'ward-peds'],
      // Maternity
      ['pat-015', 'Mdm. Siti Nurhaliza', 'Room 1', 'ward-mat'],
      ['pat-016', 'Mdm. Jane Doe', 'Room 2', 'ward-mat'],
      ['pat-017', 'Mrs. Kavitha Raj', 'Room 3', 'ward-mat'],
      ['pat-018', 'Baby Boy Raj', 'Nursery 1', 'ward-mat'],
    ];
    for (const p of patients) {
      db.run("INSERT INTO patients (id, name, bed_number, ward_id) VALUES (?, ?, ?, ?)", p);
    }
  }
}

// ─── Wrapper: make sql.js look like better-sqlite3's API ──

/**
 * Returns a `prepare()` function that mimics better-sqlite3's
 * `.prepare(sql).all() / .get() / .run()` chain.
 */
function wrapPrepare(origPrepare, sqlDb) {
  return (sql) => {
    const stmt = origPrepare(sql);

    const api = {
      /**
       * Execute a SELECT and return an array of row-objects.
       * Accepts zero or more bind parameters.
       */
      all: (...params) => {
        if (params.length > 0) {
          stmt.bind(params);
        }
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
      },

      /**
       * Execute a SELECT and return the first row (or undefined).
       * Accepts zero or more bind parameters.
       */
      get: (...params) => {
        if (params.length > 0) {
          stmt.bind(params);
        }
        let row;
        if (stmt.step()) {
          row = stmt.getAsObject();
        }
        stmt.free();
        return row;
      },

      /**
       * Execute an INSERT / UPDATE / DELETE.
       * Accepts zero or more bind parameters.
       * Returns an object with { changes }.
       */
      run: (...params) => {
        stmt.bind(params);
        stmt.step();
        stmt.free();
        saveDatabase();
        return { changes: sqlDb.getRowsModified() };
      },
    };

    return api;
  };
}

/**
 * Returns an `exec()` function that runs multi-statement SQL
 * (used for CREATE TABLE etc.) and auto-saves.
 */
function wrapExec(origExec, sqlDb) {
  return (sql) => {
    const result = origExec(sql);
    saveDatabase();
    return result;
  };
}

// ─── Public API ───────────────────────────────────────────

/**
 * Return the (already-initialised) database wrapper.
 * Call {@link initDatabase} once before using this.
 */
function getDatabase() {
  if (!db) {
    throw new Error(
      'Database not initialised. Call initDatabase() before getDatabase().'
    );
  }
  return db;
}

module.exports = { initDatabase, getDatabase };
