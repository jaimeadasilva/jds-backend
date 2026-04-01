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

router.get("/:clientId", auth(), async (req, res) => {
  try {
    const records = await db.prepare(
      "SELECT * FROM medical_records WHERE client_id = ? ORDER BY created_at DESC"
    ).all(req.params.clientId);
    ok(res, records, { total: records.length });
  } catch (err) {
    serverError(res, err, "GET /medical/:clientId");
  }
});

router.post("/:clientId", auth("coach"), async (req, res) => {
  try {
    const { type, text } = req.body;
    if (!type || !text) return badRequest(res, "type and text are required.");
    if (!["note", "injury", "restriction"].includes(type)) {
      return badRequest(res, "type must be 'note', 'injury', or 'restriction'.");
    }
    const recId = uuid();
    const ts    = new Date().toISOString();
    await db.prepare(
      "INSERT INTO medical_records (id, client_id, type, text, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(recId, req.params.clientId, type, text, ts);

    created(res, { id: recId, client_id: req.params.clientId, type, text, created_at: ts });
  } catch (err) {
    serverError(res, err, "POST /medical/:clientId");
  }
});

router.patch("/record/:id", auth("coach"), async (req, res) => {
  try {
    const { type, text } = req.body;
    const fields = []; const values = [];
    if (type !== undefined) { fields.push("type"); values.push(type); }
    if (text !== undefined) { fields.push("text"); values.push(text); }
    if (!fields.length) return badRequest(res, "Nothing to update.");
    values.push(req.params.id);
    const setClauses = fields.map((f,i) => `${f} = $${i+1}`).join(", ");
    await db.prepare(`UPDATE medical_records SET ${setClauses} WHERE id = $${fields.length+1}`).run(values);
    ok(res, await db.prepare("SELECT * FROM medical_records WHERE id = ?").get(req.params.id));
  } catch (err) {
    serverError(res, err, "PATCH /medical/record/:id");
  }
});

router.delete("/record/:id", auth("coach"), async (req, res) => {
  try {
    await db.prepare("DELETE FROM medical_records WHERE id = ?").run(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    serverError(res, err, "DELETE /medical/record/:id");
  }
});

module.exports = router;
