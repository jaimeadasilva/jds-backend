require("dotenv").config();

const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const fs       = require("fs");
const { initDb, db, save } = require("./db");

const authRoutes      = require("./routes/auth");
const clientsRoutes   = require("./routes/clients");
const workoutsRoutes  = require("./routes/workouts");
const nutritionRoutes = require("./routes/nutrition");
const medicalRoutes   = require("./routes/medical");
const templatesRoutes = require("./routes/templates");
const filesRoutes     = require("./routes/files");

const app  = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5173,*")
  .split(",").map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all in MVP
  credentials: true,
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString().slice(11,19)}  ${req.method.padEnd(7)} ${req.path}`);
  next();
});

app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR || "./uploads")));

app.use("/api/auth",      authRoutes);
app.use("/api/clients",   clientsRoutes);
app.use("/api/workouts",  workoutsRoutes);
app.use("/api/nutrition", nutritionRoutes);
app.use("/api/medical",   medicalRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/files",     filesRoutes);

app.get("/health", (_req, res) => res.json({
  status: "ok", service: "JDS Fitness API", version: "1.0.0", time: new Date().toISOString()
}));

app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: "Server error" }); });

async function runMigrateAndSeed() {
  const bcrypt = require("bcryptjs");
  const { v4: uuid } = require("uuid");

  // Check if already seeded
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get("coach@jdsclinic.com");
  if (existing) { console.log("✅  Database already seeded, skipping."); return; }

  console.log("🌱  Seeding database...");
  const now = new Date().toISOString();
  const hash = pw => bcrypt.hashSync(pw, 10);

  // Coach
  const coachId = uuid();
  db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run(coachId,"coach@jdsclinic.com",hash("Coach123!"),"coach","Dr. Da Silva",now,now);

  const clients = [
    { email:"sarah@example.com", name:"Sarah Al-Hassan", age:32, h:165, w:74, goal:"Fat Loss", prog:68, av:"SA",
      eq:["Dumbbells","Resistance Bands","Home"],
      med:[{t:"restriction",tx:"Avoid heavy lumbar flexion."}],
      days:[
        {l:"Day 1",f:"Upper Body Push",ex:[{n:"Push-Up Variations",s:3,r:"12-15",no:"Elevate hands if needed",v:""},{n:"Dumbbell Shoulder Press",s:3,r:"12",no:"",v:""},{n:"Lateral Raise",s:3,r:"15",no:"",v:""}]},
        {l:"Day 2",f:"Lower Body",ex:[{n:"Goblet Squat",s:4,r:"12",no:"",v:""},{n:"Romanian Deadlift",s:3,r:"10",no:"Hip hinge",v:""},{n:"Glute Bridge",s:3,r:"15",no:"",v:""}]},
      ],
      nut:{cal:1700,p:130,c:170,f:55,meals:[
        {n:"Breakfast",i:"🌅",fo:"Oats, egg whites, banana",cal:420,p:28,c:58,f:8},
        {n:"Lunch",i:"☀️",fo:"Grilled chicken, brown rice, salad",cal:520,p:45,c:55,f:12},
        {n:"Dinner",i:"🌙",fo:"Salmon, sweet potato, broccoli",cal:550,p:39,c:43,f:25}]}},
    { email:"mohammed@example.com", name:"Mohammed Khalil", age:28, h:178, w:82, goal:"Muscle Gain", prog:45, av:"MK",
      eq:["Barbell","Dumbbells","Machines","Gym"], med:[],
      days:[
        {l:"Day 1",f:"Chest & Triceps",ex:[{n:"Bench Press",s:4,r:"8",no:"Progressive overload",v:""},{n:"Incline Dumbbell Press",s:3,r:"10",no:"",v:""},{n:"Tricep Pushdown",s:3,r:"12",no:"",v:""}]},
        {l:"Day 2",f:"Back & Biceps",ex:[{n:"Deadlift",s:4,r:"6",no:"Heavy",v:""},{n:"Pull-Up",s:3,r:"8",no:"",v:""},{n:"Barbell Row",s:3,r:"8",no:"",v:""}]},
      ],
      nut:{cal:2800,p:180,c:310,f:75,meals:[
        {n:"Breakfast",i:"🌅",fo:"5 eggs, oats, milk",cal:720,p:45,c:80,f:22},
        {n:"Lunch",i:"☀️",fo:"Beef stir-fry, white rice",cal:780,p:52,c:90,f:22},
        {n:"Dinner",i:"🌙",fo:"Chicken pasta, olive oil",cal:560,p:31,c:43,f:15}]}},
  ];

  for (const cd of clients) {
    const cid = uuid();
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run(cid,cd.email,hash("Client123!"),"client",cd.name,now,now);
    db.prepare("INSERT INTO clients VALUES (?,?,?,?,?,?,?,?,?,?)").run(cid,coachId,cd.age,cd.h,cd.w,cd.goal,cd.prog,cd.av,now,now);
    for (const item of cd.eq) db.prepare("INSERT OR IGNORE INTO equipment VALUES (?,?,?)").run(uuid(),cid,item);
    for (const m of cd.med) db.prepare("INSERT INTO medical_records VALUES (?,?,?,?,?)").run(uuid(),cid,m.t,m.tx,now);

    const planId = uuid();
    db.prepare("INSERT INTO workout_plans VALUES (?,?,?,?,1,?,?,?)").run(planId,cid,coachId,`${cd.name.split(" ")[0]}'s Plan`,null,now,now);
    for (let di=0; di<cd.days.length; di++) {
      const day=cd.days[di]; const dayId=uuid();
      db.prepare("INSERT INTO workout_days VALUES (?,?,?,?,?,?)").run(dayId,planId,day.l,day.f,di,1);
      for (let ei=0; ei<day.ex.length; ei++) {
        const ex=day.ex[ei];
        db.prepare("INSERT INTO exercises VALUES (?,?,?,?,?,?,?,?)").run(uuid(),dayId,ex.n,ex.s,ex.r,ex.no||null,ex.v||null,ei);
      }
    }
    const nid = uuid();
    db.prepare("INSERT INTO nutrition_plans VALUES (?,?,?,?,?,?,?,?,1,?,?,?)").run(nid,cid,coachId,`${cd.name.split(" ")[0]}'s Nutrition`,cd.nut.cal,cd.nut.p,cd.nut.c,cd.nut.f,null,now,now);
    for (let mi=0; mi<cd.nut.meals.length; mi++) {
      const m=cd.nut.meals[mi];
      db.prepare("INSERT INTO meals VALUES (?,?,?,?,?,?,?,?,?,?)").run(uuid(),nid,m.n,m.i,m.fo,m.cal,m.p,m.c,m.f,mi);
    }
    console.log(`   ✅  Seeded: ${cd.name}`);
  }
  save();
  console.log("🌱  Seed complete!");
}

