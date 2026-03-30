/**
 * src/routes/files.js
 *
 * POST   /api/files/:clientId           — upload file (PDF, image)
 * GET    /api/files/:clientId           — list files for client
 * DELETE /api/files/:fileId             — delete a file
 * GET    /api/files/download/:fileId    — serve/download a file
 */

const express = require("express");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { v4: uuid } = require("uuid");
const router  = express.Router();

const db   = require("../db").db;
const auth = require("../middleware/auth");
const { ok, created, notFound, serverError } = require("../utils/respond");

// ─── Multer config ─────────────────────────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${uuid()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── POST /api/files/:clientId ────────────────────────────────────────────────
router.post("/:clientId", auth(), upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No valid file provided." });

    const fileId = uuid();
    const ts     = new Date().toISOString();
    const category = req.body.category || "general";

    db.prepare(`
      INSERT INTO files (id, client_id, uploaded_by, filename, original_name, mime_type, size_bytes, category, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, req.params.clientId, req.user.userId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, category, ts);

    created(res, {
      id: fileId, filename: req.file.filename, originalName: req.file.originalname,
      mimeType: req.file.mimetype, sizeBytes: req.file.size, category, uploadedAt: ts,
    });
  } catch (err) {
    serverError(res, err, "POST /files/:clientId");
  }
});

// ─── GET /api/files/:clientId ─────────────────────────────────────────────────
router.get("/:clientId", auth(), (req, res) => {
  try {
    const files = db.prepare(
      "SELECT * FROM files WHERE client_id = ? ORDER BY uploaded_at DESC"
    ).all(req.params.clientId);
    ok(res, files, { total: files.length });
  } catch (err) {
    serverError(res, err, "GET /files/:clientId");
  }
});

// ─── GET /api/files/download/:fileId ──────────────────────────────────────────
router.get("/download/:fileId", auth(), (req, res) => {
  try {
    const file = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.fileId);
    if (!file) return notFound(res, "File");

    const filePath = path.resolve(UPLOAD_DIR, file.filename);
    if (!fs.existsSync(filePath)) return notFound(res, "File on disk");

    res.setHeader("Content-Disposition", `attachment; filename="${file.original_name}"`);
    res.sendFile(filePath);
  } catch (err) {
    serverError(res, err, "GET /files/download/:fileId");
  }
});

// ─── DELETE /api/files/:fileId ────────────────────────────────────────────────
router.delete("/:fileId", auth(), (req, res) => {
  try {
    const file = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.fileId);
    if (!file) return notFound(res, "File");

    // Delete from disk
    const filePath = path.resolve(UPLOAD_DIR, file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare("DELETE FROM files WHERE id = ?").run(req.params.fileId);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /files/:fileId");
  }
});

module.exports = router;
