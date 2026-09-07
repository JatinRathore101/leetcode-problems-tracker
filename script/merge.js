import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { closePool, getDbHost } from '../lib/db.js';
import {
  BACKUP_DIR,
  CSV_OPTIONS,
  assertTableExists,
  log,
  readBackup,
  tableColumns,
  timestamp,
} from './backup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PARSED_FILE = join(__dirname, 'parsed_leetcode_problems.json');

// ---------------------------------------------------------------------------
// Merge a fresh scrape with a backup of the user's work.
//
// The scrape is authoritative about what LeetCode looks like today (which
// problems exist, their topic/difficulty/popularity, and whether they are
// premium). The backup is authoritative about everything the user typed
// (solution, comment, status, concept_covered). This script joins the two on
// `link` and writes the result as a backup-format CSV — it never touches the
// database. Load it afterwards with:
//
//   npm run transaction -- --schema-only
//   npm run dump <the timestamp printed at the end>
// ---------------------------------------------------------------------------

// Mirrors the CHECK constraint in script/transaction.js.
const LOCKED = 'LOCKED';
const DEFAULT_STATUS = 'CLEAR';

// Statuses that represent real user work, i.e. the ones this merge must carry
// across untouched. LOCKED is deliberately excluded: it is a scraped fact, not
// something the user chose, so a stale LOCKED in the backup must not survive a
// problem becoming free again.
const isUserStatus = (status) =>
  status != null && status !== DEFAULT_STATUS && status !== LOCKED;

const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}_(0[1-9]|1[0-2])\.[0-5]\d\.[0-5]\d_(AM|PM)$/;

const USAGE =
  'usage: npm run merge <timestamp>   e.g. npm run merge 2026-09-07_09.51.28_PM';

// ---------------------------------------------------------------------------
// Argument + file resolution (same shape as repopulate.js, same error style)
// ---------------------------------------------------------------------------

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
// Guards
// ---------------------------------------------------------------------------

