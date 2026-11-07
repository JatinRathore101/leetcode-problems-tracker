import problems from './parsed_leetcode_problems.json' with { type: 'json' };
import topics from './topics.json' with { type: 'json' };
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
    topic      TEXT        NOT NULL,
    difficulty TEXT        NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    popularity INTEGER     DEFAULT 0,
    comment    TEXT        DEFAULT NULL,
    status     TEXT        NOT NULL DEFAULT 'CLEAR'
                 CHECK (status IN ('CLEAR', 'ERROR', 'TLE', 'MLE', 'SUCCESS',
                                   'LOCKED')),
    solution   TEXT        DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

// topic is pipe-joined and always filtered by substring (strpos), which a
// B-tree on topic cannot serve, so only difficulty is indexed. At ~4k rows the
// topic match is a cheap scan of the difficulty-filtered rows.
const CREATE_INDICES = `
  CREATE INDEX idx_leetcode_problems_difficulty
    ON leetcode_problems (difficulty);
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

// One row per individual LeetCode tag (script/topics.json), holding the
// user's per-topic concept-covered flag. Unlike leetcode_problems this table
// is NEVER dropped by this script: it is created if missing and new tags are
// added, so concept_covered survives every rebuild.
const CREATE_TOPICS_TABLE = `
  CREATE TABLE IF NOT EXISTS dsa_topics (
    topic           TEXT    NOT NULL PRIMARY KEY,
    concept_covered BOOLEAN NOT NULL DEFAULT FALSE
  )
`;

// Add any tag not yet in dsa_topics; existing rows (and their flag) are kept.
const SEED_TOPICS = `
  INSERT INTO dsa_topics (topic)
  SELECT unnest($1::text[])
  ON CONFLICT (topic) DO NOTHING
`;

const INSERT_COLUMNS = [
  'link',
  'name',
  'topic',
  'difficulty',
  'popularity',
  'status',
];
// 500 rows x 6 params = 3000 parameters per statement, far under pg's 65535
// cap, and ~9 network round trips instead of one per row.
const CHUNK_SIZE = 500;

// --schema-only rebuilds the empty table (DDL, indices, trigger, dsa_topics
// seed) and skips the problem insert — used when the table will be reloaded
// from a backup instead of from parsed_leetcode_problems.json
// (npm run transaction -- --schema-only).
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

    // QUERY 1b — index over difficulty.
    await client.query(CREATE_INDICES);
    log('INDICES CREATED', 'difficulty');

    await client.query(CREATE_TRIGGER);
    log('TRIGGER CREATED', 'updated_at auto-touch');

    // QUERY 1c — dsa_topics: create if missing, add new tags, keep flags.
    await client.query(CREATE_TOPICS_TABLE);
    const { rowCount: addedTopics } = await client.query(SEED_TOPICS, [topics]);
    log(
      'TOPICS SEEDED',
      `dsa_topics: ${addedTopics} new of ${topics.length} in topics.json`,
    );

    if (SCHEMA_ONLY) {
      log('SCHEMA ONLY', 'skipping data insert — table left empty');
      await client.query('COMMIT');
      log('TRANSACTION COMMITTED', 'empty table persisted');
      return;
    }

    // QUERY 1d — bulk insert every parsed problem.
    log('INSERTING ROWS', `${problems.length} problems`);

    // A parsed file without the premium flag would load every problem as
    // free, so refuse it (checked as a missing key: `false` is valid).
    const stale = problems.filter((p) => !('isPaidOnly' in p)).length;
    if (stale > 0) {
      throw new Error(
        `${stale}/${problems.length} parsed rows have no "isPaidOnly" key — run \`npm run scrape && npm run parse\` first`,
      );
    }

    const rows = problems.map((p) => ({
      link: p.link,
      name: p.name,
      // Pipe-separated tags, e.g. "ARRAY|HASH TABLE"; '' for untagged
      // problems (topic is NOT NULL, so never bind null).
      topic: p.topic ?? '',
      difficulty: p.difficulty,
      popularity: p.popularity ?? 0,
      // Premium is a scraped fact; everything else starts at the default.
      status: p.isPaidOnly ? 'LOCKED' : 'CLEAR',
    }));

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

    const locked = rows.filter((row) => row.status === 'LOCKED').length;
    log('DATA INSERTED', `${inserted} rows (${locked} LOCKED)`);

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
