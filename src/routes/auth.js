/**
 * src/routes/auth.js
 *
 * POST /api/auth/login          — login for both coaches and clients
 * POST /api/auth/register       — register a new coach (admin only in prod)
 * GET  /api/auth/me             — get current user info
 * POST /api/auth/change-password
 */

const express = require("express");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { v4: uuid } = require("uuid");
const router  = express.Router();

const db      = require("../db").db;
const auth    = require("../middleware/auth");
const { ok, created, badRequest, notFound, conflict, serverError } = require("../utils/respond");

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return badRequest(res, "Email and password are required.");

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: "Invalid credentials." });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials." });

    const payload = { userId: user.id, role: user.role, email: user.email, fullName: user.full_name };
    const token   = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

    // If client, also fetch client profile
    let clientProfile = null;
    if (user.role === "client") {
      clientProfile = db.prepare("SELECT * FROM clients WHERE id = ?").get(user.id);
    }

    return ok(res, {
      token,
      user: { id: user.id, email: user.email, role: user.role, fullName: user.full_name },
      clientProfile,
    });
  } catch (err) {
    serverError(res, err, "POST /auth/login");
  }
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// In production, restrict this to existing coaches or an admin secret.
router.post("/register", (req, res) => {
  try {
    const { email, password, fullName, role = "coach", adminSecret } = req.body;

    // Simple guard — in production, use a real admin flow
    if (role === "coach" && adminSecret !== process.env.ADMIN_SECRET && process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Cannot self-register as coach in production." });
    }

    if (!email || !password || !fullName) return badRequest(res, "email, password and fullName are required.");
    if (!["coach", "client"].includes(role)) return badRequest(res, "role must be 'coach' or 'client'.");
    if (password.length < 8) return badRequest(res, "Password must be at least 8 characters.");

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
    if (exists) return conflict(res, "Email already registered.");

    const userId = uuid();
    const hash   = bcrypt.hashSync(password, 10);
    const ts     = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, full_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, email.toLowerCase().trim(), hash, role, fullName, ts, ts);

    const payload = { userId, role, email: email.toLowerCase().trim(), fullName };
    const token   = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

    return created(res, {
      token,
      user: { id: userId, email: email.toLowerCase().trim(), role, fullName },
    });
  } catch (err) {
    serverError(res, err, "POST /auth/register");
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", auth(), (req, res) => {
  try {
    const user = db.prepare("SELECT id, email, role, full_name, created_at FROM users WHERE id = ?").get(req.user.userId);
    if (!user) return notFound(res, "User");

    let clientProfile = null;
    if (user.role === "client") {
      clientProfile = db.prepare("SELECT * FROM clients WHERE id = ?").get(user.id);
    }

    ok(res, { user, clientProfile });
  } catch (err) {
    serverError(res, err, "GET /auth/me");
  }
});

// ─── POST /api/auth/change-password ───────────────────────────────────────────
router.post("/change-password", auth(), (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return badRequest(res, "currentPassword and newPassword required.");
    if (newPassword.length < 8) return badRequest(res, "New password must be at least 8 characters.");

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.userId);
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: "Current password incorrect." });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(newHash, new Date().toISOString(), req.user.userId);

    ok(res, { message: "Password updated." });
  } catch (err) {
    serverError(res, err, "POST /auth/change-password");
  }
});

module.exports = router;
