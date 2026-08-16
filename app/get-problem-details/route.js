import { NextResponse } from 'next/server';
import { query } from '../../lib/db.js';

// Talks to remote Postgres via pg (a Node-only module), so this route must
// run on the Node.js runtime (not the Edge runtime).
export const runtime = 'nodejs';
// The result depends on request body, so never statically cache it.
export const dynamic = 'force-dynamic';

// POST /get-problem-details
// Body: { "link": "https://leetcode.com/problems/two-sum/" }
// Returns the full leetcode_problems row for that link as JSON.
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

  const link = body?.link;
  if (typeof link !== 'string' || link.trim() === '') {
    return NextResponse.json(
      { error: "Field 'link' (non-empty string) is required." },
      { status: 400 },
    );
  }

  try {
    const { rows } = await query(
      'SELECT * FROM leetcode_problems WHERE link = $1',
      [link.trim()],
    );
    const row = rows[0];

    if (!row) {
      return NextResponse.json(
        { error: 'No problem found for the given link.' },
        { status: 404 },
      );
    }

    return NextResponse.json(row, { status: 200 });
  } catch (err) {
    console.error('GET /get-problem-details failed:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
