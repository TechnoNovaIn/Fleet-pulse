-- Vehicle Process Management System Schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'process_handler',
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number TEXT UNIQUE NOT NULL COLLATE NOCASE,
  owner_name TEXT,
  vehicle_type TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  capacity TEXT,
  operational_status TEXT DEFAULT 'Operating',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  report_datetime DATETIME NOT NULL,
  location TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME,
  description TEXT,
  photo_url TEXT,
  reported_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vehicle_problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  reported_datetime DATETIME NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  photo_url TEXT,
  reported_by TEXT,
  assigned_to TEXT,
  action_taken TEXT,
  resolution_notes TEXT,
  resolution_datetime DATETIME,
  status TEXT DEFAULT 'Open',
  priority TEXT DEFAULT 'Medium',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS problem_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  action_taken TEXT,
  notes TEXT,
  updated_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (problem_id) REFERENCES vehicle_problems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vehicle_stoppages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  start_datetime DATETIME NOT NULL,
  location TEXT NOT NULL,
  reason TEXT NOT NULL,
  related_problem_id INTEGER,
  action_taken TEXT,
  expected_restart_datetime DATETIME,
  actual_restart_datetime DATETIME,
  status TEXT DEFAULT 'Ongoing',
  remarks TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (related_problem_id) REFERENCES vehicle_problems(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id INTEGER,
  details TEXT,
  user_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance and searchability
CREATE INDEX IF NOT EXISTS idx_vehicles_reg ON vehicles(reg_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(operational_status);
CREATE INDEX IF NOT EXISTS idx_activities_vehicle ON daily_activities(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_activities_datetime ON daily_activities(report_datetime);
CREATE INDEX IF NOT EXISTS idx_problems_vehicle ON vehicle_problems(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_problems_status ON vehicle_problems(status);
CREATE INDEX IF NOT EXISTS idx_problems_priority ON vehicle_problems(priority);
CREATE INDEX IF NOT EXISTS idx_stoppages_vehicle ON vehicle_stoppages(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_stoppages_status ON vehicle_stoppages(status);
