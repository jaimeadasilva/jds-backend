/**
 * src/routes/workouts.js
 *
 * Plans
 *   GET    /api/workouts/client/:clientId          — get active plan (full tree)
 *   POST   /api/workouts/client/:clientId          — create new plan
 *   PATCH  /api/workouts/plans/:planId             — update plan meta
 *   DELETE /api/workouts/plans/:planId             — delete plan
 *
 * Days
 *   POST   /api/workouts/plans/:planId/days        — add a day
 *   PATCH  /api/workouts/days/:dayId               — update day
 *   DELETE /api/workouts/days/:dayId               — remove day
 *
 * Exercises
 *   POST   /api/workouts/days/:dayId/exercises     — add exercise
 *   PATCH  /api/workouts/exercises/:exId           — update exercise
 *   DELETE /api/workouts/exercises/:exId           — delete exercise
 *
 * Completion Logging
 *   POST   /api/workouts/exercises/:exId/log       — mark done/undone
 *   GET    /api/workouts/client/:clientId/logs     — all logs for client (optional ?date=YYYY-MM-DD)
 */

const express = require("express");
const { v4: uuid } = require("uuid");
const router  = express.Router();

const db   = require("../db").db;
const auth = require("../middleware/auth");
const { ok, created, badRequest, notFound, serverError } = require("../utils/respond");

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Build the full plan tree: plan → days[] → exercises[]
 */
function buildPlanTree(planId) {
  const plan = db.prepare("SELECT * FROM workout_plans WHERE id = ?").get(planId);
  if (!plan) return null;

  const days = db.prepare("SELECT * FROM workout_days WHERE plan_id = ? ORDER BY sort_order").all(planId);
  plan.days = days.map(day => {
    const exercises = db.prepare("SELECT * FROM exercises WHERE day_id = ? ORDER BY sort_order").all(day.id);
    return { ...day, exercises };
  });
  return plan;
}

// ─── GET /api/workouts/client/:clientId ───────────────────────────────────────
router.get("/client/:clientId", auth(), (req, res) => {
  try {
    const plan = db.prepare(
      "SELECT * FROM workout_plans WHERE client_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1"
    ).get(req.params.clientId);

    if (!plan) return ok(res, null);
    ok(res, buildPlanTree(plan.id));
  } catch (err) {
    serverError(res, err, "GET /workouts/client/:clientId");
  }
});

