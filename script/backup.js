import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { query, closePool, getDbHost } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = join(__dirname, '..', 'backup');
export const TABLE = 'leetcode_problems';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

// Timestamped, stage-tagged logger, matching script/transaction.js.
export const log = (stage, detail = '') =>
  console.log(
    `[${new Date().toISOString()}] [${stage}]${detail ? ` ${detail}` : ''}`,
  );

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const pad = (value) => String(value).padStart(2, '0');

// Local-time stamp in the form YYYY-MM-DD_hh.mm.ss_A (12-hour clock). Time uses
// dots rather than colons so the filename is checkout-safe on Windows.
function timestamp(date = new Date()) {
  const meridiem = date.getHours() < 12 ? 'AM' : 'PM';
  const hours12 = date.getHours() % 12 || 12;

  const day = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
  const time = [hours12, date.getMinutes(), date.getSeconds()]
    .map(pad)
    .join('.');

  return `${day}_${time}_${meridiem}`;
}

// `quoted_string` makes the dump reloadable without losing NULL semantics: every
// TEXT value is quoted, so an empty string round-trips as "" while a SQL NULL
// stays a bare empty field. It matters here because /update-problem writes
// solution = '' on CLEAR while the column default is NULL.
// `cast.date` matters because pg returns timestamptz columns as JS Dates —
// serialize them as ISO strings so they round-trip cleanly on repopulate.
// `cast.boolean` matters because csv-stringify's default is `value ? '1' : ''`,
// so a false concept_covered would dump as a bare empty field, which repopulate
// reads back as SQL NULL — a NOT NULL violation.
const CSV_OPTIONS = {
  header: true,
  quoted_string: true,
  cast: {
    date: (value) => value.toISOString(),
    boolean: (value) => (value ? 'true' : 'false'),
  },
};

// Drop NULL/undefined columns so each JSON object carries only the keys it
// actually has values for. Empty strings are kept — unlike NULL they are a value
// the app writes deliberately (solution = '' on CLEAR).
const compact = (row) =>
  Object.fromEntries(Object.entries(row).filter(([, value]) => value != null));

// A row carrying no data at all is noise in the JSON dump. After compaction an
// all-NULL row collapses to a literal {}; an all-blank one keeps its keys, so
// test for both.
const hasData = (row) =>
  Object.values(row).some((value) => String(value).trim() !== '');

// Assert the table exists, with a message that points at the fix.
export async function assertTableExists() {
  const { rows } = await query('SELECT to_regclass($1) AS reg', [
    `public.${TABLE}`,
  ]);

  if (!rows[0].reg) {
    throw new Error(
      `table "${TABLE}" not found in Postgres (${getDbHost()}) — run \`npm run db:setup\` first`,
    );
  }
}

// Column names straight off the table, so callers never hardcode the schema.
export async function tableColumns() {
  const { rows } = await query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [TABLE],
  );
  return rows.map((row) => row.column_name);
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

// Dump the table to a timestamped .csv/.json pair and return their paths.
// Queries go through the shared pool; the caller decides when to closePool()
// (repopulate.js keeps it open for its own transaction afterwards).
export async function createBackup() {
  await assertTableExists();

  const columns = await tableColumns();
  log('SCHEMA READ', `${columns.length} columns: ${columns.join(', ')}`);

  // Stable ordering keeps consecutive backups diff-friendly.
  const { rows } = await query(`SELECT * FROM ${TABLE} ORDER BY topic, name`);
  log('ROWS READ', `${rows.length} rows`);

  if (rows.length === 0) {
    log('TABLE EMPTY', 'writing a header-only CSV and an empty JSON array');
  }

  // One timestamp for both files so the .csv and .json of a single run always
  // share a name — taking it twice could straddle a second boundary.
  const basePath = join(BACKUP_DIR, `backup-${timestamp()}`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const csvPath = `${basePath}.csv`;
  fs.writeFileSync(csvPath, stringify(rows, { ...CSV_OPTIONS, columns }));
  log('CSV WRITTEN', `${rows.length} rows -> ${csvPath}`);

  const records = rows.map(compact).filter(hasData);
  const skipped = rows.length - records.length;
  if (skipped > 0) log('EMPTY ROWS SKIPPED', `${skipped} omitted from JSON`);

  const jsonPath = `${basePath}.json`;
  fs.writeFileSync(jsonPath, `${JSON.stringify(records, null, 2)}\n`);
  log('JSON WRITTEN', `${records.length} records -> ${jsonPath}`);

  return { csvPath, jsonPath, rows };
}

// ---------------------------------------------------------------------------
// CLI entry — only when run directly, so importing this module is side-effect
// free for repopulate.js.
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  log('DB TARGET', getDbHost());

  try {
    await createBackup();
    log('DONE', 'backup complete');
  } catch (err) {
    log('FAILED', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await closePool();
  }
}
