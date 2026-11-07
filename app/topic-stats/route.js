import { NextResponse } from 'next/server';
import { query } from '../../lib/db.js';
import {
  topicToSlug,
  UNTAGGED_SLUG,
  UNTAGGED_TOPIC,
} from '../../lib/constants.js';

// Talks to remote Postgres via pg (a Node-only module), so this route must
// run on the Node.js runtime (not the Edge runtime).
export const runtime = 'nodejs';
// Status is mutated by /update-problem, so always reflect live DB state.
export const dynamic = 'force-dynamic';

const percentOf = (solved, total) =>
  total ? ((solved / total) * 100).toFixed(2) : '0.00';

// GET /topic-stats
// Returns each topic's success rate keyed by URL slug, e.g.
//   { "array": { topic: "ARRAY", total: 40, solved: 12, percent: "30.00", covered: false }, ... }
// `topic` is the exact dsa_topics name — the value /set-topic-covered expects.
// One entry per row of dsa_topics, in script/topics.json order (problem
// frequency, LOCKED included, desc; ties alphabetical), then one final
// "untagged" entry for problems with no tags (it has no dsa_topics row, so
// covered is always false and cannot be toggled). A problem counts toward
// every topic in its pipe-joined `topic` string. "solved" counts rows with
// status 'SUCCESS' across all difficulties; "percent" is the share as a string
// fixed to two decimal places ("0.00" when total is 0). "covered" is the
// topic's dsa_topics.concept_covered flag.
export async function GET() {
  try {
    // ::int casts matter: pg returns COUNT/SUM (int8) as strings otherwise,
    // and the percent math below needs real numbers.
    // LOCKED rows are LeetCode Premium problems, which can never be attempted,
    // so counting them in `total` would permanently cap every topic's percent
    // below 100. `total` is therefore the attemptable count, and the sidebar's
    // "X of Y solved" reads against that. `frequency` (LOCKED included) is
    // only used for ordering — it is the count the parser ranks topics.json by.
    // LEFT JOIN keeps a topic with no problems (total 0) in the result.
    const [{ rows }, { rows: [untagged] }] = await Promise.all([
      query(
        `SELECT t.topic,
                COUNT(p.link)::int                                      AS frequency,
                COUNT(p.link) FILTER (WHERE p.status <> 'LOCKED')::int  AS total,
                COUNT(p.link) FILTER (WHERE p.status = 'SUCCESS')::int  AS solved,
                t.concept_covered                                       AS covered
           FROM dsa_topics t
           LEFT JOIN leetcode_problems p
             -- Substring match on the pipe-joined topic, wrapped in '|' on both
             -- sides so "TREE" does not also match "BINARY TREE". strpos (not
             -- LIKE) so a topic is matched literally, never as a pattern.
             ON strpos('|' || p.topic || '|', '|' || t.topic || '|') > 0
          GROUP BY t.topic, t.concept_covered`,
      ),
      query(
        `SELECT COUNT(*) FILTER (WHERE status <> 'LOCKED')::int AS total,
                COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS solved
           FROM leetcode_problems
          WHERE topic = ''`,
      ),
    ]);

    // Sorted in JS with the parser's exact comparator (script/parser.js) so
    // ties break identically to topics.json — Postgres collation may differ
    // from localeCompare.
    rows.sort(
      (a, b) => b.frequency - a.frequency || a.topic.localeCompare(b.topic),
    );

    // JSON object keys keep insertion order (slugs are never integer-like),
    // so the sort above carries through to the response.
    const stats = {};
    for (const { topic, total, solved, covered } of rows) {
      stats[topicToSlug(topic)] = {
        topic,
        total,
        solved,
        percent: percentOf(solved, total),
        covered,
      };
    }
    stats[UNTAGGED_SLUG] = {
      topic: UNTAGGED_TOPIC,
      total: untagged.total,
      solved: untagged.solved,
      percent: percentOf(untagged.solved, untagged.total),
      covered: false,
    };

    return NextResponse.json(stats, { status: 200 });
  } catch (err) {
    console.error('GET /topic-stats failed:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
