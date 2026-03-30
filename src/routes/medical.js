/**
 * src/routes/medical.js
 *
 * GET    /api/medical/:clientId         — list all records for a client
 * POST   /api/medical/:clientId         — add a record
 * PATCH  /api/medical/record/:id        — update a record
 * DELETE /api/medical/record/:id        — delete a record
 */

const express = require("express");
const { v4: uuid } = require("uuid");
const router  = express.Router();

const db   = require("../db").db;
const auth = require("../middleware/auth");
const { ok, created, badRequest, serverError } = require("../utils/respond");

router.get("/:clientId", auth(), (req, res) => {
  try {
    const records = db.prepare(
      "SELECT * FROM medical_records WHERE client_id = ? ORDER BY created_at DESC"
    ).all(req.params.clientId);
    ok(res, records, { total: records.length });
  } catch (err) {
    serverError(res, err, "GET /medical/:clientId");
  }
});

router.post("/:clientId", auth("coach"), (req, res) => {
  try {
    const { type, text } = req.body;
    if (!type || !text) return badRequest(res, "type and text are required.");
    if (!["note", "injury", "restriction"].includes(type)) {
      return badRequest(res, "type must be 'note', 'injury', or 'restriction'.");
    }
    const recId = uuid();
    const ts    = new Date().toISOString();
    db.prepare(
      "INSERT INTO medical_records (id, client_id, type, text, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(recId, req.params.clientId, type, text, ts);

    created(res, { id: recId, client_id: req.params.clientId, type, text, created_at: ts });
  } catch (err) {
    serverError(res, err, "POST /medical/:clientId");
  }
});

router.patch("/record/:id", auth("coach"), (req, res) => {
  try {
    const { type, text } = req.body;
    const updates = []; const params = {};
    if (type !== undefined) { updates.push("type = @type"); params.type = type; }
    if (text !== undefined) { updates.push("text = @text"); params.text = text; }
    if (!updates.length) return badRequest(res, "Nothing to update.");
    params.id = req.params.id;
    db.prepare(`UPDATE medical_records SET ${updates.join(", ")} WHERE id = @id`).run(params);
    ok(res, db.prepare("SELECT * FROM medical_records WHERE id = ?").get(req.params.id));
  } catch (err) {
    serverError(res, err, "PATCH /medical/record/:id");
  }
});

router.delete("/record/:id", auth("coach"), (req, res) => {
  try {
    db.prepare("DELETE FROM medical_records WHERE id = ?").run(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /medical/record/:id");
  }
});

module.exports = router;
