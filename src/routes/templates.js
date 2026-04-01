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

router.get("/workout", auth("coach"), async (req, res) => {
  try {
    const rows = await db.prepare(
      "SELECT * FROM templates_workout WHERE coach_id = ? ORDER BY created_at DESC"
    ).all(req.user.userId);
    ok(res, rows, { total: rows.length });
  } catch (err) {
    serverError(res, err, "GET /templates/workout");
  }
});

router.post("/workout", auth("coach"), async (req, res) => {
  try {
    const { name, days = 3, focus } = req.body;
    if (!name) return badRequest(res, "name is required.");
    const tId = uuid();
    const ts  = new Date().toISOString();
    await db.prepare(
      "INSERT INTO templates_workout (id, coach_id, name, days, focus, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(tId, req.user.userId, name, days, focus || null, ts);
    created(res, await db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(tId));
  } catch (err) {
    serverError(res, err, "POST /templates/workout");
  }
});

router.patch("/workout/:id", auth("coach"), async (req, res) => {
  try {
    const { name, days, focus } = req.body;
    const fields = []; const values = [];
    if (name  !== undefined) { fields.push("name");  values.push(name); }
    if (days  !== undefined) { fields.push("days");  values.push(+days); }
    if (focus !== undefined) { fields.push("focus"); values.push(focus); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.id);
    const setClauses = fields.map((f,i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE templates_workout SET ${setClauses} WHERE id = $${fields.length+1}`).run(values);
    ok(res, await db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(req.params.id));
  } catch (err) {
    serverError(res, err, "PATCH /templates/workout/:id");
  }
});

router.delete("/workout/:id", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM templates_workout WHERE id = ?").run(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /templates/workout/:id");
  }
});

// Assign workout template → creates a named plan for a client (empty plan, ready to populate)
router.post("/workout/:id/assign/:clientId", auth("coach"), async (req, res) => {
  try {
    const template = await db.prepare("SELECT * FROM templates_workout WHERE id = ?").get(req.params.id);
    if (!template) return badRequest(res, "Template not found.");

    const planId = uuid();
    const ts     = new Date().toISOString();
    await db.prepare(
      "INSERT INTO workout_plans (id, client_id, coach_id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    ).run(planId, req.params.clientId, req.user.userId, template.name, ts, ts);

    created(res, { planId, message: `Plan '${template.name}' created for client.` });
  } catch (err) {
    serverError(res, err, "POST /templates/workout/:id/assign/:clientId");
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// NUTRITION TEMPLATES
// ──────────────────────────────────────────────────────────────────────────────

router.get("/nutrition", auth("coach"), async (req, res) => {
  try {
    const rows = await db.prepare(
      "SELECT * FROM templates_nutrition WHERE coach_id = ? ORDER BY created_at DESC"
    ).all(req.user.userId);
    ok(res, rows, { total: rows.length });
  } catch (err) {
    serverError(res, err, "GET /templates/nutrition");
  }
});

router.post("/nutrition", auth("coach"), async (req, res) => {
  try {
    const { name, calories = 2000, proteinG = 150, carbsG = 200, fatsG = 65 } = req.body;
    if (!name) return badRequest(res, "name is required.");
    const tId = uuid();
    const ts  = new Date().toISOString();
    await db.prepare(
      "INSERT INTO templates_nutrition (id, coach_id, name, calories, protein_g, carbs_g, fats_g, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(tId, req.user.userId, name, calories, proteinG, carbsG, fatsG, ts);
    created(res, await db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(tId));
  } catch (err) {
    serverError(res, err, "POST /templates/nutrition");
  }
});

router.patch("/nutrition/:id", auth("coach"), async (req, res) => {
  try {
    const { name, calories, proteinG, carbsG, fatsG } = req.body;
    const fields = []; const values = [];
    if (name     !== undefined) { fields.push("name");      values.push(name); }
    if (calories !== undefined) { fields.push("calories");  values.push(+calories); }
    if (proteinG !== undefined) { fields.push("protein_g"); values.push(+proteinG); }
    if (carbsG   !== undefined) { fields.push("carbs_g");   values.push(+carbsG); }
    if (fatsG    !== undefined) { fields.push("fats_g");    values.push(+fatsG); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.id);
    const setClauses = fields.map((f,i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE templates_nutrition SET ${setClauses} WHERE id = $${fields.length+1}`).run(values);
    ok(res, await db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(req.params.id));
  } catch (err) {
    serverError(res, err, "PATCH /templates/nutrition/:id");
  }
});

router.delete("/nutrition/:id", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM templates_nutrition WHERE id = ?").run(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /templates/nutrition/:id");
  }
});

// Assign nutrition template → creates a nutrition plan for a client
router.post("/nutrition/:id/assign/:clientId", auth("coach"), async (req, res) => {
  try {
    const t = await db.prepare("SELECT * FROM templates_nutrition WHERE id = ?").get(req.params.id);
    if (!t) return badRequest(res, "Template not found.");

    const planId = uuid();
    const ts     = new Date().toISOString();
    await db.prepare(`
      INSERT INTO nutrition_plans (id, client_id, coach_id, name, calories, protein_g, carbs_g, fats_g, is_active, template_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(planId, req.params.clientId, req.user.userId, t.name, t.calories, t.protein_g, t.carbs_g, t.fats_g, ts, ts);

    created(res, { planId, message: `Nutrition plan '${t.name}' created for client.` });
  } catch (err) {
    serverError(res, err, "POST /templates/nutrition/:id/assign/:clientId");
  }
});

module.exports = router;
