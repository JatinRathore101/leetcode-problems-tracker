import problems from "./parsed_leetcode_problems.json" with { type: "json" };
import { getDb, DB_PATH } from "../lib/db.js";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

// Timestamped, stage-tagged logger so every phase of the transaction is
// traceable in the console output.
const log = (stage, detail = "") =>
  console.log(
    `[${new Date().toISOString()}] [${stage}]${detail ? ` ${detail}` : ""}`,
  );

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

// SQLite has no native ENUM or now() — ENUMs are enforced with CHECK
// constraints and timestamp defaults use CURRENT_TIMESTAMP.
const CREATE_TABLE = `
  CREATE TABLE leetcode_problems (
    link       TEXT        NOT NULL PRIMARY KEY,
    name       TEXT        NOT NULL,
    topic      VARCHAR(40) NOT NULL,
    difficulty TEXT        NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    popularity INTEGER     DEFAULT 0,
    comment    TEXT        DEFAULT NULL,
    status     TEXT        NOT NULL DEFAULT 'CLEAR'
                 CHECK (status IN ('CLEAR', 'ERROR', 'TLE', 'MLE', 'SUCCESS')),
    solution   TEXT        DEFAULT NULL,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const CREATE_INDICES = `
  CREATE INDEX idx_leetcode_problems_topic
    ON leetcode_problems (topic);
  CREATE INDEX idx_leetcode_problems_difficulty
    ON leetcode_problems (difficulty);
  CREATE INDEX idx_leetcode_problems_difficulty_topic
    ON leetcode_problems (difficulty, topic);
`;

// Keep updated_at honest on every row mutation — the column default only fires
// on INSERT, so a trigger maintains it for UPDATEs.
const CREATE_TRIGGER = `
  CREATE TRIGGER trg_leetcode_problems_updated_at
  AFTER UPDATE ON leetcode_problems
  FOR EACH ROW
  BEGIN
    UPDATE leetcode_problems
       SET updated_at = CURRENT_TIMESTAMP
     WHERE link = OLD.link;
  END;
`;

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

function main() {
  const db = getDb();
  log("DB CONNECTED", DB_PATH);

  // Everything below runs inside a single transaction. If any statement
  // throws, we ROLLBACK and the database is left exactly as it was before.
  log("TRANSACTION STARTED");
  db.exec("BEGIN");

  try {
    // QUERY 1a — (re)create the table for a clean, repeatable rebuild.
    db.exec("DROP TABLE IF EXISTS leetcode_problems");
    db.exec(CREATE_TABLE);
    log("TABLE CREATED", "leetcode_problems");

    // QUERY 1b — indices over topic, difficulty, and (difficulty, topic).
    db.exec(CREATE_INDICES);
    log("INDICES CREATED", "topic, difficulty, (difficulty, topic)");

    db.exec(CREATE_TRIGGER);
    log("TRIGGER CREATED", "updated_at auto-touch");

    // QUERY 1c — bulk insert every parsed problem.
    const insert = db.prepare(`
      INSERT INTO leetcode_problems (link, name, topic, difficulty, popularity)
      VALUES (@link, @name, @topic, @difficulty, @popularity)
    `);

    log("INSERTING ROWS", `${problems.length} problems`);

    let inserted = 0;
    let coercedTopics = 0;
    for (const p of problems) {
      // topic is REQUIRED (NOT NULL); the parser leaves some unmapped as null,
      // so coalesce those to a sentinel rather than fail the whole insert.
      const topic = p.topic ?? "UNKNOWN";
      if (p.topic == null) coercedTopics += 1;

      insert.run({
        link: p.link,
        name: p.name,
        topic,
        difficulty: p.difficulty,
        popularity: p.popularity ?? 0,
      });
      inserted += 1;
    }

    if (coercedTopics > 0) {
      log("TOPIC COERCED", `${coercedTopics} null topics set to 'UNKNOWN'`);
    }
    log("DATA INSERTED", `${inserted} rows`);

    db.exec("COMMIT");
    log("TRANSACTION COMMITTED", `${inserted} rows persisted`);
  } catch (err) {
    log("FAILED — ABORTING, ROLLING BACK", err.message);
    db.exec("ROLLBACK");
    log("ROLLED BACK", "database restored to pre-transaction state");
    throw err;
  } finally {
    db.close();
  }
}

try {
  main();
  log("DONE", "database setup complete");
} catch (err) {
  console.error(err);
  process.exit(1);
}
