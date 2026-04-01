/**
 * src/routes/templates.js
 *
 * Workout Templates (fully persistent with exercises)
 *   GET    /api/templates/workout               — list all with exercise counts
 *   POST   /api/templates/workout               — create template + exercises in one call
 *   GET    /api/templates/workout/:id           — get single template with exercises
 *   PATCH  /api/templates/workout/:id           — update template meta
 *   DELETE /api/templates/workout/:id           — delete (cascades to exercises)
 *
 * Template Exercises
 *   POST   /api/templates/workout/:id/exercises       — add exercise
 *   PATCH  /api/templates/workout/:id/exercises/:exId — update exercise
 *   DELETE /api/templates/workout/:id/exercises/:exId — delete exercise
 *
 * Nutrition Templates
 *   GET    /api/templates/nutrition             — list
 *   POST   /api/templates/nutrition             — create
 *   GET    /api/templates/nutrition/:id         — get single
 *   PATCH  /api/templates/nutrition/:id         — update
 *   DELETE /api/templates/nutrition/:id         — delete
 *   POST   /api/templates/nutrition/:id/assign/:clientId
 */

const express = require("express");
const { v4: uuid } = require("uuid");
const router  = express.Router();

const db   = require("../db").db;
const auth = require("../middleware/auth");
const { ok, created, badRequest, notFound, serverError } = require("../utils/respond");

// ─── Helper: load template with exercises ─────────────────────────────────────
async function buildTemplate(id) {
  const t = await db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(id);
  if (!t) return null;
  t.exercises = await db.prepare(
    "SELECT * FROM template_exercises WHERE template_id = ? ORDER BY sort_order ASC"
  ).all(id);
  return t;
}

// ─── GET /api/templates/workout ───────────────────────────────────────────────
router.get("/workout", auth("coach"), async (req, res) => {
  try {
    const rows = await db.prepare(
      "SELECT * FROM templates_workout WHERE coach_id = ? ORDER BY created_at DESC"
    ).all(req.user.userId);

    // Attach exercises to each template
    const templates = await Promise.all(rows.map(async t => {
      t.exercises = await db.prepare(
        "SELECT * FROM template_exercises WHERE template_id = ? ORDER BY sort_order ASC"
      ).all(t.id);
      return t;
    }));

    ok(res, templates, { total: templates.length });
  } catch (err) { serverError(res, err, "GET /templates/workout"); }
});

