require("dotenv").config();

const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const { initDb } = require("./db");

const authRoutes      = require("./routes/auth");
const clientsRoutes   = require("./routes/clients");
const workoutsRoutes  = require("./routes/workouts");
const nutritionRoutes = require("./routes/nutrition");
const medicalRoutes   = require("./routes/medical");
const templatesRoutes = require("./routes/templates");
const filesRoutes     = require("./routes/files");

const app  = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5173")
  .split(",").map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error("CORS blocked")),
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

// Init DB first, THEN start listening
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀  JDS Fitness API → http://localhost:${PORT}`);
    console.log(`📡  Health check  → http://localhost:${PORT}/health\n`);
  });
}).catch(err => {
  console.error("Failed to init database:", err);
  process.exit(1);
});

module.exports = app;
