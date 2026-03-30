/**
 * src/db/index.js
 * Pure-JS SQLite via sql.js — no compilation, works on any Node version.
 */

require("dotenv").config();
const path = require("path");
const fs   = require("fs");

const DB_PATH = path.resolve(process.env.DB_PATH || "./data/jds.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db = null;

function getDb() {
  if (_db) return _db;
  throw new Error("DB not initialised — call initDb() first");
}

async function initDb() {
  if (_db) return _db;
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    _db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    _db = new SQL.Database();
  }
  _db.run("PRAGMA foreign_keys = ON;");
  console.log("📦  Database ready:", DB_PATH);
  return _db;
}

function save() {
  if (!_db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

function flattenParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && args[0] !== null && typeof args[0] === "object" && !Array.isArray(args[0])) {
    const out = {};
    for (const [k, v] of Object.entries(args[0])) {
      out[k.replace(/^@/, "$")] = v;
    }
    return out;
  }
  return args.flat();
}

const db = {
  prepare(sql) {
    return {
      run(...args) {
        getDb().run(sql, flattenParams(args));
        save();
        return { changes: 1 };
      },
      get(...args) {
        const stmt = getDb().prepare(sql);
        stmt.bind(flattenParams(args));
        const row = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return row;
      },
      all(...args) {
        const rows = [];
        const stmt = getDb().prepare(sql);
        stmt.bind(flattenParams(args));
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
    };
  },
  exec(sql) { getDb().exec(sql); save(); },
  run(sql, p) { getDb().run(sql, p || []); save(); },
  transaction(fn) {
    return (...args) => {
      getDb().run("BEGIN");
      try {
        const r = fn(...args);
        getDb().run("COMMIT");
        save();
        return r;
      } catch (e) {
        getDb().run("ROLLBACK");
        throw e;
      }
    };
  },
  pragma() {},
};

module.exports = { db, initDb, save };
