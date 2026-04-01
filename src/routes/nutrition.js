/**
 * src/routes/nutrition.js
 *
 * Plans
 *   GET    /api/nutrition/client/:clientId       — active plan with meals
 *   POST   /api/nutrition/client/:clientId       — create plan
 *   PATCH  /api/nutrition/plans/:planId          — update targets
 *   DELETE /api/nutrition/plans/:planId          — delete plan
 *
 * Meals
 *   POST   /api/nutrition/plans/:planId/meals    — add meal
 *   PATCH  /api/nutrition/meals/:mealId          — update meal
 *   DELETE /api/nutrition/meals/:mealId          — delete meal
 */

const express = require("express");
const { v4: uuid } = require("uuid");
const router  = express.Router();

const db   = require("../db").db;
const auth = require("../middleware/auth");
const { ok, created, badRequest, notFound, serverError } = require("../utils/respond");

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function buildPlanWithMeals(planId) {
  const plan = await db.prepare("SELECT * FROM nutrition_plans WHERE id = ?").get(planId);
  if (!plan) return null;
  plan.meals = await db.prepare("SELECT * FROM meals WHERE plan_id = ? ORDER BY sort_order").all(planId);

  // Computed: total calories planned
  plan.total_planned_calories = plan.meals.reduce((s, m) => s + m.calories, 0);
  plan.remaining_calories      = plan.calories - plan.total_planned_calories;

  return plan;
}

// ─── GET /api/nutrition/client/:clientId ──────────────────────────────────────
router.get("/client/:clientId", auth(), async (req, res) => {
  try {
    const plan = await db.prepare(
      "SELECT * FROM nutrition_plans WHERE client_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1"
    ).get(req.params.clientId);

    if (!plan) return ok(res, null);
    ok(res, await buildPlanWithMeals(plan.id));
  } catch (err) {
    serverError(res, err, "GET /nutrition/client/:clientId");
  }
});

// ─── POST /api/nutrition/client/:clientId ────────────────────────────────────
router.post("/client/:clientId", auth("coach"), async (req, res) => {
  try {
    const { name = "Nutrition Plan", calories = 2000, proteinG = 150, carbsG = 200, fatsG = 65 } = req.body;
    const planId = uuid();
    const ts     = new Date().toISOString();

    await db.prepare(`
      INSERT INTO nutrition_plans (id, client_id, coach_id, name, calories, protein_g, carbs_g, fats_g, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(planId, req.params.clientId, req.user.userId, name, calories, proteinG, carbsG, fatsG, ts, ts);

    created(res, await buildPlanWithMeals(planId));
  } catch (err) {
    serverError(res, err, "POST /nutrition/client/:clientId");
  }
});

// ─── PATCH /api/nutrition/plans/:planId ──────────────────────────────────────
router.patch("/plans/:planId", auth("coach"), async (req, res) => {
  try {
    const { name, calories, proteinG, carbsG, fatsG, isActive } = req.body;
    const fields = []; const values = [];
    if (name     !== undefined) { fields.push("name");       values.push(name); }
    if (calories !== undefined) { fields.push("calories");   values.push(+calories); }
    if (proteinG !== undefined) { fields.push("protein_g");  values.push(+proteinG); }
    if (carbsG   !== undefined) { fields.push("carbs_g");    values.push(+carbsG); }
    if (fatsG    !== undefined) { fields.push("fats_g");     values.push(+fatsG); }
    if (isActive !== undefined) { fields.push("is_active");  values.push(isActive ? 1 : 0); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    fields.push("updated_at"); values.push(new Date().toISOString());
    values.push(req.params.planId);
    const setClauses = fields.map((f, i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE nutrition_plans SET ${setClauses} WHERE id = $${fields.length + 1}`).run(values);
    ok(res, await buildPlanWithMeals(req.params.planId));
  } catch (err) {
    serverError(res, err, "PATCH /nutrition/plans/:planId");
  }
});

// ─── DELETE /api/nutrition/plans/:planId ──────────────────────────────────────
router.delete("/plans/:planId", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM nutrition_plans WHERE id = ?").run(req.params.planId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /nutrition/plans/:planId");
  }
});

