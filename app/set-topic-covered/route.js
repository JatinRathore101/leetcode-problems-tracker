import { NextResponse } from 'next/server';
import { query } from '../../lib/db.js';

// Talks to remote Postgres via pg (a Node-only module), so this route must
// run on the Node.js runtime (not the Edge runtime).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /set-topic-covered
// Body: { topic: "MATRIX", covered: true }
// Sets the concept-covered flag of one individual topic in dsa_topics (one row
// per LeetCode tag, seeded from script/topics.json by `npm run transaction`).
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
    const { rows } = await query(
      `UPDATE dsa_topics
          SET concept_covered = $1
        WHERE topic = $2
        RETURNING topic, concept_covered`,
      // dsa_topics stores topics trimmed + uppercased (script/parser.js).
      [covered, topic.trim().toUpperCase()],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No such topic.' }, { status: 404 });
    }

    return NextResponse.json(
      { topic: rows[0].topic, covered: rows[0].concept_covered },
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
