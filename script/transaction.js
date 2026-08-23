import problems from './parsed_leetcode_problems.json' with { type: 'json' };
import { getPool, closePool, getDbHost } from '../lib/db.js';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

// Timestamped, stage-tagged logger so every phase of the transaction is
// traceable in the console output.
const log = (stage, detail = '') =>
  console.log(
    `[${new Date().toISOString()}] [${stage}]${detail ? ` ${detail}` : ''}`,
  );

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

// The pseudo-ENUMs are enforced with CHECK constraints so the columns stay
// plain TEXT (simpler introspection and binding than native Postgres enums).
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
    concept_covered BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
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
// on INSERT. A BEFORE UPDATE trigger rewrites NEW in place (an AFTER trigger
// issuing its own UPDATE, as the old SQLite version did, would recurse).
const CREATE_TRIGGER = `
  CREATE OR REPLACE FUNCTION set_leetcode_problems_updated_at()
  RETURNS trigger AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_leetcode_problems_updated_at
  BEFORE UPDATE ON leetcode_problems
  FOR EACH ROW
  EXECUTE FUNCTION set_leetcode_problems_updated_at();
`;

const INSERT_COLUMNS = ['link', 'name', 'topic', 'difficulty', 'popularity'];
// 500 rows x 5 params = 2500 parameters per statement, far under pg's 65535
// cap, and ~12 network round trips instead of one per row.
const CHUNK_SIZE = 500;

// --schema-only rebuilds the empty table (DDL, indices, trigger) and skips the
// data insert — used when the table will be reloaded from a backup instead of
// from parsed_leetcode_problems.json (npm run transaction -- --schema-only).
const SCHEMA_ONLY = process.argv.includes('--schema-only');

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

async function main() {
  log('DB TARGET', getDbHost());
  const client = await getPool().connect();

  // Everything below runs inside a single transaction — Postgres DDL is
  // transactional, so if any statement throws we ROLLBACK and the database is
  // left exactly as it was before.
  log('TRANSACTION STARTED');
  await client.query('BEGIN');

  try {
    // QUERY 1a — (re)create the table for a clean, repeatable rebuild.
    await client.query('DROP TABLE IF EXISTS leetcode_problems');
    await client.query(CREATE_TABLE);
    log('TABLE CREATED', 'leetcode_problems');

    // QUERY 1b — indices over topic, difficulty, and (difficulty, topic).
    await client.query(CREATE_INDICES);
    log('INDICES CREATED', 'topic, difficulty, (difficulty, topic)');

    await client.query(CREATE_TRIGGER);
    log('TRIGGER CREATED', 'updated_at auto-touch');

    if (SCHEMA_ONLY) {
      log('SCHEMA ONLY', 'skipping data insert — table left empty');
      await client.query('COMMIT');
      log('TRANSACTION COMMITTED', 'empty table persisted');
      return;
    }

    // QUERY 1c — bulk insert every parsed problem.
    log('INSERTING ROWS', `${problems.length} problems`);

    let coercedTopics = 0;
    const rows = problems.map((p) => {
      // topic is REQUIRED (NOT NULL); the parser leaves some unmapped as null,
      // so coalesce those to a sentinel rather than fail the whole insert.
      if (p.topic == null) coercedTopics += 1;

      return {
        link: p.link,
        name: p.name,
        topic: p.topic ?? 'MISCELLANEOUS',
        difficulty: p.difficulty,
        popularity: p.popularity ?? 0,
      };
    });

    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const width = INSERT_COLUMNS.length;
      const placeholders = chunk
        .map(
          (_, row) =>
            `(${INSERT_COLUMNS.map((_, col) => `$${row * width + col + 1}`).join(', ')})`,
        )
        .join(', ');

      await client.query(
        `INSERT INTO leetcode_problems (${INSERT_COLUMNS.join(', ')})
         VALUES ${placeholders}`,
        chunk.flatMap((row) => INSERT_COLUMNS.map((column) => row[column])),
      );
      inserted += chunk.length;
    }

    if (coercedTopics > 0) {
      log(
        'TOPIC COERCED',
        `${coercedTopics} null topics set to 'MISCELLANEOUS'`,
      );
    }
    log('DATA INSERTED', `${inserted} rows`);

    await client.query('COMMIT');
    log('TRANSACTION COMMITTED', `${inserted} rows persisted`);
  } catch (err) {
    log('FAILED — ABORTING, ROLLING BACK', err.message);
    await client.query('ROLLBACK');
    log('ROLLED BACK', 'database restored to pre-transaction state');
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

try {
  await main();
  log('DONE', 'database setup complete');
} catch (err) {
  console.error(err);
  process.exit(1);
}