// ─── POST /api/nutrition/plans/:planId/meals ─────────────────────────────────
router.post("/plans/:planId/meals", auth("coach"), async (req, res) => {
  try {
    const { name, icon = "🍽️", foods, calories = 0, proteinG = 0, carbsG = 0, fatsG = 0 } = req.body;
    if (!name) return badRequest(res, "name is required.");

    const maxOrderRow = await db.prepare("SELECT MAX(sort_order) as m FROM meals WHERE plan_id = ?").get(req.params.planId);
    const maxOrder = (maxOrderRow?.m ?? -1);
    const mealId   = uuid();

    await db.prepare(`
      INSERT INTO meals (id, plan_id, name, icon, foods, calories, protein_g, carbs_g, fats_g, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(mealId, req.params.planId, name, icon, foods || null, calories, proteinG, carbsG, fatsG, maxOrder + 1);

    created(res, await db.prepare("SELECT * FROM meals WHERE id = ?").get(mealId));
  } catch (err) {
    serverError(res, err, "POST /nutrition/plans/:planId/meals");
  }
});

// ─── PATCH /api/nutrition/meals/:mealId ───────────────────────────────────────
router.patch("/meals/:mealId", auth("coach"), async (req, res) => {
  try {
    const { name, icon, foods, calories, proteinG, carbsG, fatsG, sortOrder } = req.body;
    const fields = []; const values = [];
    if (name      !== undefined) { fields.push("name");       values.push(name); }
    if (icon      !== undefined) { fields.push("icon");       values.push(icon); }
    if (foods     !== undefined) { fields.push("foods");      values.push(foods); }
    if (calories  !== undefined) { fields.push("calories");   values.push(+calories); }
    if (proteinG  !== undefined) { fields.push("protein_g");  values.push(+proteinG); }
    if (carbsG    !== undefined) { fields.push("carbs_g");    values.push(+carbsG); }
    if (fatsG     !== undefined) { fields.push("fats_g");     values.push(+fatsG); }
    if (sortOrder !== undefined) { fields.push("sort_order"); values.push(+sortOrder); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.mealId);
    const setClauses = fields.map((f, i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE meals SET ${setClauses} WHERE id = $${fields.length + 1}`).run(values);
    ok(res, await db.prepare("SELECT * FROM meals WHERE id = ?").get(req.params.mealId));
  } catch (err) {
    serverError(res, err, "PATCH /nutrition/meals/:mealId");
  }
});

// ─── DELETE /api/nutrition/meals/:mealId ─────────────────────────────────────
router.delete("/meals/:mealId", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM meals WHERE id = ?").run(req.params.mealId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /nutrition/meals/:mealId");
  }
});

// ─── POST /api/nutrition/log — client logs a meal (planned or custom) ─────────
router.post("/log", auth(), async (req, res) => {
  try {
    const { mealId, date, name, calories = 0, proteinG = 0, carbsG = 0, fatsG = 0, isCustom = false, notes } = req.body;
    if (!name || !date) return badRequest(res, "name and date are required.");

    const logId = uuid();
    const ts    = new Date().toISOString();

    await db.prepare(`
      INSERT INTO meal_logs (id, client_id, meal_id, date, name, calories, protein_g, carbs_g, fats_g, is_custom, notes, logged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, req.user.userId, mealId || null, date, name, calories, proteinG, carbsG, fatsG, isCustom ? 1 : 0, notes || null, ts);

    created(res, { id: logId, client_id: req.user.userId, meal_id: mealId, date, name, calories, protein_g: proteinG, carbs_g: carbsG, fats_g: fatsG, is_custom: isCustom, notes, logged_at: ts });
  } catch (err) { serverError(res, err, "POST /nutrition/log"); }
});

// ─── DELETE /api/nutrition/log/:logId — client removes a log entry ────────────
router.delete("/log/:logId", auth(), async (req, res) => {
  try {
    await db.prepare("DELETE FROM meal_logs WHERE id = ? AND client_id = ?").run(req.params.logId, req.user.userId);
    ok(res, { deleted: true });
  } catch (err) { serverError(res, err, "DELETE /nutrition/log/:logId"); }
});

// ─── GET /api/nutrition/client/:clientId/logs — get logs for a date ───────────
router.get("/client/:clientId/logs", auth(), async (req, res) => {
  try {
    const { date } = req.query;
    let logs;
    if (date) {
      logs = await db.prepare("SELECT * FROM meal_logs WHERE client_id = ? AND date = ? ORDER BY logged_at ASC").all(req.params.clientId, date);
    } else {
      logs = await db.prepare("SELECT * FROM meal_logs WHERE client_id = ? ORDER BY logged_at DESC LIMIT 100").all(req.params.clientId);
    }
    ok(res, logs, { total: logs.length });
  } catch (err) { serverError(res, err, "GET /nutrition/client/:clientId/logs"); }
});

module.exports = router;
