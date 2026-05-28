# WardScribe — AI-Powered Nursing Documentation

A full-stack web application for transforming raw nurse audio transcriptions into structured **Handover Reports** and **Official Progress Notes** using AI synthesis.

## Features

-  Voice-to-Text & Manual Entry** — Dictate or type nurse verbal reports
-  AI Synthesis Engine** — Automatically splits transcripts into SBAR handover and SOAP progress notes
-  Bed Dashboard** — Ward overview with patient bed cards and report status indicators (amber = pending, green = signed)
-  Dual Report View** — Side-by-side Handover Report (practical/temporary) and Official Progress Note (formal/legal)
-  Inline Editing with Audit Trail** — Full edit history tracking: every change is logged with nurse ID and timestamp
-  Approve & Sign** — One-click sign-off workflow
-  Calm Tech Aesthetic** — Soft eucalyptus greens, slate grays, muted blues — designed for high-stress clinical environments

## Tech Stack

| Layer     | Technology                |
|-----------|---------------------------|
| Frontend  | React 18 + Vite           |
| Backend   | Node.js + Express         |
| Database  | SQLite (better-sqlite3)   |
| Icons     | Lucide React              |
| Font      | Inter (Google Fonts)      |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│  React SPA  │────▶│  Express API │────▶│  SQLite  │
│  (Vite)     │     │  (port 3001) │     │  (local) │
└─────────────┘     └──────────────┘     └──────────┘
       │                    │
       │  /api/patients     │  Users, Patients,
       │  /api/reports      │  Reports, EditHistory
       │  /api/nurses       │
```

### Database Schema

- **users** — Nurse ID, name, role, shift
- **patients** — Patient ID, name, bed number, ward
- **reports** — Links patient ↔ nurse, stores handover + progress note text, tracks edits
- **report_edit_history** — Full audit trail of all changes

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Quick Start (One Click)

**Double-click** `start.bat` in the project folder — it opens two terminal windows:
- One for the **backend** (port 3001)
- One for the **frontend** (port 5173)

Or right-click `start.ps1` → **Run with PowerShell**.

### Manual Start (Two Terminals)

**Terminal 1 — Backend:**
```bash
cd backend
node server.js
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npx vite --host
```

### If it "Failed to Load"

The servers stop when you close the terminal windows. Simply re-run one of the methods above.

| Server    | URL                      | Port |
|-----------|--------------------------|------|
| Frontend  | http://localhost:5173     | 5173 |
| Backend   | http://localhost:3001     | 3001 |

### Install Dependencies (first time only)

```bash
cd backend && npm install
cd ../frontend && npm install
```

## API Endpoints

| Method | Endpoint                        | Description                        |
|--------|---------------------------------|------------------------------------|
| GET    | `/api/patients`                 | List all patients                  |
| GET    | `/api/nurses`                   | List all nurses                    |
| GET    | `/api/patients/:id/reports`     | Get latest report for a patient    |
| POST   | `/api/reports`                  | Create report from transcript      |
| PUT    | `/api/reports/:id`              | Update report (with audit trail)   |
| GET    | `/api/reports/:id/history`      | Get edit history for a report      |

## Usage Flow

1. **Dashboard** → Select a patient bed card
2. **Recording** → Dictate (mic button) or type the verbal report
3. **Synthesis** → AI generates Handover Report + Progress Note
4. **Review** → Edit inline, view history, then **Approve & Sign**
5. **Audit** → Every edit is logged with nurse identity and timestamp