async function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, full_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, age INTEGER, height_cm REAL, weight_kg REAL, goal TEXT, progress_pct INTEGER DEFAULT 0, avatar_initials TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS weight_logs (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, weight_kg REAL NOT NULL, logged_at TEXT NOT NULL DEFAULT (datetime('now')), note TEXT);
    CREATE TABLE IF NOT EXISTS workout_plans (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, coach_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT 'Training Plan', is_active INTEGER NOT NULL DEFAULT 1, template_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS workout_days (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, day_label TEXT NOT NULL, day_focus TEXT, sort_order INTEGER NOT NULL DEFAULT 0, week_number INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS exercises (id TEXT PRIMARY KEY, day_id TEXT NOT NULL, name TEXT NOT NULL, sets INTEGER NOT NULL DEFAULT 3, reps TEXT NOT NULL DEFAULT '10', notes TEXT, video_url TEXT, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS exercise_logs (id TEXT PRIMARY KEY, exercise_id TEXT NOT NULL, client_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 1, logged_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS nutrition_plans (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, coach_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT 'Nutrition Plan', calories INTEGER NOT NULL DEFAULT 2000, protein_g INTEGER NOT NULL DEFAULT 150, carbs_g INTEGER NOT NULL DEFAULT 200, fats_g INTEGER NOT NULL DEFAULT 65, is_active INTEGER NOT NULL DEFAULT 1, template_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS meals (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '🍽️', foods TEXT, calories INTEGER NOT NULL DEFAULT 0, protein_g INTEGER NOT NULL DEFAULT 0, carbs_g INTEGER NOT NULL DEFAULT 0, fats_g INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS meal_logs (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, meal_id TEXT, date TEXT NOT NULL, name TEXT NOT NULL, calories INTEGER DEFAULT 0, protein_g INTEGER DEFAULT 0, carbs_g INTEGER DEFAULT 0, fats_g INTEGER DEFAULT 0, is_custom INTEGER DEFAULT 0, notes TEXT, logged_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS equipment (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, item TEXT NOT NULL, UNIQUE(client_id, item));
    CREATE TABLE IF NOT EXISTS medical_records (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, uploaded_by TEXT NOT NULL, filename TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT, size_bytes INTEGER, category TEXT DEFAULT 'general', uploaded_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS templates_workout (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, name TEXT NOT NULL, days INTEGER NOT NULL DEFAULT 3, focus TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS templates_nutrition (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, name TEXT NOT NULL, calories INTEGER NOT NULL DEFAULT 2000, protein_g INTEGER NOT NULL DEFAULT 150, carbs_g INTEGER NOT NULL DEFAULT 200, fats_g INTEGER NOT NULL DEFAULT 65, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
}

initDb().then(async () => {
  await runMigrations();
  await runMigrateAndSeed();
  app.listen(PORT, () => {
    console.log(`\n🚀  JDS Fitness API → http://localhost:${PORT}`);
    console.log(`📡  Health check  → http://localhost:${PORT}/health\n`);
  });
}).catch(err => {
  console.error("Failed to init database:", err);
  process.exit(1);
});

module.exports = app;
