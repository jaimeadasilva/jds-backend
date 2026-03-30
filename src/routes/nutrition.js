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
function buildPlanWithMeals(planId) {
  const plan = db.prepare("SELECT * FROM nutrition_plans WHERE id = ?").get(planId);
  if (!plan) return null;
  plan.meals = db.prepare("SELECT * FROM meals WHERE plan_id = ? ORDER BY sort_order").all(planId);

  // Computed: total calories planned
  plan.total_planned_calories = plan.meals.reduce((s, m) => s + m.calories, 0);
  plan.remaining_calories      = plan.calories - plan.total_planned_calories;

  return plan;
}

// ─── GET /api/nutrition/client/:clientId ──────────────────────────────────────
router.get("/client/:clientId", auth(), (req, res) => {
  try {
    const plan = db.prepare(
      "SELECT * FROM nutrition_plans WHERE client_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1"
    ).get(req.params.clientId);

    if (!plan) return ok(res, null);
    ok(res, buildPlanWithMeals(plan.id));
  } catch (err) {
    serverError(res, err, "GET /nutrition/client/:clientId");
  }
});

// ─── POST /api/nutrition/client/:clientId ────────────────────────────────────
router.post("/client/:clientId", auth("coach"), (req, res) => {
  try {
    const { name = "Nutrition Plan", calories = 2000, proteinG = 150, carbsG = 200, fatsG = 65 } = req.body;
    const planId = uuid();
    const ts     = new Date().toISOString();

    db.prepare(`
      INSERT INTO nutrition_plans (id, client_id, coach_id, name, calories, protein_g, carbs_g, fats_g, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(planId, req.params.clientId, req.user.userId, name, calories, proteinG, carbsG, fatsG, ts, ts);

    created(res, buildPlanWithMeals(planId));
  } catch (err) {
    serverError(res, err, "POST /nutrition/client/:clientId");
  }
});

// ─── PATCH /api/nutrition/plans/:planId ──────────────────────────────────────
router.patch("/plans/:planId", auth("coach"), (req, res) => {
  try {
    const { name, calories, proteinG, carbsG, fatsG, isActive } = req.body;
    const updates = []; const params = {};

    if (name     !== undefined) { updates.push("name = @name");           params.name     = name; }
    if (calories !== undefined) { updates.push("calories = @calories");   params.calories = calories; }
    if (proteinG !== undefined) { updates.push("protein_g = @proteinG");  params.proteinG = proteinG; }
    if (carbsG   !== undefined) { updates.push("carbs_g = @carbsG");      params.carbsG   = carbsG; }
    if (fatsG    !== undefined) { updates.push("fats_g = @fatsG");        params.fatsG    = fatsG; }
    if (isActive !== undefined) { updates.push("is_active = @isActive");  params.isActive = isActive ? 1 : 0; }

    if (!updates.length) return badRequest(res, "Nothing to update.");
    updates.push("updated_at = @ts");
    params.ts = new Date().toISOString();
    params.id = req.params.planId;

    db.prepare(`UPDATE nutrition_plans SET ${updates.join(", ")} WHERE id = @id`).run(params);
    ok(res, buildPlanWithMeals(req.params.planId));
  } catch (err) {
    serverError(res, err, "PATCH /nutrition/plans/:planId");
  }
});

// ─── DELETE /api/nutrition/plans/:planId ──────────────────────────────────────
router.delete("/plans/:planId", auth("coach"), (req, res) => {
  try {
    db.prepare("DELETE FROM nutrition_plans WHERE id = ?").run(req.params.planId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /nutrition/plans/:planId");
  }
});

// ─── POST /api/nutrition/plans/:planId/meals ─────────────────────────────────
router.post("/plans/:planId/meals", auth("coach"), (req, res) => {
  try {
    const { name, icon = "🍽️", foods, calories = 0, proteinG = 0, carbsG = 0, fatsG = 0 } = req.body;
    if (!name) return badRequest(res, "name is required.");

    const maxOrder = db.prepare("SELECT MAX(sort_order) as m FROM meals WHERE plan_id = ?").get(req.params.planId)?.m ?? -1;
    const mealId   = uuid();

    db.prepare(`
      INSERT INTO meals (id, plan_id, name, icon, foods, calories, protein_g, carbs_g, fats_g, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(mealId, req.params.planId, name, icon, foods || null, calories, proteinG, carbsG, fatsG, maxOrder + 1);

    created(res, db.prepare("SELECT * FROM meals WHERE id = ?").get(mealId));
  } catch (err) {
    serverError(res, err, "POST /nutrition/plans/:planId/meals");
  }
});

// ─── PATCH /api/nutrition/meals/:mealId ───────────────────────────────────────
router.patch("/meals/:mealId", auth("coach"), (req, res) => {
  try {
    const { name, icon, foods, calories, proteinG, carbsG, fatsG, sortOrder } = req.body;
    const updates = []; const params = {};

    if (name      !== undefined) { updates.push("name = @name");           params.name      = name; }
    if (icon      !== undefined) { updates.push("icon = @icon");           params.icon      = icon; }
    if (foods     !== undefined) { updates.push("foods = @foods");         params.foods     = foods; }
    if (calories  !== undefined) { updates.push("calories = @calories");   params.calories  = calories; }
    if (proteinG  !== undefined) { updates.push("protein_g = @proteinG");  params.proteinG  = proteinG; }
    if (carbsG    !== undefined) { updates.push("carbs_g = @carbsG");      params.carbsG    = carbsG; }
    if (fatsG     !== undefined) { updates.push("fats_g = @fatsG");        params.fatsG     = fatsG; }
    if (sortOrder !== undefined) { updates.push("sort_order = @sortOrder");params.sortOrder = sortOrder; }

    if (!updates.length) return badRequest(res, "Nothing to update.");
    params.id = req.params.mealId;
    db.prepare(`UPDATE meals SET ${updates.join(", ")} WHERE id = @id`).run(params);
    ok(res, db.prepare("SELECT * FROM meals WHERE id = ?").get(req.params.mealId));
  } catch (err) {
    serverError(res, err, "PATCH /nutrition/meals/:mealId");
  }
});

// ─── DELETE /api/nutrition/meals/:mealId ─────────────────────────────────────
router.delete("/meals/:mealId", auth("coach"), (req, res) => {
  try {
    db.prepare("DELETE FROM meals WHERE id = ?").run(req.params.mealId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /nutrition/meals/:mealId");
  }
});

module.exports = router;
