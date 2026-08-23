import { NextResponse } from 'next/server';
import { query } from '../../lib/db.js';

// Talks to remote Postgres via pg (a Node-only module), so this route must
// run on the Node.js runtime (not the Edge runtime).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /set-topic-covered
// Body: { topic: "MATRIX", covered: true }
// Marks every row of the topic as concept-covered (or not). A topic counts as
// covered in /topic-stats when any of its rows is true, so flipping all rows
// keeps the flag stable as problems are added or re-scraped.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  const { topic, covered } = body ?? {};

  if (typeof topic !== 'string' || topic.trim() === '') {
    return NextResponse.json(
      { error: "Field 'topic' (non-empty string) is required." },
      { status: 400 },
    );
  }

  if (typeof covered !== 'boolean') {
    return NextResponse.json(
      { error: "Field 'covered' (boolean) is required." },
      { status: 400 },
    );
  }

  try {
    // updated_at is maintained by the BEFORE UPDATE trigger.
    const result = await query(
      `UPDATE leetcode_problems
          SET concept_covered = $1
        WHERE topic = $2`,
      [covered, topic.trim()],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'No problems found for the given topic.' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { topic: topic.trim(), covered, updated: result.rowCount },
      { status: 200 },
    );
  } catch (err) {
    console.error('POST /set-topic-covered failed:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