// A parsed file produced before the premium flag existed would silently mark
// every problem as free and wipe 782 LOCKED statuses, so refuse to run on one.
// Checked as a missing *key*, not a falsy value: `false` is a valid answer.
function loadFreshScrape() {
  const rerun = 'run `npm run scrape && npm run parse` first';

  if (!fs.existsSync(PARSED_FILE)) {
    throw new Error(`${PARSED_FILE} does not exist — ${rerun}`);
  }

  let problems;
  try {
    problems = JSON.parse(fs.readFileSync(PARSED_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`${PARSED_FILE} is not valid JSON — ${err.message}`);
  }

  if (!Array.isArray(problems) || problems.length === 0) {
    throw new Error(`${PARSED_FILE} is empty or not an array — ${rerun}`);
  }

  const stale = problems.filter((p) => !('isPaidOnly' in p));
  if (stale.length > 0) {
    throw new Error(
      `${PARSED_FILE} is stale: ${stale.length}/${problems.length} rows have no "isPaidOnly" key ` +
        `(e.g. ${stale
          .slice(0, 3)
          .map((p) => p.link)
          .join(', ')}) — ${rerun}`,
    );
  }

  const dupes = new Map();
  const seen = new Set();
  for (const p of problems) {
    if (seen.has(p.link)) dupes.set(p.link, (dupes.get(p.link) ?? 1) + 1);
    seen.add(p.link);
  }
  if (dupes.size > 0) {
    throw new Error(
      `${PARSED_FILE} has ${dupes.size} duplicate link(s), e.g. ${[...dupes.keys()].slice(0, 3).join(', ')}`,
    );
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

// The status rule, in one place:
//   - premium now                       -> LOCKED  (wins over anything)
//   - real user status in the backup     -> keep it
//   - anything else (incl. stale LOCKED) -> CLEAR
function mergeStatus(fresh, backup) {
  if (fresh.isPaidOnly) return LOCKED;
  if (isUserStatus(backup?.status)) return backup.status;
  return DEFAULT_STATUS;
}

// `null` and `''` are different values in this table (/update-problem writes
// solution = '' on CLEAR while the column default is NULL), and readBackup
// preserves the distinction, so pass the backup value straight through.
function mergeRow(fresh, backup, nowIso) {
  return {
    // From the scrape — this is what the refresh is for.
    link: fresh.link,
    name: fresh.name,
    topic: fresh.topic ?? 'MISCELLANEOUS',
    difficulty: fresh.difficulty,
    popularity: fresh.popularity ?? 0,

    // From the backup — the user's work, never derived from the scrape.
    comment: backup ? backup.comment : null,
    solution: backup ? backup.solution : null,
    concept_covered: backup ? backup.concept_covered === 'true' : false,
    created_at: backup?.created_at ?? nowIso,
    updated_at: backup?.updated_at ?? nowIso,

    status: mergeStatus(fresh, backup),
  };
}

// Everything that must hold before this file is allowed to reach the database.
// Any failure aborts before a byte is written.
function assertNoDataLoss(merged, backupRecords, expectedCount) {
  const errors = [];
  const byLink = new Map(merged.map((row) => [row.link, row]));

  if (merged.length !== expectedCount) {
    errors.push(
      `merged ${merged.length} rows but the scrape had ${expectedCount}`,
    );
  }

  for (const backup of backupRecords) {
    const row = byLink.get(backup.link);

    // An orphan — in the backup, gone from LeetCode. Dropping one silently
    // would lose real work, so only tolerate it when there is none.
    if (!row) {
      if (
        isUserStatus(backup.status) ||
        (backup.solution ?? '').trim() !== '' ||
        (backup.comment ?? '').trim() !== ''
      ) {
        errors.push(
          `ORPHAN WITH WORK: ${backup.link} (status ${backup.status}) is in the backup but not in the scrape — it would be dropped`,
        );
      }
      continue;
    }

    if (isUserStatus(backup.status) && row.status !== backup.status) {
      errors.push(
        `status changed for ${backup.link}: backup ${backup.status} -> merged ${row.status}`,
      );
    }
    if ((backup.solution ?? '') !== (row.solution ?? '')) {
      errors.push(`solution not carried across for ${backup.link}`);
    }
    if ((backup.comment ?? '') !== (row.comment ?? '')) {
      errors.push(`comment not carried across for ${backup.link}`);
    }
    if ((backup.concept_covered === 'true') !== row.concept_covered) {
      errors.push(`concept_covered not carried across for ${backup.link}`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Everything that can fail without reading the database happens first.
  const filePath = resolveBackupFile();
  const problems = loadFreshScrape();
  log('BACKUP FILE', filePath);
  log('SCRAPE FILE', `${PARSED_FILE} (${problems.length} rows)`);

  log('DB TARGET', getDbHost());
  // Read-only: the column order the dump has to be written in.
  await assertTableExists();
  const columns = await tableColumns();
  log('SCHEMA READ', `${columns.length} columns: ${columns.join(', ')}`);

  const { records, header } = readBackup(filePath);
  log('FILE PARSED', `${records.length} rows, columns: ${header.join(', ')}`);

  for (const required of ['link', 'status', 'solution', 'comment']) {
    if (!header.includes(required)) {
      throw new Error(
        `${filePath} has no "${required}" column — it cannot be the source of the user's work`,
      );
    }
  }

  const backupByLink = new Map(records.map((record) => [record.link, record]));
  const nowIso = new Date().toISOString();
  const merged = problems.map((fresh) =>
    mergeRow(fresh, backupByLink.get(fresh.link), nowIso),
  );

  // ---- summary, before anything is written -------------------------------
  const freshLinks = new Set(problems.map((p) => p.link));
  const locked = merged.filter((r) => r.status === LOCKED).length;
  const brandNew = merged.filter((r) => !backupByLink.has(r.link));
  const orphans = records.filter((r) => !freshLinks.has(r.link));
  const preserved = merged.filter((r) => isUserStatus(r.status)).length;
  const mergedStatus = new Map(merged.map((r) => [r.link, r.status]));
  const unlocked = records.filter(
    (r) => r.status === LOCKED && mergedStatus.get(r.link) !== LOCKED,
  ).length;

  log('MERGED', `${merged.length} rows`);
  log('LOCKED', `${locked} premium problems`);
  log('BRAND NEW', `${brandNew.length} not in the backup`);
  log('ORPHANS', `${orphans.length} in the backup but gone from LeetCode`);
  log('PRESERVED', `${preserved} rows keep a real user status`);
  if (unlocked > 0) {
    log('UNLOCKED', `${unlocked} rows were LOCKED and are now free -> CLEAR`);
  }

  const statusCounts = merged.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  log(
    'STATUS BREAKDOWN',
    Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => `${status}=${count}`)
      .join(' '),
  );

  // ---- assertions --------------------------------------------------------
  const errors = assertNoDataLoss(merged, records, problems.length);
  if (errors.length) {
    throw new Error(
      `merge would lose data (${errors.length} problem${errors.length === 1 ? '' : 's'}), nothing was written:\n  ${errors.slice(0, 20).join('\n  ')}${errors.length > 20 ? `\n  …and ${errors.length - 20} more` : ''}`,
    );
  }
  log('ASSERTIONS PASSED', 'every backup row is accounted for');

  // ---- write -------------------------------------------------------------
  // Same ORDER BY as createBackup(), so this file diffs cleanly against a
  // real dump.
  merged.sort(
    (a, b) => a.topic.localeCompare(b.topic) || a.name.localeCompare(b.name),
  );

  // Named backup-<stamp>.csv because that is the only shape repopulate.js
  // will load. It is a merged desired-state, NOT a dump of the live table.
  const stamp = timestamp();
  const csvPath = join(BACKUP_DIR, `backup-${stamp}.csv`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(csvPath, stringify(merged, { ...CSV_OPTIONS, columns }));
  log('CSV WRITTEN', `${merged.length} rows -> ${csvPath}`);

  log('DATABASE UNTOUCHED', 'this script only wrote a file');
  console.log(
    [
      '',
      'Next steps (review the CSV first):',
      '  npm run transaction -- --schema-only',
      `  npm run dump ${stamp}`,
      '',
    ].join('\n'),
  );
}

try {
  await main();
  log('DONE', 'merge complete');
} catch (err) {
  log('FAILED', err.message);
  process.exit(1);
} finally {
  await closePool();
}
