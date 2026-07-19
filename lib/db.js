import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Location of the file-based SQLite database that backs the Next.js app.
const DB_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DB_DIR, "leetcode.db");

let db;

// Return a singleton better-sqlite3 connection, opening (and creating) the
// database file on first use. Reused across the transaction script and the
// Next.js server so we never open more than one handle per process.
export function getDb() {
  if (db) return db;

  fs.mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
  // WAL gives readers (the Next.js server) concurrency with the writer and is
  // the recommended journal mode for a mostly-read workload.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  return db;
}
