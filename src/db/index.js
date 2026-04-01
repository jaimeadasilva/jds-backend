/**
 * src/db/index.js — PostgreSQL client
 * Same interface as sql.js shim: prepare().run/get/all
 * Handles both ? positional params and @name named params.
 */
require("dotenv").config();
const { Pool } = require("pg");

let pool = null;

async function initDb() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 10,
  });
  const client = await pool.connect();
  console.log("🐘  PostgreSQL connected");
  client.release();
  return pool;
}

/**
 * Convert SQL + params to pg format.
 * Handles:
 *   - ? positional:  ("INSERT INTO x VALUES (?,?)", [a, b])
 *   - @name named:   ("UPDATE x SET a=@a WHERE id=@id", {a:1, id:"x"})
 */
function toPg(sql, params) {
  if (!params || (Array.isArray(params) && params.length === 0)) {
    return { text: sql, values: [] };
  }

  // Named params object { @name or name : value }
  if (!Array.isArray(params) && typeof params === "object") {
    // Find all @name occurrences in SQL (in order)
    const namedMatches = [...sql.matchAll(/@(\w+)/g)];
    if (namedMatches.length > 0) {
      let text = sql;
      const values = [];
      let counter = 1;
      // Replace each @name with $N, using the object value
      for (const match of namedMatches) {
        const name = match[1];
        const key = Object.keys(params).find(k => k.replace(/^@/, "") === name);
        if (key !== undefined) {
          text = text.replace(`@${name}`, `$${counter}`);
          values.push(params[key]);
          counter++;
        }
      }
      return { text, values };
    }
    // No @name params — treat as positional from object values
    const values = Object.values(params);
    let counter = 1;
    const text = sql.replace(/\?/g, () => `$${counter++}`);
    return { text, values };
  }

  // Positional array
  const values = params.flat();
  let counter = 1;
  const text = sql.replace(/\?/g, () => `$${counter++}`);
  return { text, values };
}

async function query(sql, params) {
  const { text, values } = toPg(sql, params);
  try {
    const result = await pool.query(text, values);
    return result;
  } catch (err) {
    console.error("DB ERROR:", err.message);
    console.error("SQL:", text);
    console.error("Values:", JSON.stringify(values));
    throw err;
  }
}

const db = {
  prepare(sql) {
    return {
      async run(...args) {
        const params = resolveArgs(args);
        await query(sql, params);
        return { changes: 1 };
      },
      async get(...args) {
        const params = resolveArgs(args);
        const result = await query(sql, params);
        return result.rows[0] || undefined;
      },
      async all(...args) {
        const params = resolveArgs(args);
        const result = await query(sql, params);
        return result.rows;
      },
    };
  },
  async run(sql, params) { await query(sql, params || []); },
  async exec(sql) {
    // Split on ; for multi-statement exec
    const stmts = sql.split(";").map(s => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await pool.query(stmt);
    }
  },
};

function resolveArgs(args) {
  if (args.length === 0) return [];
  if (args.length === 1) {
    const a = args[0];
    if (a === null || a === undefined) return [];
    if (Array.isArray(a)) return a.flat();
    if (typeof a === "object") return a; // named params
    return [a];
  }
  return args.flat();
}

module.exports = { db, initDb, save: () => {} };
