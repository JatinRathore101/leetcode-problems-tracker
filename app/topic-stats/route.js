import { NextResponse } from 'next/server';
import { getDb } from '../../lib/db.js';
import { topicToSlug } from '../../lib/constants.js';

// better-sqlite3 is synchronous/native, so this route must run on the Node.js
// runtime (not the Edge runtime).
export const runtime = 'nodejs';
// Status is mutated by /update-problem, so always reflect live DB state.
export const dynamic = 'force-dynamic';

// GET /topic-stats
// Returns each topic's success rate keyed by URL slug, e.g.
//   { "array": { total: 40, solved: 12, percent: "30.00" }, ... }
// "solved" counts rows with status 'SUCCESS' across all difficulties; "percent"
// is the share as a string fixed to two decimal places ("0.00" when total is 0).
export async function GET() {
  try {
    const rows = getDb()
      .prepare(
        `SELECT topic,
                COUNT(*)                                   AS total,
                SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS solved
           FROM leetcode_problems
          GROUP BY topic`,
      )
      .all();

    const stats = {};
    for (const { topic, total, solved } of rows) {
      const percent = total ? ((solved / total) * 100).toFixed(2) : '0.00';
      stats[topicToSlug(topic)] = { total, solved, percent };
    }

    return NextResponse.json(stats, { status: 200 });
  } catch (err) {
    console.error('GET /topic-stats failed:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