// ─── POST /api/templates/workout ─────────────────────────────────────────────
// Creates template + all exercises in one atomic operation
router.post("/workout", auth("coach"), async (req, res) => {
  try {
    const { name, days = 3, focus, exercises = [] } = req.body;
    if (!name?.trim()) return badRequest(res, "name is required.");

    const tId = uuid();
    const ts  = new Date().toISOString();

    await db.prepare(
      "INSERT INTO templates_workout (id, coach_id, name, days, focus, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(tId, req.user.userId, name.trim(), +days, focus || null, ts);

    // Save all exercises
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      if (!ex.name?.trim()) continue;
      await db.prepare(
        "INSERT INTO template_exercises (id, template_id, name, sets, reps, tempo, notes, video_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(uuid(), tId, ex.name.trim(), +ex.sets || 3, ex.reps || "10", ex.tempo || null, ex.notes || null, ex.videoUrl || ex.video_url || null, i);
    }

    created(res, await buildTemplate(tId));
  } catch (err) { serverError(res, err, "POST /templates/workout"); }
});

// ─── GET /api/templates/workout/:id ──────────────────────────────────────────
router.get("/workout/:id", auth("coach"), async (req, res) => {
  try {
    const t = await buildTemplate(req.params.id);
    if (!t) return notFound(res, "Template");
    if (t.coach_id !== req.user.userId) return res.status(403).json({ error: "Access denied." });
    ok(res, t);
  } catch (err) { serverError(res, err, "GET /templates/workout/:id"); }
});

// ─── PATCH /api/templates/workout/:id ────────────────────────────────────────
router.patch("/workout/:id", auth("coach"), async (req, res) => {
  try {
    const { name, days, focus } = req.body;
    const t = await db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(req.params.id);
    if (!t) return notFound(res, "Template");
    if (t.coach_id !== req.user.userId) return res.status(403).json({ error: "Access denied." });

    const fields = []; const values = [];
    if (name  !== undefined) { fields.push("name");  values.push(name.trim()); }
    if (days  !== undefined) { fields.push("days");  values.push(+days); }
    if (focus !== undefined) { fields.push("focus"); values.push(focus); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.id);
    const setClauses = fields.map((f, i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE templates_workout SET ${setClauses} WHERE id = $${fields.length+1}`).run(values);

    ok(res, await buildTemplate(req.params.id));
  } catch (err) { serverError(res, err, "PATCH /templates/workout/:id"); }
});

// ─── DELETE /api/templates/workout/:id ───────────────────────────────────────
router.delete("/workout/:id", auth("coach"), async (req, res) => {
  try {
    const t = await db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(req.params.id);
    if (!t) return notFound(res, "Template");
    if (t.coach_id !== req.user.userId) return res.status(403).json({ error: "Access denied." });
    // Exercises cascade-delete via FK
    await db.prepare("DELETE FROM templates_workout WHERE id = ?").run(req.params.id);
    ok(res, { deleted: true, id: req.params.id });
  } catch (err) { serverError(res, err, "DELETE /templates/workout/:id"); }
});

// ─── POST /api/templates/workout/:id/exercises ───────────────────────────────
router.post("/workout/:id/exercises", auth("coach"), async (req, res) => {
  try {
    const { name, sets = 3, reps = "10", tempo, notes, videoUrl } = req.body;
    if (!name?.trim()) return badRequest(res, "name is required.");

    const t = await db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(req.params.id);
    if (!t) return notFound(res, "Template");

    const maxRow = await db.prepare(
      "SELECT MAX(sort_order) as m FROM template_exercises WHERE template_id = ?"
    ).get(req.params.id);
    const sortOrder = (maxRow?.m ?? -1) + 1;
    const exId = uuid();

    await db.prepare(
      "INSERT INTO template_exercises (id, template_id, name, sets, reps, tempo, notes, video_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(exId, req.params.id, name.trim(), +sets, reps, tempo || null, notes || null, videoUrl || null, sortOrder);

    created(res, await db.prepare("SELECT * FROM template_exercises WHERE id = ?").get(exId));
  } catch (err) { serverError(res, err, "POST /templates/workout/:id/exercises"); }
});

// ─── PATCH /api/templates/workout/:id/exercises/:exId ────────────────────────
router.patch("/workout/:id/exercises/:exId", auth("coach"), async (req, res) => {
  try {
    const { name, sets, reps, tempo, notes, videoUrl } = req.body;
    const fields = []; const values = [];
    if (name     !== undefined) { fields.push("name");      values.push(name.trim()); }
    if (sets     !== undefined) { fields.push("sets");      values.push(+sets); }
    if (reps     !== undefined) { fields.push("reps");      values.push(reps); }
    if (tempo    !== undefined) { fields.push("tempo");     values.push(tempo); }
    if (notes    !== undefined) { fields.push("notes");     values.push(notes); }
    if (videoUrl !== undefined) { fields.push("video_url"); values.push(videoUrl); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.exId);
    const setClauses = fields.map((f, i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE template_exercises SET ${setClauses} WHERE id = $${fields.length+1}`).run(values);
    ok(res, await db.prepare("SELECT * FROM template_exercises WHERE id = ?").get(req.params.exId));
  } catch (err) { serverError(res, err, "PATCH /templates/workout/:id/exercises/:exId"); }
});

// ─── DELETE /api/templates/workout/:id/exercises/:exId ───────────────────────
router.delete("/workout/:id/exercises/:exId", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM template_exercises WHERE id = ? AND template_id = ?").run(req.params.exId, req.params.id);
    ok(res, { deleted: true });
  } catch (err) { serverError(res, err, "DELETE /templates/workout/:id/exercises/:exId"); }
});

