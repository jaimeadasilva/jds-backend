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
async function buildPlanTree(planId) {
  const plan = await db.prepare("SELECT * FROM workout_plans WHERE id = ?").get(planId);
  if (!plan) return null;

  const days = await db.prepare("SELECT * FROM workout_days WHERE plan_id = ? ORDER BY sort_order").all(planId);
  plan.days = await Promise.all(days.map(async day => {
    const exercises = await db.prepare("SELECT * FROM exercises WHERE day_id = ? ORDER BY sort_order").all(day.id);
    return { ...day, exercises };
  }));
  return plan;
}

// ─── GET /api/workouts/client/:clientId ───────────────────────────────────────
router.get("/client/:clientId", auth(), async (req, res) => {
  try {
    const plan = await db.prepare(
      "SELECT * FROM workout_plans WHERE client_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1"
    ).get(req.params.clientId);

    if (!plan) return ok(res, null);
    ok(res, await buildPlanTree(plan.id));
  } catch (err) {
    serverError(res, err, "GET /workouts/client/:clientId");
  }
});

// ─── POST /api/workouts/client/:clientId ─────────────────────────────────────
router.post("/client/:clientId", auth("coach"), async (req, res) => {
  try {
    const { name = "Training Plan" } = req.body;
    const planId = uuid();
    const ts     = new Date().toISOString();

    await db.prepare(
      "INSERT INTO workout_plans (id, client_id, coach_id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    ).run(planId, req.params.clientId, req.user.userId, name, ts, ts);

    created(res, await buildPlanTree(planId));
  } catch (err) {
    serverError(res, err, "POST /workouts/client/:clientId");
  }
});

// ─── PATCH /api/workouts/plans/:planId ────────────────────────────────────────
router.patch("/plans/:planId", auth("coach"), async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const fields = []; const values = [];
    if (name     !== undefined) { fields.push("name");      values.push(name); }
    if (isActive !== undefined) { fields.push("is_active"); values.push(isActive ? 1 : 0); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    fields.push("updated_at"); values.push(new Date().toISOString());
    values.push(req.params.planId);
    const setClauses = fields.map((f, i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE workout_plans SET ${setClauses} WHERE id = $${fields.length + 1}`).run(values);
    ok(res, await buildPlanTree(req.params.planId));
  } catch (err) {
    serverError(res, err, "PATCH /workouts/plans/:planId");
  }
});

// ─── DELETE /api/workouts/plans/:planId ───────────────────────────────────────
router.delete("/plans/:planId", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM workout_plans WHERE id = ?").run(req.params.planId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /workouts/plans/:planId");
  }
});

// ─── POST /api/workouts/plans/:planId/days ────────────────────────────────────
router.post("/plans/:planId/days", auth("coach"), async (req, res) => {
  try {
    const { dayLabel, dayFocus, weekNumber = 1 } = req.body;
    if (!dayLabel) return badRequest(res, "dayLabel is required.");

    const maxOrderRow = await db.prepare("SELECT MAX(sort_order) as m FROM workout_days WHERE plan_id = ?").get(req.params.planId);
    const maxOrder = (maxOrderRow?.m ?? -1);
    const dayId    = uuid();

    await db.prepare(
      "INSERT INTO workout_days (id, plan_id, day_label, day_focus, sort_order, week_number) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(dayId, req.params.planId, dayLabel, dayFocus || null, maxOrder + 1, weekNumber);

    const day = await db.prepare("SELECT * FROM workout_days WHERE id = ?").get(dayId);
    day.exercises = [];
    created(res, day);
  } catch (err) {
    serverError(res, err, "POST /workouts/plans/:planId/days");
  }
});

// ─── PATCH /api/workouts/days/:dayId ─────────────────────────────────────────
router.patch("/days/:dayId", auth("coach"), async (req, res) => {
  try {
    const { dayLabel, dayFocus, sortOrder } = req.body;
    const fields = []; const values = [];
    if (dayLabel  !== undefined) { fields.push("day_label");  values.push(dayLabel); }
    if (dayFocus  !== undefined) { fields.push("day_focus");  values.push(dayFocus); }
    if (sortOrder !== undefined) { fields.push("sort_order"); values.push(+sortOrder); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.dayId);
    const setClauses = fields.map((f, i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE workout_days SET ${setClauses} WHERE id = $${fields.length + 1}`).run(values);
    const day = await db.prepare("SELECT * FROM workout_days WHERE id = ?").get(req.params.dayId);
    day.exercises = await db.prepare("SELECT * FROM exercises WHERE day_id = ? ORDER BY sort_order").all(req.params.dayId);
    ok(res, day);
  } catch (err) {
    serverError(res, err, "PATCH /workouts/days/:dayId");
  }
});

// ─── DELETE /api/workouts/days/:dayId ────────────────────────────────────────
router.delete("/days/:dayId", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM workout_days WHERE id = ?").run(req.params.dayId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /workouts/days/:dayId");
  }
});

