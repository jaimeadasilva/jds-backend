/**
 * src/utils/respond.js
 * Consistent API response helpers.
 */

/** 200 OK */
const ok = (res, data, meta = {}) =>
  res.json({ success: true, data, ...meta });

/** 201 Created */
const created = (res, data) =>
  res.status(201).json({ success: true, data });

/** 400 Bad Request */
const badRequest = (res, message) =>
  res.status(400).json({ success: false, error: message });

/** 404 Not Found */
const notFound = (res, entity = "Resource") =>
  res.status(404).json({ success: false, error: `${entity} not found.` });

/** 409 Conflict */
const conflict = (res, message) =>
  res.status(409).json({ success: false, error: message });

/** 500 Internal Server Error */
const serverError = (res, err, context = "") => {
  console.error(`[ERROR] ${context}`, err);
  res.status(500).json({ success: false, error: "Internal server error." });
};

module.exports = { ok, created, badRequest, notFound, conflict, serverError };
