/**
 * src/routes/clients.js
 *
 * GET    /api/clients                  — list all clients (coach)
 * POST   /api/clients                  — create client + user account (coach)
 * GET    /api/clients/:id              — full client profile
 * PATCH  /api/clients/:id              — update client profile fields
 * DELETE /api/clients/:id              — delete client (coach)
 *
 * GET    /api/clients/:id/summary      — stats summary (weight, BMI, IBW, progress)
 * GET    /api/clients/:id/equipment    — get equipment list
 * PUT    /api/clients/:id/equipment    — replace full equipment list
 * POST   /api/clients/:id/weight       — log a new weight entry
 * GET    /api/clients/:id/weight       — get weight history
 */

const express = require("express");
const bcrypt  = require("bcryptjs");
const { v4: uuid } = require("uuid");
const router  = express.Router();

const db      = require("../db").db;
const auth    = require("../middleware/auth");
const { enrichClient } = require("../utils/health");
const { ok, created, badRequest, notFound, conflict, serverError } = require("../utils/respond");

// ─── GET /api/clients ─────────────────────────────────────────────────────────
// Coach sees all their clients. Client sees only themselves.
router.get("/", auth(), (req, res) => {
  try {
    let rows;
    if (req.user.role === "coach") {
      rows = db.prepare(`
        SELECT c.*, u.email, u.full_name
        FROM clients c
        JOIN users u ON u.id = c.id
        WHERE c.coach_id = ?
        ORDER BY u.full_name
      `).all(req.user.userId);
    } else {
      rows = db.prepare(`
        SELECT c.*, u.email, u.full_name
        FROM clients c
        JOIN users u ON u.id = c.id
        WHERE c.id = ?
      `).all(req.user.userId);
    }

    const data = rows.map(enrichClient);
    ok(res, data, { total: data.length });
  } catch (err) {
    serverError(res, err, "GET /clients");
  }
});

// ─── POST /api/clients ────────────────────────────────────────────────────────
router.post("/", auth("coach"), (req, res) => {
  try {
    const { email, password = "Client123!", fullName, age, heightCm, weightKg, goal } = req.body;
    if (!email || !fullName) return badRequest(res, "email and fullName are required.");
    const safeGoal = goal || "Fat Loss";
    if (goal && !["Fat Loss", "Muscle Gain", "Maintenance"].includes(goal)) {
      return badRequest(res, "goal must be 'Fat Loss', 'Muscle Gain', or 'Maintenance'.");
    }

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
    if (exists) return conflict(res, "Email already registered.");

    const userId = uuid();
    const ts     = new Date().toISOString();
    const avatar = fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, full_name, created_at, updated_at)
        VALUES (?, ?, ?, 'client', ?, ?, ?)
      `).run(userId, email.toLowerCase().trim(), bcrypt.hashSync(password, 10), fullName, ts, ts);

      db.prepare(`
        INSERT INTO clients (id, coach_id, age, height_cm, weight_kg, goal, progress_pct, avatar_initials, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(userId, req.user.userId, age || null, heightCm || null, weightKg || null, safeGoal, avatar, ts, ts);

      // Log initial weight if provided
      if (weightKg) {
        db.prepare("INSERT INTO weight_logs (id, client_id, weight_kg, logged_at) VALUES (?, ?, ?, ?)")
          .run(uuid(), userId, weightKg, ts);
      }
    })();

    const newClient = db.prepare(`
      SELECT c.*, u.email, u.full_name FROM clients c JOIN users u ON u.id = c.id WHERE c.id = ?
    `).get(userId);

    return created(res, enrichClient(newClient));
  } catch (err) {
    serverError(res, err, "POST /clients");
  }
});

// ─── GET /api/clients/:id ─────────────────────────────────────────────────────
router.get("/:id", auth(), (req, res) => {
  try {
    const { id } = req.params;

    // Access control: coach can see their clients; client can only see themselves
    if (req.user.role === "client" && req.user.userId !== id) {
      return res.status(403).json({ error: "Access denied." });
    }

    const client = db.prepare(`
      SELECT c.*, u.email, u.full_name FROM clients c JOIN users u ON u.id = c.id WHERE c.id = ?
    `).get(id);
    if (!client) return notFound(res, "Client");

    if (req.user.role === "coach" && client.coach_id !== req.user.userId) {
      return res.status(403).json({ error: "Access denied." });
    }

    // Attach equipment list
    const equipment = db.prepare("SELECT item FROM equipment WHERE client_id = ?").all(id).map(r => r.item);

    // Attach medical records
    const medical = db.prepare("SELECT * FROM medical_records WHERE client_id = ? ORDER BY created_at DESC").all(id);

    // Attach active workout plan (summary only)
    const workoutPlan = db.prepare("SELECT * FROM workout_plans WHERE client_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1").get(id);

    // Attach active nutrition plan (summary only)
    const nutritionPlan = db.prepare("SELECT * FROM nutrition_plans WHERE client_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1").get(id);

    // Latest weight log
    const latestWeight = db.prepare("SELECT * FROM weight_logs WHERE client_id = ? ORDER BY logged_at DESC LIMIT 1").get(id);

    ok(res, {
      ...enrichClient(client),
      equipment,
      medical,
      workoutPlan:    workoutPlan   || null,
      nutritionPlan:  nutritionPlan || null,
      latestWeight:   latestWeight  || null,
    });
  } catch (err) {
    serverError(res, err, "GET /clients/:id");
  }
});