// ─── POST /api/workouts/days/:dayId/exercises ────────────────────────────────
router.post("/days/:dayId/exercises", auth("coach"), async (req, res) => {
  try {
    const { name, sets = 3, reps = "10", notes, videoUrl } = req.body;
    if (!name) return badRequest(res, "name is required.");

    const maxOrderRow = await db.prepare("SELECT MAX(sort_order) as m FROM exercises WHERE day_id = ?").get(req.params.dayId);
    const maxOrder = (maxOrderRow?.m ?? -1);
    const exId     = uuid();

    await db.prepare(
      "INSERT INTO exercises (id, day_id, name, sets, reps, notes, video_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(exId, req.params.dayId, name, sets, reps, notes || null, videoUrl || null, maxOrder + 1);

    const ex = await db.prepare("SELECT * FROM exercises WHERE id = ?").get(exId);
    created(res, ex);
  } catch (err) {
    serverError(res, err, "POST /workouts/days/:dayId/exercises");
  }
});

// ─── PATCH /api/workouts/exercises/:exId ─────────────────────────────────────
router.patch("/exercises/:exId", auth("coach"), async (req, res) => {
  try {
    const { name, sets, reps, notes, videoUrl, sortOrder } = req.body;
    const fields = []; const values = [];
    if (name      !== undefined) { fields.push("name");       values.push(name); }
    if (sets      !== undefined) { fields.push("sets");       values.push(+sets); }
    if (reps      !== undefined) { fields.push("reps");       values.push(reps); }
    if (notes     !== undefined) { fields.push("notes");      values.push(notes); }
    if (videoUrl  !== undefined) { fields.push("video_url");  values.push(videoUrl); }
    if (sortOrder !== undefined) { fields.push("sort_order"); values.push(+sortOrder); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.exId);
    const setClauses = fields.map((f, i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE exercises SET ${setClauses} WHERE id = $${fields.length + 1}`).run(values);
    ok(res, await db.prepare("SELECT * FROM exercises WHERE id = ?").get(req.params.exId));
  } catch (err) {
    serverError(res, err, "PATCH /workouts/exercises/:exId");
  }
});

// ─── DELETE /api/workouts/exercises/:exId ─────────────────────────────────────
router.delete("/exercises/:exId", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM exercises WHERE id = ?").run(req.params.exId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /workouts/exercises/:exId");
  }
});

// ─── POST /api/workouts/exercises/:exId/log ───────────────────────────────────
// Client marks an exercise done (or undone) for today.
router.post("/exercises/:exId/log", auth(), async (req, res) => {
  try {
    const { completed = true, date } = req.body;
    const logDate = date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const logId   = uuid();

    // Upsert: if already logged today, update; otherwise insert
    const existing = await db.prepare(
      "SELECT id FROM exercise_logs WHERE exercise_id = ? AND client_id = ? AND logged_at LIKE ?"
    ).get(req.params.exId, req.user.userId, `${logDate}%`);

    if (existing) {
      await db.prepare("UPDATE exercise_logs SET completed = ? WHERE id = ?").run(completed ? 1 : 0, existing.id);
      ok(res, { id: existing.id, exercise_id: req.params.exId, completed, logged_at: logDate });
    } else {
      await db.prepare(
        "INSERT INTO exercise_logs (id, exercise_id, client_id, completed, logged_at) VALUES (?, ?, ?, ?, ?)"
      ).run(logId, req.params.exId, req.user.userId, completed ? 1 : 0, new Date().toISOString());
      created(res, { id: logId, exercise_id: req.params.exId, completed, logged_at: logDate });
    }
  } catch (err) {
    serverError(res, err, "POST /workouts/exercises/:exId/log");
  }
});

// ─── GET /api/workouts/client/:clientId/logs ──────────────────────────────────
router.get("/client/:clientId/logs", auth(), async (req, res) => {
  try {
    const dateFilter = req.query.date; // optional YYYY-MM-DD
    let logs;
    if (dateFilter) {
      logs = await db.prepare(
        "SELECT * FROM exercise_logs WHERE client_id = ? AND logged_at LIKE ? ORDER BY logged_at DESC"
      ).all(req.params.clientId, `${dateFilter}%`);
    } else {
      logs = await db.prepare(
        "SELECT * FROM exercise_logs WHERE client_id = ? ORDER BY logged_at DESC LIMIT 200"
      ).all(req.params.clientId);
    }
    ok(res, logs, { total: logs.length });
  } catch (err) {
    serverError(res, err, "GET /workouts/client/:clientId/logs");
  }
});

// ─── GET /api/workouts/coach/:coachId/activity ────────────────────────────────
// Returns recent exercise completions across all coach's clients
router.get("/coach/:coachId/activity", auth("coach"), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT
        el.id, el.logged_at, el.completed,
        el.client_id,
        u.full_name AS client_name,
        e.name AS exercise_name,
        wd.day_label
      FROM exercise_logs el
      JOIN clients c   ON c.id = el.client_id
      JOIN users u     ON u.id = c.id
      JOIN exercises e ON e.id = el.exercise_id
      JOIN workout_days wd ON wd.id = e.day_id
      WHERE c.coach_id = ? AND el.completed = 1
      ORDER BY el.logged_at DESC
      LIMIT 20
    `).all(req.params.coachId);
    ok(res, rows, { total: rows.length });
  } catch (err) { serverError(res, err, "GET /workouts/coach/:coachId/activity"); }
});

module.exports = router;
