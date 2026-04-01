/**
 * src/routes/nutrition.js
 */

const express = require("express");
const { v4: uuid } = require("uuid");
const router  = express.Router();

const db   = require("../db").db;
const auth = require("../middleware/auth");
const { ok, created, badRequest, notFound, serverError } = require("../utils/respond");

// ─── Helper ───────────────────────────────────────────────────────────────────
async function buildPlanWithMeals(planId) {
  const plan = await db.prepare("SELECT * FROM nutrition_plans WHERE id = $1").get(planId);
  if (!plan) return null;
  plan.meals = await db.prepare("SELECT * FROM meals WHERE plan_id = $1 ORDER BY sort_order ASC").all(planId);
  plan.total_planned_calories = plan.meals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
  plan.remaining_calories = (Number(plan.calories) || 0) - plan.total_planned_calories;
  return plan;
}

// ─── GET plan ─────────────────────────────────────────────────────────────────
router.get("/client/:clientId", auth(), async (req, res) => {
  try {
    const plan = await db.prepare(
      "SELECT * FROM nutrition_plans WHERE client_id = $1 AND is_active = 1 ORDER BY created_at DESC LIMIT 1"
    ).get(req.params.clientId);
    if (!plan) return ok(res, null);
    ok(res, await buildPlanWithMeals(plan.id));
  } catch (err) { serverError(res, err, "GET /nutrition/client/:clientId"); }
});

// ─── Create plan ──────────────────────────────────────────────────────────────
router.post("/client/:clientId", auth("coach"), async (req, res) => {
  try {
    const { name = "Nutrition Plan", calories = 2000, proteinG = 150, carbsG = 200, fatsG = 65 } = req.body;
    const planId = uuid();
    const ts     = new Date().toISOString();

    await db.prepare(
      "INSERT INTO nutrition_plans (id, client_id, coach_id, name, calories, protein_g, carbs_g, fats_g, is_active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10)"
    ).run(planId, req.params.clientId, req.user.userId, name, Number(calories), Number(proteinG), Number(carbsG), Number(fatsG), ts, ts);

    created(res, await buildPlanWithMeals(planId));
  } catch (err) { serverError(res, err, "POST /nutrition/client/:clientId"); }
});

// ─── Update plan targets ──────────────────────────────────────────────────────
router.patch("/plans/:planId", auth("coach"), async (req, res) => {
  try {
    const { name, calories, proteinG, carbsG, fatsG, isActive } = req.body;
    const fields = []; const values = [];
    if (name     !== undefined) { fields.push("name");      values.push(name); }
    if (calories !== undefined) { fields.push("calories");  values.push(Number(calories)); }
    if (proteinG !== undefined) { fields.push("protein_g"); values.push(Number(proteinG)); }
    if (carbsG   !== undefined) { fields.push("carbs_g");   values.push(Number(carbsG)); }
    if (fatsG    !== undefined) { fields.push("fats_g");    values.push(Number(fatsG)); }
    if (isActive !== undefined) { fields.push("is_active"); values.push(isActive ? 1 : 0); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    fields.push("updated_at"); values.push(new Date().toISOString());
    values.push(req.params.planId);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
    await db.prepare(`UPDATE nutrition_plans SET ${set} WHERE id = $${fields.length + 1}`).run(values);
    ok(res, await buildPlanWithMeals(req.params.planId));
  } catch (err) { serverError(res, err, "PATCH /nutrition/plans/:planId"); }
});

// ─── Delete plan ──────────────────────────────────────────────────────────────
router.delete("/plans/:planId", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM nutrition_plans WHERE id = $1").run(req.params.planId);
    ok(res, { deleted: true });
  } catch (err) { serverError(res, err, "DELETE /nutrition/plans/:planId"); }
});

// ─── Add meal ─────────────────────────────────────────────────────────────────
router.post("/plans/:planId/meals", auth("coach"), async (req, res) => {
  try {
    const { name, icon = "🍽️", foods = "", calories = 0, proteinG = 0, carbsG = 0, fatsG = 0 } = req.body;
    if (!name || !name.trim()) return badRequest(res, "name is required.");

    // Verify plan exists
    const plan = await db.prepare("SELECT id FROM nutrition_plans WHERE id = $1").get(req.params.planId);
    if (!plan) return notFound(res, "Nutrition plan");

    const maxRow = await db.prepare("SELECT MAX(sort_order) as m FROM meals WHERE plan_id = $1").get(req.params.planId);
    const sortOrder = (maxRow && maxRow.m !== null ? Number(maxRow.m) : -1) + 1;
    const mealId = uuid();

    await db.prepare(
      "INSERT INTO meals (id, plan_id, name, icon, foods, calories, protein_g, carbs_g, fats_g, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)"
    ).run(mealId, req.params.planId, name.trim(), icon, foods || null, Number(calories), Number(proteinG), Number(carbsG), Number(fatsG), sortOrder);

    const meal = await db.prepare("SELECT * FROM meals WHERE id = $1").get(mealId);
    created(res, meal);
  } catch (err) { serverError(res, err, "POST /nutrition/plans/:planId/meals"); }
});

