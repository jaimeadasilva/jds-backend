require("dotenv").config();

const express  = require("express");
const cors     = require("cors");
const { initDb, db } = require("./db");

const authRoutes      = require("./routes/auth");
const clientsRoutes   = require("./routes/clients");
const workoutsRoutes  = require("./routes/workouts");
const nutritionRoutes = require("./routes/nutrition");
const medicalRoutes   = require("./routes/medical");
const templatesRoutes = require("./routes/templates");
const filesRoutes     = require("./routes/files");

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth",      authRoutes);
app.use("/api/clients",   clientsRoutes);
app.use("/api/workouts",  workoutsRoutes);
app.use("/api/nutrition", nutritionRoutes);
app.use("/api/medical",   medicalRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/files",     filesRoutes);
app.get("/health", (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── Schema Migration (safe — CREATE TABLE IF NOT EXISTS) ─────────────────────
async function migrate() {
  console.log("🔧  Running schema migration...");
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      full_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      coach_id TEXT NOT NULL,
      age INTEGER,
      height_cm NUMERIC,
      weight_kg NUMERIC,
      goal TEXT NOT NULL DEFAULT 'Fat Loss',
      progress_pct INTEGER NOT NULL DEFAULT 0,
      avatar_initials TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS weight_logs (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weight_kg NUMERIC NOT NULL,
      note TEXT,
      logged_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workout_plans (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Training Plan',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workout_days (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
      day_label TEXT NOT NULL,
      day_focus TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      week_number INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      day_id TEXT NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sets INTEGER NOT NULL DEFAULT 3,
      reps TEXT NOT NULL DEFAULT '10',
      tempo TEXT,
      notes TEXT,
      video_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS exercise_logs (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      logged_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS nutrition_plans (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Nutrition Plan',
      calories INTEGER NOT NULL DEFAULT 2000,
      protein_g INTEGER NOT NULL DEFAULT 150,
      carbs_g INTEGER NOT NULL DEFAULT 200,
      fats_g INTEGER NOT NULL DEFAULT 65,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '🍽️',
      foods TEXT,
      calories INTEGER NOT NULL DEFAULT 0,
      protein_g INTEGER NOT NULL DEFAULT 0,
      carbs_g INTEGER NOT NULL DEFAULT 0,
      fats_g INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS meal_logs (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meal_id TEXT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      calories INTEGER DEFAULT 0,
      protein_g INTEGER DEFAULT 0,
      carbs_g INTEGER DEFAULT 0,
      fats_g INTEGER DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      notes TEXT,
      logged_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    )`,
    `CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS medical_records (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'note',
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      category TEXT DEFAULT 'general',
      uploaded_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS templates_workout (
      id TEXT PRIMARY KEY,
      coach_id TEXT NOT NULL,
      name TEXT NOT NULL,
      days INTEGER NOT NULL DEFAULT 3,
      focus TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS template_exercises (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES templates_workout(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sets INTEGER NOT NULL DEFAULT 3,
      reps TEXT NOT NULL DEFAULT '10',
      tempo TEXT,
      notes TEXT,
      video_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_template_exercises ON template_exercises(template_id)`,
    `CREATE TABLE IF NOT EXISTS templates_nutrition (
      id TEXT PRIMARY KEY,
      coach_id TEXT NOT NULL,
      name TEXT NOT NULL,
      calories INTEGER NOT NULL DEFAULT 2000,
      protein_g INTEGER NOT NULL DEFAULT 150,
      carbs_g INTEGER NOT NULL DEFAULT 200,
      fats_g INTEGER NOT NULL DEFAULT 65,
      created_at TEXT NOT NULL
    )`,
    // Indexes for performance
    `CREATE INDEX IF NOT EXISTS idx_clients_coach ON clients(coach_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workout_plans_client ON workout_plans(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workout_days_plan ON workout_days(plan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_exercises_day ON exercises(day_id)`,
    `CREATE INDEX IF NOT EXISTS idx_exercise_logs_client ON exercise_logs(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_nutrition_plans_client ON nutrition_plans(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_meals_plan ON meals(plan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_meal_logs_client ON meal_logs(client_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_weight_logs_client ON weight_logs(client_id)`,
  ];

  for (const sql of statements) {
    await db.exec(sql);
  }
  console.log("✅  Schema migration complete");
}

// ─── Seed (only if empty) ─────────────────────────────────────────────────────
async function seedIfEmpty() {
  const existing = await db.prepare("SELECT id FROM users WHERE email = $1").get("coach@jdsclinic.com");
  if (existing) {
    console.log("✅  Database already has data — skipping seed");
    return;
  }

  console.log("🌱  Seeding demo data...");
  const bcrypt = require("bcryptjs");
  const { v4: uuid } = require("uuid");
  const ts = new Date().toISOString();

  // Coach
  const coachId = uuid();
  await db.prepare("INSERT INTO users (id,email,password_hash,role,full_name,created_at,updated_at) VALUES (?,?,?,'coach','Dr. Jaime Da Silva',?,?)")
    .run(coachId, "coach@jdsclinic.com", bcrypt.hashSync("Coach123!", 10), ts, ts);

  // Demo clients
  const clients = [
    { name:"Sarah Al-Hassan",    email:"sarah@example.com",    age:28, h:165, w:68,  goal:"Fat Loss" },
    { name:"Mohammed Al-Rashid", email:"mohammed@example.com", age:35, h:178, w:82,  goal:"Muscle Gain" },
    { name:"Layla Nasser",       email:"layla@example.com",    age:26, h:162, w:58,  goal:"Maintenance" },
    { name:"Carlos Mendez",      email:"carlos@example.com",   age:42, h:175, w:90,  goal:"Fat Loss" },
  ];

  for (const c of clients) {
    const cId  = uuid();
    const init = c.name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
    await db.prepare("INSERT INTO users (id,email,password_hash,role,full_name,created_at,updated_at) VALUES (?,?,?,'client',?,?,?)")
      .run(cId, c.email, bcrypt.hashSync("Client123!", 10), c.name, ts, ts);
    await db.prepare("INSERT INTO clients (id,coach_id,age,height_cm,weight_kg,goal,progress_pct,avatar_initials,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(cId, coachId, c.age, c.h, c.w, c.goal, Math.floor(Math.random()*60)+20, init, ts, ts);
    // Initial weight log
    await db.prepare("INSERT INTO weight_logs (id,client_id,weight_kg,logged_at) VALUES (?,?,?,?)")
      .run(uuid(), cId, c.w, ts);
  }

  console.log("✅  Seed complete — 1 coach + 4 clients");
}

// ─── Startup ──────────────────────────────────────────────────────────────────
initDb().then(async () => {
  await migrate();
  await seedIfEmpty();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀  JDS backend running on port ${PORT}`);
  });
}).catch(err => {
  console.error("❌  Startup failed:", err.message);
  process.exit(1);
});