// ─── POST /api/workouts/client/:clientId ─────────────────────────────────────
router.post("/client/:clientId", auth("coach"), (req, res) => {
  try {
    const { name = "Training Plan" } = req.body;
    const planId = uuid();
    const ts     = new Date().toISOString();

    db.prepare(
      "INSERT INTO workout_plans (id, client_id, coach_id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    ).run(planId, req.params.clientId, req.user.userId, name, ts, ts);

    created(res, buildPlanTree(planId));
  } catch (err) {
    serverError(res, err, "POST /workouts/client/:clientId");
  }
});

// ─── PATCH /api/workouts/plans/:planId ────────────────────────────────────────
router.patch("/plans/:planId", auth("coach"), (req, res) => {
  try {
    const { name, isActive } = req.body;
    const ts = new Date().toISOString();
    const updates = [];
    const params  = {};

    if (name      !== undefined) { updates.push("name = @name");           params.name      = name; }
    if (isActive  !== undefined) { updates.push("is_active = @isActive");  params.isActive  = isActive ? 1 : 0; }

    if (!updates.length) return badRequest(res, "Nothing to update.");

    updates.push("updated_at = @ts");
    params.ts = ts;
    params.id = req.params.planId;

    db.prepare(`UPDATE workout_plans SET ${updates.join(", ")} WHERE id = @id`).run(params);
    ok(res, buildPlanTree(req.params.planId));
  } catch (err) {
    serverError(res, err, "PATCH /workouts/plans/:planId");
  }
});

// ─── DELETE /api/workouts/plans/:planId ───────────────────────────────────────
router.delete("/plans/:planId", auth("coach"), (req, res) => {
  try {
    db.prepare("DELETE FROM workout_plans WHERE id = ?").run(req.params.planId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /workouts/plans/:planId");
  }
});

// ─── POST /api/workouts/plans/:planId/days ────────────────────────────────────
router.post("/plans/:planId/days", auth("coach"), (req, res) => {
  try {
    const { dayLabel, dayFocus, weekNumber = 1 } = req.body;
    if (!dayLabel) return badRequest(res, "dayLabel is required.");

    const maxOrder = db.prepare("SELECT MAX(sort_order) as m FROM workout_days WHERE plan_id = ?").get(req.params.planId)?.m ?? -1;
    const dayId    = uuid();

    db.prepare(
      "INSERT INTO workout_days (id, plan_id, day_label, day_focus, sort_order, week_number) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(dayId, req.params.planId, dayLabel, dayFocus || null, maxOrder + 1);

    const day = db.prepare("SELECT * FROM workout_days WHERE id = ?").get(dayId);
    day.exercises = [];
    created(res, day);
  } catch (err) {
    serverError(res, err, "POST /workouts/plans/:planId/days");
  }
});

// ─── PATCH /api/workouts/days/:dayId ─────────────────────────────────────────
router.patch("/days/:dayId", auth("coach"), (req, res) => {
  try {
    const { dayLabel, dayFocus, sortOrder } = req.body;
    const updates = []; const params = {};
    if (dayLabel  !== undefined) { updates.push("day_label = @dayLabel");   params.dayLabel  = dayLabel; }
    if (dayFocus  !== undefined) { updates.push("day_focus = @dayFocus");   params.dayFocus  = dayFocus; }
    if (sortOrder !== undefined) { updates.push("sort_order = @sortOrder"); params.sortOrder = sortOrder; }
    if (!updates.length) return badRequest(res, "Nothing to update.");
    params.id = req.params.dayId;
    db.prepare(`UPDATE workout_days SET ${updates.join(", ")} WHERE id = @id`).run(params);
    const day = db.prepare("SELECT * FROM workout_days WHERE id = ?").get(req.params.dayId);
    day.exercises = db.prepare("SELECT * FROM exercises WHERE day_id = ? ORDER BY sort_order").all(req.params.dayId);
    ok(res, day);
  } catch (err) {
    serverError(res, err, "PATCH /workouts/days/:dayId");
  }
});

// ─── DELETE /api/workouts/days/:dayId ────────────────────────────────────────
router.delete("/days/:dayId", auth("coach"), (req, res) => {
  try {
    db.prepare("DELETE FROM workout_days WHERE id = ?").run(req.params.dayId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /workouts/days/:dayId");
  }
});

// ─── POST /api/workouts/days/:dayId/exercises ────────────────────────────────
router.post("/days/:dayId/exercises", auth("coach"), (req, res) => {
  try {
    const { name, sets = 3, reps = "10", notes, videoUrl } = req.body;
    if (!name) return badRequest(res, "name is required.");

    const maxOrder = db.prepare("SELECT MAX(sort_order) as m FROM exercises WHERE day_id = ?").get(req.params.dayId)?.m ?? -1;
    const exId     = uuid();

    db.prepare(
      "INSERT INTO exercises (id, day_id, name, sets, reps, notes, video_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(exId, req.params.dayId, name, sets, reps, notes || null, videoUrl || null, maxOrder + 1);

    const ex = db.prepare("SELECT * FROM exercises WHERE id = ?").get(exId);
    created(res, ex);
  } catch (err) {
    serverError(res, err, "POST /workouts/days/:dayId/exercises");
  }
});

// ─── PATCH /api/workouts/exercises/:exId ─────────────────────────────────────
router.patch("/exercises/:exId", auth("coach"), (req, res) => {
  try {
    const { name, sets, reps, notes, videoUrl, sortOrder } = req.body;
    const updates = []; const params = {};
    if (name      !== undefined) { updates.push("name = @name");           params.name      = name; }
    if (sets      !== undefined) { updates.push("sets = @sets");           params.sets      = sets; }
    if (reps      !== undefined) { updates.push("reps = @reps");           params.reps      = reps; }
    if (notes     !== undefined) { updates.push("notes = @notes");         params.notes     = notes; }
    if (videoUrl  !== undefined) { updates.push("video_url = @videoUrl");  params.videoUrl  = videoUrl; }
    if (sortOrder !== undefined) { updates.push("sort_order = @sortOrder");params.sortOrder = sortOrder; }
    if (!updates.length) return badRequest(res, "Nothing to update.");
    params.id = req.params.exId;
    db.prepare(`UPDATE exercises SET ${updates.join(", ")} WHERE id = @id`).run(params);
    ok(res, db.prepare("SELECT * FROM exercises WHERE id = ?").get(req.params.exId));
  } catch (err) {
    serverError(res, err, "PATCH /workouts/exercises/:exId");
  }
});

// ─── DELETE /api/workouts/exercises/:exId ─────────────────────────────────────
router.delete("/exercises/:exId", auth("coach"), (req, res) => {
  try {
    db.prepare("DELETE FROM exercises WHERE id = ?").run(req.params.exId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /workouts/exercises/:exId");
  }
});

// ─── POST /api/workouts/exercises/:exId/log ───────────────────────────────────
// Client marks an exercise done (or undone) for today.
router.post("/exercises/:exId/log", auth(), (req, res) => {
  try {
    const { completed = true, date } = req.body;
    const logDate = date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const logId   = uuid();

    // Upsert: if already logged today, update; otherwise insert
    const existing = db.prepare(
      "SELECT id FROM exercise_logs WHERE exercise_id = ? AND client_id = ? AND logged_at LIKE ?"
    ).get(req.params.exId, req.user.userId, `${logDate}%`);

    if (existing) {
      db.prepare("UPDATE exercise_logs SET completed = ? WHERE id = ?").run(completed ? 1 : 0, existing.id);
      ok(res, { id: existing.id, exercise_id: req.params.exId, completed, logged_at: logDate });
    } else {
      db.prepare(
        "INSERT INTO exercise_logs (id, exercise_id, client_id, completed, logged_at) VALUES (?, ?, ?, ?, ?)"
      ).run(logId, req.params.exId, req.user.userId, completed ? 1 : 0, new Date().toISOString());
      created(res, { id: logId, exercise_id: req.params.exId, completed, logged_at: logDate });
    }
  } catch (err) {
    serverError(res, err, "POST /workouts/exercises/:exId/log");
  }
});

// ─── GET /api/workouts/client/:clientId/logs ──────────────────────────────────
router.get("/client/:clientId/logs", auth(), (req, res) => {
  try {
    const dateFilter = req.query.date; // optional YYYY-MM-DD
    let logs;
    if (dateFilter) {
      logs = db.prepare(
        "SELECT * FROM exercise_logs WHERE client_id = ? AND logged_at LIKE ? ORDER BY logged_at DESC"
      ).all(req.params.clientId, `${dateFilter}%`);
    } else {
      logs = db.prepare(
        "SELECT * FROM exercise_logs WHERE client_id = ? ORDER BY logged_at DESC LIMIT 200"
      ).all(req.params.clientId);
    }
    ok(res, logs, { total: logs.length });
  } catch (err) {
    serverError(res, err, "GET /workouts/client/:clientId/logs");
  }
});

module.exports = router;