// ─── Update meal ──────────────────────────────────────────────────────────────
router.patch("/meals/:mealId", auth("coach"), async (req, res) => {
  try {
    const { name, icon, foods, calories, proteinG, carbsG, fatsG, sortOrder } = req.body;
    const fields = []; const values = [];
    if (name      !== undefined) { fields.push("name");       values.push(name); }
    if (icon      !== undefined) { fields.push("icon");       values.push(icon); }
    if (foods     !== undefined) { fields.push("foods");      values.push(foods); }
    if (calories  !== undefined) { fields.push("calories");   values.push(Number(calories)); }
    if (proteinG  !== undefined) { fields.push("protein_g");  values.push(Number(proteinG)); }
    if (carbsG    !== undefined) { fields.push("carbs_g");    values.push(Number(carbsG)); }
    if (fatsG     !== undefined) { fields.push("fats_g");     values.push(Number(fatsG)); }
    if (sortOrder !== undefined) { fields.push("sort_order"); values.push(Number(sortOrder)); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.mealId);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
    await db.prepare(`UPDATE meals SET ${set} WHERE id = $${fields.length + 1}`).run(values);
    ok(res, await db.prepare("SELECT * FROM meals WHERE id = $1").get(req.params.mealId));
  } catch (err) { serverError(res, err, "PATCH /nutrition/meals/:mealId"); }
});

// ─── Delete meal ──────────────────────────────────────────────────────────────
router.delete("/meals/:mealId", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM meals WHERE id = $1").run(req.params.mealId);
    ok(res, { deleted: true });
  } catch (err) { serverError(res, err, "DELETE /nutrition/meals/:mealId"); }
});

// ─── Meal log (client side) ───────────────────────────────────────────────────
router.post("/log", auth(), async (req, res) => {
  try {
    const { mealId, date, name, calories = 0, proteinG = 0, carbsG = 0, fatsG = 0, isCustom = false, notes } = req.body;
    if (!name || !date) return badRequest(res, "name and date are required.");
    const logId = uuid();
    const ts    = new Date().toISOString();
    await db.prepare(
      "INSERT INTO meal_logs (id, client_id, meal_id, date, name, calories, protein_g, carbs_g, fats_g, is_custom, notes, logged_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)"
    ).run(logId, req.user.userId, mealId || null, date, name, Number(calories), Number(proteinG), Number(carbsG), Number(fatsG), isCustom ? 1 : 0, notes || null, ts);
    created(res, { id: logId, client_id: req.user.userId, meal_id: mealId, date, name, calories: Number(calories), protein_g: Number(proteinG), carbs_g: Number(carbsG), fats_g: Number(fatsG), is_custom: isCustom, notes, logged_at: ts });
  } catch (err) { serverError(res, err, "POST /nutrition/log"); }
});

router.delete("/log/:logId", auth(), async (req, res) => {
  try {
    await db.prepare("DELETE FROM meal_logs WHERE id = $1 AND client_id = $2").run(req.params.logId, req.user.userId);
    ok(res, { deleted: true });
  } catch (err) { serverError(res, err, "DELETE /nutrition/log/:logId"); }
});

router.get("/client/:clientId/logs", auth(), async (req, res) => {
  try {
    const { date } = req.query;
    const logs = date
      ? await db.prepare("SELECT * FROM meal_logs WHERE client_id = $1 AND date = $2 ORDER BY logged_at ASC").all(req.params.clientId, date)
      : await db.prepare("SELECT * FROM meal_logs WHERE client_id = $1 ORDER BY logged_at DESC LIMIT 100").all(req.params.clientId);
    ok(res, logs, { total: logs.length });
  } catch (err) { serverError(res, err, "GET /nutrition/client/:clientId/logs"); }
});

// ─── Diagnose endpoint (shows what routes are registered + DB state) ──────────
router.get("/diagnose", auth("coach"), async (req, res) => {
  try {
    const plans = await db.prepare("SELECT COUNT(*) as n FROM nutrition_plans").get();
    const meals = await db.prepare("SELECT COUNT(*) as n FROM meals").get();
    const logs  = await db.prepare("SELECT COUNT(*) as n FROM meal_logs").get();
    ok(res, {
      routes_registered: true,
      db_counts: { plans: plans?.n, meals: meals?.n, logs: logs?.n },
      coach_id: req.user.userId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) { serverError(res, err, "GET /nutrition/diagnose"); }
});

module.exports = router;
