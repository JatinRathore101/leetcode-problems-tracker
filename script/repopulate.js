import fs from 'fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { getDb, DB_PATH } from '../lib/db.js';
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
// turns a raw SQLITE_CONSTRAINT into an error that names the offending row.
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const STATUSES = ['CLEAR', 'ERROR', 'TLE', 'MLE', 'SUCCESS'];

// Which columns may be omitted, and which may hold NULL, both come off the
// table rather than a hardcoded list: a column is REQUIRED in the header when it
// is NOT NULL with no default, and NOT NULL columns can never bind null.
const schemaRules = (db) => {
  const info = db.pragma(`table_info(${TABLE})`);

  return {
    columns: info.map((column) => column.name),
    notNull: info.filter((c) => c.notnull === 1).map((c) => c.name),
    required: info
      .filter((c) => c.notnull === 1 && c.dflt_value === null)
      .map((c) => c.name),
  };
};

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
  });

  return errors;
}

// popularity is the one INTEGER column; everything else is TEXT and binds as-is.
const toBindable = (record, header) =>
  Object.fromEntries(
    header.map((column) => [
      column,
      column === 'popularity' && record[column] != null
        ? Number(record[column])
        : record[column],
    ]),
  );

// ---------------------------------------------------------------------------
// Repopulate
// ---------------------------------------------------------------------------

function main() {
  // Everything that can fail without touching the database happens first.
  const filePath = resolveBackupFile();
  log('BACKUP FILE', filePath);

  const db = getDb();
  log('DB CONNECTED', DB_PATH);

  try {
    assertTableExists(db);
    const rules = schemaRules(db);

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
    const snapshot = createBackup(db);
    log('PRE-RESTORE BACKUP', snapshot.csvPath);

    const insert = db.prepare(`
      INSERT INTO ${TABLE} (${header.join(', ')})
      VALUES (${header.map((column) => `@${column}`).join(', ')})
    `);

    // BEGIN IMMEDIATE takes the write lock up front rather than risking a failed
    // upgrade partway through against a running dev server.
    log('TRANSACTION STARTED');
    db.exec('BEGIN IMMEDIATE');

    try {
      // No WHERE clause: empties the table but leaves it, its indices, and the
      // updated_at trigger in place.
      const { changes: deleted } = db.prepare(`DELETE FROM ${TABLE}`).run();
      log('ROWS DELETED', `${deleted} rows removed (table kept)`);

      for (const record of records) insert.run(toBindable(record, header));
      log('ROWS INSERTED', `${records.length} rows`);

      const { count } = db
        .prepare(`SELECT COUNT(*) AS count FROM ${TABLE}`)
        .get();
      if (count !== records.length) {
        throw new Error(
          `post-load count mismatch: table has ${count} rows, file had ${records.length}`,
        );
      }

      db.exec('COMMIT');
      log('TRANSACTION COMMITTED', `${count} rows persisted`);
    } catch (err) {
      log('FAILED — ABORTING, ROLLING BACK', err.message);
      db.exec('ROLLBACK');
      log('ROLLED BACK', 'table restored to its pre-repopulate state');
      throw err;
    }
  } catch (err) {
    log('FAILED', err.message);
    throw err;
  } finally {
    db.close();
  }
}

try {
  main();
  log('DONE', 'repopulate complete');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