// ─── PATCH /api/clients/:id ───────────────────────────────────────────────────
router.patch("/:id", auth(), (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role === "client" && req.user.userId !== id) {
      return res.status(403).json({ error: "Access denied." });
    }

    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
    if (!client) return notFound(res, "Client");

    if (req.user.role === "coach" && client.coach_id !== req.user.userId) {
      return res.status(403).json({ error: "Access denied." });
    }

    const allowed = ["age", "height_cm", "weight_kg", "goal", "progress_pct"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    // Also allow full_name update via users table
    const ts = new Date().toISOString();
    updates["updated_at"] = ts;

    if (Object.keys(updates).length === 0) return badRequest(res, "No valid fields to update.");

    const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE clients SET ${setClauses} WHERE id = @id`).run({ ...updates, id });

    // If weight changed, log it
    if (req.body.weight_kg) {
      db.prepare("INSERT INTO weight_logs (id, client_id, weight_kg, logged_at) VALUES (?, ?, ?, ?)")
        .run(uuid(), id, req.body.weight_kg, ts);
    }

    // Update full_name in users table if provided
    if (req.body.fullName) {
      db.prepare("UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?").run(req.body.fullName, ts, id);
    }

    const updated = db.prepare(`
      SELECT c.*, u.email, u.full_name FROM clients c JOIN users u ON u.id = c.id WHERE c.id = ?
    `).get(id);

    ok(res, enrichClient(updated));
  } catch (err) {
    serverError(res, err, "PATCH /clients/:id");
  }
});

// ─── DELETE /api/clients/:id ──────────────────────────────────────────────────
router.delete("/:id", auth("coach"), (req, res) => {
  try {
    const { id } = req.params;
    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
    if (!client) return notFound(res, "Client");
    if (client.coach_id !== req.user.userId) return res.status(403).json({ error: "Access denied." });

    // CASCADE deletes handle all child records
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    ok(res, { deleted: true, id });
  } catch (err) {
    serverError(res, err, "DELETE /clients/:id");
  }
});

// ─── GET /api/clients/:id/summary ─────────────────────────────────────────────
router.get("/:id/summary", auth(), (req, res) => {
  try {
    const { id } = req.params;
    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
    if (!client) return notFound(res, "Client");

    const weights = db.prepare("SELECT weight_kg, logged_at FROM weight_logs WHERE client_id = ? ORDER BY logged_at ASC").all(id);
    const enriched = enrichClient(client);

    // Calculate weight change
    const weightChange = weights.length >= 2
      ? Math.round((weights[weights.length - 1].weight_kg - weights[0].weight_kg) * 10) / 10
      : 0;

    ok(res, {
      bmi:              enriched.bmi,
      bmi_category:     enriched.bmi_category,
      ideal_weight_kg:  enriched.ideal_weight_kg,
      current_weight:   client.weight_kg,
      weight_change:    weightChange,
      progress_pct:     client.progress_pct,
      goal:             client.goal,
      weight_history:   weights,
    });
  } catch (err) {
    serverError(res, err, "GET /clients/:id/summary");
  }
});

// ─── GET /api/clients/:id/equipment ───────────────────────────────────────────
router.get("/:id/equipment", auth(), (req, res) => {
  try {
    const items = db.prepare("SELECT item FROM equipment WHERE client_id = ?").all(req.params.id).map(r => r.item);
    ok(res, items);
  } catch (err) {
    serverError(res, err, "GET /clients/:id/equipment");
  }
});

// ─── PUT /api/clients/:id/equipment ───────────────────────────────────────────
// Replaces the entire equipment list atomically.
router.put("/:id/equipment", auth(), (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body; // string[]
    if (!Array.isArray(items)) return badRequest(res, "items must be an array of strings.");

    db.transaction(() => {
      db.prepare("DELETE FROM equipment WHERE client_id = ?").run(id);
      const insert = db.prepare("INSERT OR IGNORE INTO equipment (id, client_id, item) VALUES (?, ?, ?)");
      for (const item of items) insert.run(uuid(), id, item);
    })();

    ok(res, items);
  } catch (err) {
    serverError(res, err, "PUT /clients/:id/equipment");
  }
});

// ─── POST /api/clients/:id/weight ─────────────────────────────────────────────
router.post("/:id/weight", auth(), (req, res) => {
  try {
    const { id } = req.params;
    const { weightKg, note } = req.body;
    if (!weightKg) return badRequest(res, "weightKg is required.");

    const logId = uuid();
    const ts    = new Date().toISOString();
    db.prepare("INSERT INTO weight_logs (id, client_id, weight_kg, logged_at, note) VALUES (?, ?, ?, ?, ?)")
      .run(logId, id, weightKg, ts, note || null);

    // Update current weight on client profile
    db.prepare("UPDATE clients SET weight_kg = ?, updated_at = ? WHERE id = ?").run(weightKg, ts, id);

    created(res, { id: logId, client_id: id, weight_kg: weightKg, logged_at: ts, note });
  } catch (err) {
    serverError(res, err, "POST /clients/:id/weight");
  }
});

// ─── GET /api/clients/:id/weight ──────────────────────────────────────────────
router.get("/:id/weight", auth(), (req, res) => {
  try {
    const logs = db.prepare("SELECT * FROM weight_logs WHERE client_id = ? ORDER BY logged_at ASC").all(req.params.id);
    ok(res, logs, { total: logs.length });
  } catch (err) {
    serverError(res, err, "GET /clients/:id/weight");
  }
});

module.exports = router;
