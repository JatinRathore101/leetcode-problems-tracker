import { NextResponse } from 'next/server';
import { getDb } from '../../lib/db.js';
import { fuzzyRank } from '../../lib/fuzzy.js';

// better-sqlite3 is synchronous/native, so this route must run on the Node.js
// runtime (not the Edge runtime).
export const runtime = 'nodejs';
// The result depends on the request body, so never statically cache it.
export const dynamic = 'force-dynamic';

// Cap the number of rows sent back so a very loose query can't return the whole
// table. The client is told the true match count so it can flag truncation.
const MAX_RESULTS = 100;

// POST /search-problems
// Body: { "query": "two sum" }
// Fuzzy-matches the query against the `name` and `link` columns of
// leetcode_problems and returns the ranked rows needed to render the table.
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

  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (query === '') {
    return NextResponse.json(
      { error: "Field 'query' (non-empty string) is required." },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    // The table is small (a few thousand rows), so pull the searchable columns
    // and rank in-process — this lets the match be truly fuzzy (subsequence /
    // typo tolerant) rather than a plain SQL LIKE.
    const rows = db
      .prepare(`SELECT name, link, status, popularity FROM leetcode_problems`)
      .all();

    const ranked = fuzzyRank(rows, query);
    const total = ranked.length;
    const problems = ranked.slice(0, MAX_RESULTS);

    return NextResponse.json({ problems, total }, { status: 200 });
  } catch (err) {
    console.error('POST /search-problems failed:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
