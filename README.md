# FleetPulse: Vehicle Process Management System

A simple, professional, mobile-friendly **Vehicle Process Management System** built for a transport company.
Designed specifically for a single **Process Handler** managing fleet records, daily vehicle operations, stoppages, problem follow-ups, and electronic compliance reporting without requiring drivers to operate the system.

---

## 🌟 Key Capabilities & Modules

1. **Operations Dashboard (`/api/dashboard/stats`)**
   - Live non-hardcoded KPI statistics: Total Registered Vehicles, Currently Operating, Stopped, Under Maintenance, Open Problems, Urgent Incidents, and Stoppages Exceeding Threshold (&gt; 3 days).
   - Interactive charts: Fleet Status Distribution, Stoppage Reasons breakdown, Daily Activity Breakdown, and Problem Categories.
   - Live tables: Recently Updated Vehicles with current location and Recent Problem Reports.

2. **Vehicle Master Management (`/api/vehicles`)**
   - Complete fleet master records: Vehicle ID, Registration Number (normalized & strictly unique), Owner Name, Vehicle Type (Twelve Wheeler, Fourteen Wheeler, Trailers, etc.), Model (e.g. 2012, 2018), Manufacturer (Mahindra Navistar, Eicher Motors Ltd, etc.), and Operational Status.
   - **Bulk Vehicle Import**: Upload Excel (`.xlsx`, `.xls`) or CSV (`.csv`) spreadsheets with automated column mapping, duplicate detection, and live validation preview.
   - **Download Sample Template**: 1-click download of ready-to-fill sample template (`Vehicle_Import_Sample_Template.xlsx`) matching company fleet format (`#`, `Registration Number`, `Owner Name`, `Vehicle Type`, `Model`, `Manufacturer`, `Operational Status`).
   - Dynamic Vehicle Type configuration tool to add new vehicle types.
   - Search by registration number, owner name, model, manufacturer, and filter by status and type.

3. **Daily Vehicle Operations (`/api/activities`)**
   - Quick-entry interface with large touch-friendly buttons for fast logging with minimal typing:
     - `Travelling`, `Halting`, `Loading`, `Unloading`, `Waiting`, `Maintenance`, `Breakdown`, `Other`.
   - Auto-retrieves vehicle type and model directly from the Vehicle Master upon selection.
   - Optional Voice Input (Speech-to-Text) with transcription editing modal before saving.
   - Optional Incident / Cargo Photo Attachment with instant preview.
   - Chronological daily operational activity timeline.

4. **Vehicle Problem Management (`/api/problems`)**
   - Problem categories: Tyre, Engine, Battery, Brake, Accident/Safety, Delay, Document, Driver, Other.
   - Priority levels: Urgent, High, Medium, Low.
   - Unresolved problems automatically sorted first with urgent incidents highlighted.
   - Action Taken updates and technician/garage assignment.
   - Explicit Confirmation Resolution Workflow: requires resolution notes and verified confirmation checkbox before marking tickets `Resolved`.
   - Complete chronological Audit History timeline of every change.

5. **Vehicle Stoppage Tracking (`/api/stoppages`)**
   - Automated duration calculations:
     - Ongoing Stoppage: Elapsed time between start and current time (`now - start`).
     - Completed Stoppage: Elapsed time between start and actual restart time (`restart - start`).
     - Displays formatted elapsed time in `days` and `hours`.
   - Strict business rules:
     - Prevents duplicate active/ongoing stoppages for the same vehicle.
     - Separates normal halting, driver rest, and loading/unloading delays from mechanical breakdowns.
     - Links optionally to Vehicle Problem tickets.
     - Allows date corrections with validation (start time cannot be in the future; restart time cannot precede start time).

6. **Electronic Reports & Multi-Format Export (`/api/reports`)**
   - Front-and-center compliance reporting with all 6 required transport columns:
     1. `Vehicle Number`
     2. `Vehicle Type`
     3. `Vehicle Model`
     4. `Location`
     5. `Number of Days Stopped`
     6. `Reason for Stoppage`
   - Useful optional columns: `Report Date`, `Last Activity`, `Stoppage Start Date`, `Problem Description`, `Action Taken`, `Responsible Person`, `Resolution Status`, `Expected Restart Date`, `Actual Restart Date`.
   - 7 Specialized Report Views:
     1. Current Vehicle Stoppages
     2. Resolved Stoppages
     3. Vehicle Master
     4. Daily Vehicle Operations
     5. Vehicle Problems
     6. Long-Pending Problems
     7. Historical Vehicle Activity
   - 1-Click Export to Excel (`.xlsx`) via SheetJS (`xlsx`).
   - 1-Click Export to PDF with professional branding and tables via `jspdf` & `jspdf-autotable`.

7. **Voice & Accessibility Features**
   - Web Speech API integration supporting English (`en-IN` / `en-US`) and Kannada (`kn-IN`).
   - Text-to-Speech audio read-back for hands-free confirmation.
   - Graceful fallback: clear helper message letting the handler type manually if microphone access is unavailable.

8. **In-Application Alerts & System Settings (`/api/dashboard/alerts`, `/api/settings`)**
   - Real-time slide-out Alert Drawer for urgent incidents, long-pending stoppages (&gt; 3 days), and approaching restart deadlines.
   - Configurable stoppage threshold (default 3 days).
   - 1-Click Database Disaster Recovery Backup (`.db` download).
   - Security Audit Trail logging all updates, logins, and resolutions.

---

## 🛠️ Technology Stack

- **Backend**: Node.js & Express REST API (`server/`)
- **Database**: SQLite with `better-sqlite3` (ACID transactions, foreign keys, WAL mode, zero configuration)
- **Frontend**: Vite + React SPA with custom Vanilla CSS Transport Design System (`client/`)
- **Icons**: Lucide React
- **Exporting**: SheetJS (`xlsx`), `jspdf`, `jspdf-autotable`
- **File Storage**: Local Multer disk storage (`uploads/`)

---

## 🚀 Step-by-Step Setup Instructions for Beginners

### 1. Prerequisites
- Node.js (v18 or higher; tested on v22.19.0)
- NPM (v9 or higher; tested on 10.9.3)

### 2. Installation
Open PowerShell or your command terminal in the project directory:
```powershell
# Install root backend dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### 3. Running the Application

You can run the application in two ways:

#### Option A: Single Unified Production Server (Recommended)
Build the frontend once and start the backend (which serves the entire application and API on port 5000):
```powershell
# 1. Build frontend
npm run build

# 2. Start server
npm run server
```
Then open your browser at:
👉 **`http://localhost:5000`**

#### Option B: Concurrent Development Mode
Runs both backend API (port 5000) and Vite hot-reloading dev server (port 3000):
```powershell
npm run dev
```
Then open your browser at:
👉 **`http://localhost:3000`**

---

## 🔑 Default Login Credentials

- **Username**: `handler`
- **Password**: `admin123`
*(A quick one-click login helper is also provided on the sign-in screen for convenience)*

---

## 🧪 Running Automated Tests

Run the comprehensive Section 15 compliance test suite:
```powershell
npm test
```
This tests all 17 requirements:
- Process handler authentication
- Adding 25 ft and 40 ft vehicles
- Uniqueness validation and duplicate registration rejection
- Loading, unloading, and normal halting classification
- Text-only and photo-attached problem tickets
- Stoppage tracking and automated duration calculations (days & hours)
- Duplicate active stoppage prevention
- Problem lifecycle and explicit confirmation resolution
- Electronic reports compliance columns and Excel `.xlsx` generation
- Non-hardcoded live database calculations
