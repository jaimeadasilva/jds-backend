/**
 * src/middleware/auth.js
 *
 * JWT authentication middleware.
 * Attaches decoded { userId, role, email } to req.user.
 *
 * Usage:
 *   router.get("/protected", auth(), handler)         — any authenticated user
 *   router.get("/coach-only", auth("coach"), handler) — coach only
 *   router.get("/client-only", auth("client"), handler)
 */

const jwt = require("jsonwebtoken");

/**
 * @param {"coach"|"client"|null} requiredRole  — if null, any role is accepted
 */
function auth(requiredRole = null) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "No token provided." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const msg = err.name === "TokenExpiredError" ? "Token expired." : "Invalid token.";
      return res.status(401).json({ error: msg });
    }

    if (requiredRole && decoded.role !== requiredRole) {
      return res.status(403).json({ error: `Access denied. Requires role: ${requiredRole}.` });
    }

    req.user = decoded; // { userId, role, email, fullName }
    next();
  };
}

module.exports = auth;