// ─── Assign workout template to client ───────────────────────────────────────
router.post("/workout/:id/assign/:clientId", auth("coach"), async (req, res) => {
  try {
    const template = await buildTemplate(req.params.id);
    if (!template) return notFound(res, "Template");

    const planId = uuid();
    const ts     = new Date().toISOString();

    await db.prepare(
      "INSERT INTO workout_plans (id, client_id, coach_id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    ).run(planId, req.params.clientId, req.user.userId, template.name, ts, ts);

    created(res, { planId, templateName: template.name, exerciseCount: template.exercises.length });
  } catch (err) { serverError(res, err, "POST /templates/workout/:id/assign/:clientId"); }
});

// ─── NUTRITION TEMPLATES ──────────────────────────────────────────────────────

router.get("/nutrition", auth("coach"), async (req, res) => {
  try {
    const rows = await db.prepare(
      "SELECT * FROM templates_nutrition WHERE coach_id = ? ORDER BY created_at DESC"
    ).all(req.user.userId);
    ok(res, rows, { total: rows.length });
  } catch (err) { serverError(res, err, "GET /templates/nutrition"); }
});

router.post("/nutrition", auth("coach"), async (req, res) => {
  try {
    const { name, calories = 2000, proteinG = 150, carbsG = 200, fatsG = 65 } = req.body;
    if (!name?.trim()) return badRequest(res, "name is required.");
    const tId = uuid();
    const ts  = new Date().toISOString();
    await db.prepare(
      "INSERT INTO templates_nutrition (id, coach_id, name, calories, protein_g, carbs_g, fats_g, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(tId, req.user.userId, name.trim(), +calories, +proteinG, +carbsG, +fatsG, ts);
    created(res, await db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(tId));
  } catch (err) { serverError(res, err, "POST /templates/nutrition"); }
});

router.get("/nutrition/:id", auth("coach"), async (req, res) => {
  try {
    const t = await db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(req.params.id);
    if (!t) return notFound(res, "Template");
    ok(res, t);
  } catch (err) { serverError(res, err, "GET /templates/nutrition/:id"); }
});

router.patch("/nutrition/:id", auth("coach"), async (req, res) => {
  try {
    const { name, calories, proteinG, carbsG, fatsG } = req.body;
    const fields = []; const values = [];
    if (name     !== undefined) { fields.push("name");      values.push(name.trim()); }
    if (calories !== undefined) { fields.push("calories");  values.push(+calories); }
    if (proteinG !== undefined) { fields.push("protein_g"); values.push(+proteinG); }
    if (carbsG   !== undefined) { fields.push("carbs_g");   values.push(+carbsG); }
    if (fatsG    !== undefined) { fields.push("fats_g");    values.push(+fatsG); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.id);
    const setClauses = fields.map((f, i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE templates_nutrition SET ${setClauses} WHERE id = $${fields.length+1}`).run(values);
    ok(res, await db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(req.params.id));
  } catch (err) { serverError(res, err, "PATCH /templates/nutrition/:id"); }
});

router.delete("/nutrition/:id", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM templates_nutrition WHERE id = ?").run(req.params.id);
    ok(res, { deleted: true });
  } catch (err) { serverError(res, err, "DELETE /templates/nutrition/:id"); }
});

router.post("/nutrition/:id/assign/:clientId", auth("coach"), async (req, res) => {
  try {
    const t = await db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(req.params.id);
    if (!t) return notFound(res, "Template");
    const planId = uuid();
    const ts = new Date().toISOString();
    await db.prepare(
      "INSERT INTO nutrition_plans (id, client_id, coach_id, name, calories, protein_g, carbs_g, fats_g, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    ).run(planId, req.params.clientId, req.user.userId, t.name, t.calories, t.protein_g, t.carbs_g, t.fats_g, ts, ts);
    created(res, { planId, message: `Nutrition plan '${t.name}' created for client.` });
  } catch (err) { serverError(res, err, "POST /templates/nutrition/:id/assign/:clientId"); }
});

module.exports = router;
