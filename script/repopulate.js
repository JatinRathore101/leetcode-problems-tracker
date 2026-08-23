import fs from 'fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { query, getPool, closePool, getDbHost } from '../lib/db.js';
import {
  BACKUP_DIR,
  TABLE,
  assertTableExists,
  createBackup,
  log,
} from './backup.js';

// Matches the filenames backup.js produces: YYYY-MM-DD_hh.mm.ss_A.
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}_(0[1-9]|1[0-2])\.[0-5]\d\.[0-5]\d_(AM|PM)$/;

// Mirrors of the CHECK constraints in script/transaction.js. Validating here
// turns a raw Postgres check_violation into an error that names the offending
// row and line.
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const STATUSES = ['CLEAR', 'ERROR', 'TLE', 'MLE', 'SUCCESS'];
// concept_covered is a BOOLEAN column; backup.js dumps it as 'true'/'false'.
const BOOLEANS = ['true', 'false'];

// 500 rows per multi-row INSERT keeps each statement's parameter count
// (500 x 11 columns = 5500) far under pg's 65535 cap while avoiding a network
// round trip per row.
const CHUNK_SIZE = 500;

// Which columns may be omitted, and which may hold NULL, both come off the
// table rather than a hardcoded list: a column is REQUIRED in the header when it
// is NOT NULL with no default, and NOT NULL columns can never bind null.
async function schemaRules() {
  const { rows } = await query(
    `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [TABLE],
  );

  return {
    columns: rows.map((column) => column.column_name),
    notNull: rows
      .filter((c) => c.is_nullable === 'NO')
      .map((c) => c.column_name),
    required: rows
      .filter((c) => c.is_nullable === 'NO' && c.column_default === null)
      .map((c) => c.column_name),
  };
}

const USAGE =
  'usage: npm run repopulate <timestamp>   e.g. npm run repopulate 2026-08-16_07.19.32_AM';

// ---------------------------------------------------------------------------
// Argument + file resolution
// ---------------------------------------------------------------------------

// Timestamps of the backups actually on disk, newest last — far more useful in
// an error message than restating the expected format.
function availableTimestamps() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('backup-') && name.endsWith('.csv'))
    .map((name) => name.slice('backup-'.length, -'.csv'.length))
    .sort();
}

function fail(message) {
  const available = availableTimestamps();
  const listing = available.length
    ? `\navailable backups:\n  ${available.join('\n  ')}`
    : `\nno .csv backups found in ${BACKUP_DIR} — run \`npm run backup\` first`;

  throw new Error(`${message}\n${USAGE}${listing}`);
}

function resolveBackupFile() {
  const args = process.argv.slice(2);

  if (args.length === 0) fail('missing <timestamp> argument');
  if (args.length > 1) fail(`expected 1 argument, got ${args.length}`);

  const [stamp] = args;
  if (!TIMESTAMP_PATTERN.test(stamp)) {
    fail(
      `"${stamp}" is not a valid timestamp (expected YYYY-MM-DD_hh.mm.ss_A)`,
    );
  }

  const filePath = join(BACKUP_DIR, `backup-${stamp}.csv`);
  if (!fs.existsSync(filePath)) fail(`no backup file at ${filePath}`);

  return filePath;
}

// ---------------------------------------------------------------------------
// Parse + validate
// ---------------------------------------------------------------------------

// Read the CSV into plain row objects. A bare empty field is a SQL NULL; a
// quoted "" is an empty string — the distinction backup.js's `quoted_string`
// option exists to preserve.
function readBackup(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');

  let records;
  try {
    records = parse(text, {
      columns: true,
      bom: true,
      cast: (value, context) =>
        !context.quoting && value === '' ? null : value,
    });
  } catch (err) {
    // csv-parse messages name the line but not the file.
    throw new Error(`${filePath} is not valid CSV — ${err.message}`);
  }

  // With `columns: true` the header is only observable through a record, so a
  // header-only file needs a second, plain parse of the first line.
  const header = records.length
    ? Object.keys(records[0])
    : (parse(text.split('\n')[0] || '')[0] ?? []);

  return { records, header };
}

// Collect every problem before reporting, so one run surfaces all of them.
function validate(header, records, rules) {
  const errors = [];
  const known = new Set(rules.columns);

  for (const column of header) {
    if (!known.has(column)) {
      errors.push(
        `unknown column "${column}" (table has: ${rules.columns.join(', ')})`,
      );
    }
  }

  for (const column of rules.required) {
    if (!header.includes(column)) {
      errors.push(`missing required column "${column}" (NOT NULL, no default)`);
    }
  }

  // Fail before per-row checks — those read columns that may not exist.
  if (errors.length) return errors;

  const notNullInFile = rules.notNull.filter((column) =>
    header.includes(column),
  );
  const seen = new Map();

  records.forEach((record, index) => {
    // +2: one for the header line, one to count from 1 rather than 0.
    const line = index + 2;

    if (!record.link || String(record.link).trim() === '') {
      errors.push(`line ${line}: empty "link" (it is the primary key)`);
    } else if (seen.has(record.link)) {
      errors.push(
        `line ${line}: duplicate link "${record.link}" (first seen on line ${seen.get(record.link)})`,
      );
    } else {
      seen.set(record.link, line);
    }

    // A bare empty field parses to NULL, which a NOT NULL column rejects at
    // INSERT time — catch it here, with a line number, instead.
    for (const column of notNullInFile) {
      if (record[column] == null) {
        errors.push(
          `line ${line}: "${column}" is NULL but the column is NOT NULL`,
        );
      }
    }

    if (!DIFFICULTIES.includes(record.difficulty)) {
      errors.push(
        `line ${line}: difficulty "${record.difficulty}" must be one of ${DIFFICULTIES.join(', ')}`,
      );
    }
    if (
      header.includes('status') &&
      record.status != null &&
      !STATUSES.includes(record.status)
    ) {
      errors.push(
        `line ${line}: status "${record.status}" must be one of ${STATUSES.join(', ')}`,
      );
    }
    if (
      header.includes('popularity') &&
      record.popularity != null &&
      Number.isNaN(Number(record.popularity))
    ) {
      errors.push(
        `line ${line}: popularity "${record.popularity}" is not a number`,
      );
    }
    if (
      header.includes('concept_covered') &&
      record.concept_covered != null &&
      !BOOLEANS.includes(record.concept_covered)
    ) {
      errors.push(
        `line ${line}: concept_covered "${record.concept_covered}" must be one of ${BOOLEANS.join(', ')}`,
      );
    }
  });

  return errors;
}

// popularity (INTEGER) and concept_covered (BOOLEAN) get explicit JS types;
// everything else binds as a string and Postgres casts server-side (timestamp
// strings parse into timestamptz).
const toBindable = (record, header) =>
  Object.fromEntries(
    header.map((column) => {
      let value = record[column];
      if (value != null) {
        if (column === 'popularity') value = Number(value);
        if (column === 'concept_covered') value = value === 'true';
      }
      return [column, value];
    }),
  );

// ---------------------------------------------------------------------------
// Repopulate
// ---------------------------------------------------------------------------

async function main() {
  // Everything that can fail without touching the database happens first.
  const filePath = resolveBackupFile();
  log('BACKUP FILE', filePath);

  log('DB TARGET', getDbHost());

  let client;
  try {
    await assertTableExists();
    const rules = await schemaRules();

    const { records, header } = readBackup(filePath);
    log('FILE PARSED', `${records.length} rows, columns: ${header.join(', ')}`);

    const errors = validate(header, records, rules);
    if (errors.length) {
      throw new Error(
        `${filePath} failed validation (${errors.length} problem${errors.length === 1 ? '' : 's'}), nothing was changed:\n  ${errors.slice(0, 20).join('\n  ')}${errors.length > 20 ? `\n  …and ${errors.length - 20} more` : ''}`,
      );
    }
    log('FILE VALIDATED', 'no problems found');

    if (records.length === 0) {
      log('EMPTY BACKUP', 'this run will leave the table with zero rows');
    }

    // Safety net: the transaction below protects against a failed load, not
    // against a successful load of the wrong file. Snapshot first.
    const snapshot = await createBackup();
    log('PRE-RESTORE BACKUP', snapshot.csvPath);

    // A plain BEGIN is enough in Postgres — it locks rows as it goes, with no
    // SQLite-style whole-file lock upgrade to pre-empt.
    log('TRANSACTION STARTED');
    client = await getPool().connect();
    await client.query('BEGIN');

    try {
      // No WHERE clause: empties the table but leaves it, its indices, and the
      // updated_at trigger in place.
      const { rowCount: deleted } = await client.query(`DELETE FROM ${TABLE}`);
      log('ROWS DELETED', `${deleted} rows removed (table kept)`);

      const width = header.length;
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk
          .map(
            (_, row) =>
              `(${header.map((_, col) => `$${row * width + col + 1}`).join(', ')})`,
          )
          .join(', ');

        await client.query(
          `INSERT INTO ${TABLE} (${header.join(', ')})
           VALUES ${placeholders}`,
          chunk.flatMap((record) => {
            const bindable = toBindable(record, header);
            return header.map((column) => bindable[column]);
          }),
        );
      }
      log('ROWS INSERTED', `${records.length} rows`);

      // ::int matters: pg returns COUNT(*) (int8) as a string otherwise,
      // which would fail the strict !== comparison below.
      const {
        rows: [{ count }],
      } = await client.query(`SELECT COUNT(*)::int AS count FROM ${TABLE}`);
      if (count !== records.length) {
        throw new Error(
          `post-load count mismatch: table has ${count} rows, file had ${records.length}`,
        );
      }

      await client.query('COMMIT');
      log('TRANSACTION COMMITTED', `${count} rows persisted`);
    } catch (err) {
      log('FAILED — ABORTING, ROLLING BACK', err.message);
      await client.query('ROLLBACK');
      log('ROLLED BACK', 'table restored to its pre-repopulate state');
      throw err;
    }
  } catch (err) {
    log('FAILED', err.message);
    throw err;
  } finally {
    if (client) client.release();
    await closePool();
  }
}

try {
  await main();
  log('DONE', 'repopulate complete');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
