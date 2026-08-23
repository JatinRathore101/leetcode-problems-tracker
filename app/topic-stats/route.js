import { NextResponse } from 'next/server';
import { query } from '../../lib/db.js';
import { topicToSlug } from '../../lib/constants.js';

// Talks to remote Postgres via pg (a Node-only module), so this route must
// run on the Node.js runtime (not the Edge runtime).
export const runtime = 'nodejs';
// Status is mutated by /update-problem, so always reflect live DB state.
export const dynamic = 'force-dynamic';

// GET /topic-stats
// Returns each topic's success rate keyed by URL slug, e.g.
//   { "array": { total: 40, solved: 12, percent: "30.00", covered: false }, ... }
// "solved" counts rows with status 'SUCCESS' across all difficulties; "percent"
// is the share as a string fixed to two decimal places ("0.00" when total is 0).
// "covered" is true when ANY row of the topic has concept_covered set.
export async function GET() {
  try {
    // ::int casts matter: pg returns COUNT/SUM (int8) as strings otherwise,
    // and the percent math below needs real numbers.
    const { rows } = await query(
      `SELECT topic,
              COUNT(*)::int                                   AS total,
              SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END)::int AS solved,
              BOOL_OR(concept_covered)                        AS covered
         FROM leetcode_problems
        GROUP BY topic`,
    );

    const stats = {};
    for (const { topic, total, solved, covered } of rows) {
      const percent = total ? ((solved / total) * 100).toFixed(2) : '0.00';
      stats[topicToSlug(topic)] = { total, solved, percent, covered };
    }

    return NextResponse.json(stats, { status: 200 });
  } catch (err) {
    console.error('GET /topic-stats failed:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
