require("dotenv").config();
const path = require("path");
const fs   = require("fs");

async function main() {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const DB_PATH = path.resolve(process.env.DB_PATH || "./data/jds.db");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  let sqldb;
  if (fs.existsSync(DB_PATH)) {
    sqldb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    sqldb = new SQL.Database();
  }

  sqldb.run("PRAGMA foreign_keys = ON;");
  console.log("▶  Running migrations...\n");

  sqldb.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('coach','client')), full_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, age INTEGER, height_cm REAL, weight_kg REAL,
  goal TEXT CHECK(goal IN ('Fat Loss','Muscle Gain','Maintenance')), progress_pct INTEGER DEFAULT 0,
  avatar_initials TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS weight_logs (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, weight_kg REAL NOT NULL,
  logged_at TEXT NOT NULL DEFAULT (datetime('now')), note TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS workout_plans (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, coach_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Training Plan', is_active INTEGER NOT NULL DEFAULT 1, template_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS workout_days (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, day_label TEXT NOT NULL, day_focus TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY, day_id TEXT NOT NULL, name TEXT NOT NULL,
  sets INTEGER NOT NULL DEFAULT 3, reps TEXT NOT NULL DEFAULT '10',
  notes TEXT, video_url TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (day_id) REFERENCES workout_days(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS exercise_logs (
  id TEXT PRIMARY KEY, exercise_id TEXT NOT NULL, client_id TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1, logged_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS nutrition_plans (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, coach_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Nutrition Plan', calories INTEGER NOT NULL DEFAULT 2000,
  protein_g INTEGER NOT NULL DEFAULT 150, carbs_g INTEGER NOT NULL DEFAULT 200,
  fats_g INTEGER NOT NULL DEFAULT 65, is_active INTEGER NOT NULL DEFAULT 1, template_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🍽️', foods TEXT,
  calories INTEGER NOT NULL DEFAULT 0, protein_g INTEGER NOT NULL DEFAULT 0,
  carbs_g INTEGER NOT NULL DEFAULT 0, fats_g INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (plan_id) REFERENCES nutrition_plans(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, item TEXT NOT NULL,
  UNIQUE(client_id, item),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS medical_records (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('note','injury','restriction')),
  text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, uploaded_by TEXT NOT NULL,
  filename TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT,
  size_bytes INTEGER, category TEXT DEFAULT 'general',
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS templates_workout (
  id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, name TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 3, focus TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS templates_nutrition (
  id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, name TEXT NOT NULL,
  calories INTEGER NOT NULL DEFAULT 2000, protein_g INTEGER NOT NULL DEFAULT 150,
  carbs_g INTEGER NOT NULL DEFAULT 200, fats_g INTEGER NOT NULL DEFAULT 65,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
);
  `);

  fs.writeFileSync(DB_PATH, Buffer.from(sqldb.export()));
  console.log("✅  All tables created.");
  console.log("📁  Database:", DB_PATH);
  sqldb.close();
}

main().catch(e => { console.error(e); process.exit(1); });
