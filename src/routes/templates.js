/**
 * src/routes/templates.js
 *
 * Workout Templates
 *   GET    /api/templates/workout               — list coach's workout templates
 *   POST   /api/templates/workout               — create template
 *   PATCH  /api/templates/workout/:id           — update template
 *   DELETE /api/templates/workout/:id           — delete template
 *   POST   /api/templates/workout/:id/assign/:clientId  — assign template → creates a plan for client
 *
 * Nutrition Templates
 *   GET    /api/templates/nutrition             — list
 *   POST   /api/templates/nutrition             — create
 *   PATCH  /api/templates/nutrition/:id         — update
 *   DELETE /api/templates/nutrition/:id         — delete
 *   POST   /api/templates/nutrition/:id/assign/:clientId
 */

const express = require("express");
const { v4: uuid } = require("uuid");
const router  = express.Router();

const db   = require("../db").db;
const auth = require("../middleware/auth");
const { ok, created, badRequest, serverError } = require("../utils/respond");

// ──────────────────────────────────────────────────────────────────────────────
// WORKOUT TEMPLATES
// ──────────────────────────────────────────────────────────────────────────────

router.get("/workout", auth("coach"), (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT * FROM templates_workout WHERE coach_id = ? ORDER BY created_at DESC"
    ).all(req.user.userId);
    ok(res, rows, { total: rows.length });
  } catch (err) {
    serverError(res, err, "GET /templates/workout");
  }
});

router.post("/workout", auth("coach"), (req, res) => {
  try {
    const { name, days = 3, focus } = req.body;
    if (!name) return badRequest(res, "name is required.");
    const tId = uuid();
    const ts  = new Date().toISOString();
    db.prepare(
      "INSERT INTO templates_workout (id, coach_id, name, days, focus, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(tId, req.user.userId, name, days, focus || null, ts);
    created(res, db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(tId));
  } catch (err) {
    serverError(res, err, "POST /templates/workout");
  }
});

router.patch("/workout/:id", auth("coach"), (req, res) => {
  try {
    const { name, days, focus } = req.body;
    const u = []; const p = {};
    if (name  !== undefined) { u.push("name = @name");   p.name  = name; }
    if (days  !== undefined) { u.push("days = @days");   p.days  = days; }
    if (focus !== undefined) { u.push("focus = @focus"); p.focus = focus; }
    if (!u.length) return badRequest(res, "Nothing to update.");
    p.id = req.params.id;
    db.prepare(`UPDATE templates_workout SET ${u.join(", ")} WHERE id = @id`).run(p);
    ok(res, db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(req.params.id));
  } catch (err) {
    serverError(res, err, "PATCH /templates/workout/:id");
  }
});

router.delete("/workout/:id", auth("coach"), (req, res) => {
  try {
    db.prepare("DELETE FROM templates_workout WHERE id = ?").run(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /templates/workout/:id");
  }
});

// Assign workout template → creates a named plan for a client (empty plan, ready to populate)
router.post("/workout/:id/assign/:clientId", auth("coach"), (req, res) => {
  try {
    const template = db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(req.params.id);
    if (!template) return badRequest(res, "Template not found.");

    const planId = uuid();
    const ts     = new Date().toISOString();
    db.prepare(
      "INSERT INTO workout_plans (id, client_id, coach_id, name, is_active, template_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)"
    ).run(planId, req.params.clientId, req.user.userId, template.name, template.id, ts, ts);

    created(res, { planId, message: `Plan '${template.name}' created for client.` });
  } catch (err) {
    serverError(res, err, "POST /templates/workout/:id/assign/:clientId");
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// NUTRITION TEMPLATES
// ──────────────────────────────────────────────────────────────────────────────

router.get("/nutrition", auth("coach"), (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT * FROM templates_nutrition WHERE coach_id = ? ORDER BY created_at DESC"
    ).all(req.user.userId);
    ok(res, rows, { total: rows.length });
  } catch (err) {
    serverError(res, err, "GET /templates/nutrition");
  }
});

router.post("/nutrition", auth("coach"), (req, res) => {
  try {
    const { name, calories = 2000, proteinG = 150, carbsG = 200, fatsG = 65 } = req.body;
    if (!name) return badRequest(res, "name is required.");
    const tId = uuid();
    const ts  = new Date().toISOString();
    db.prepare(
      "INSERT INTO templates_nutrition (id, coach_id, name, calories, protein_g, carbs_g, fats_g, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(tId, req.user.userId, name, calories, proteinG, carbsG, fatsG, ts);
    created(res, db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(tId));
  } catch (err) {
    serverError(res, err, "POST /templates/nutrition");
  }
});

router.patch("/nutrition/:id", auth("coach"), (req, res) => {
  try {
    const { name, calories, proteinG, carbsG, fatsG } = req.body;
    const u = []; const p = {};
    if (name     !== undefined) { u.push("name = @name");           p.name     = name; }
    if (calories !== undefined) { u.push("calories = @calories");   p.calories = calories; }
    if (proteinG !== undefined) { u.push("protein_g = @proteinG");  p.proteinG = proteinG; }
    if (carbsG   !== undefined) { u.push("carbs_g = @carbsG");      p.carbsG   = carbsG; }
    if (fatsG    !== undefined) { u.push("fats_g = @fatsG");        p.fatsG    = fatsG; }
    if (!u.length) return badRequest(res, "Nothing to update.");
    p.id = req.params.id;
    db.prepare(`UPDATE templates_nutrition SET ${u.join(", ")} WHERE id = @id`).run(p);
    ok(res, db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(req.params.id));
  } catch (err) {
    serverError(res, err, "PATCH /templates/nutrition/:id");
  }
});

router.delete("/nutrition/:id", auth("coach"), (req, res) => {
  try {
    db.prepare("DELETE FROM templates_nutrition WHERE id = ?").run(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /templates/nutrition/:id");
  }
});

// Assign nutrition template → creates a nutrition plan for a client
router.post("/nutrition/:id/assign/:clientId", auth("coach"), (req, res) => {
  try {
    const t = db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(req.params.id);
    if (!t) return badRequest(res, "Template not found.");

    const planId = uuid();
    const ts     = new Date().toISOString();
    db.prepare(`
      INSERT INTO nutrition_plans (id, client_id, coach_id, name, calories, protein_g, carbs_g, fats_g, is_active, template_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(planId, req.params.clientId, req.user.userId, t.name, t.calories, t.protein_g, t.carbs_g, t.fats_g, t.id, ts, ts);

    created(res, { planId, message: `Nutrition plan '${t.name}' created for client.` });
  } catch (err) {
    serverError(res, err, "POST /templates/nutrition/:id/assign/:clientId");
  }
});

module.exports = router;
