import { NextResponse } from 'next/server';
import { query } from '../../lib/db.js';

// Talks to remote Postgres via pg (a Node-only module), so this route must
// run on the Node.js runtime (not the Edge runtime).
export const runtime = 'nodejs';
// The result depends on request body, so never statically cache it.
export const dynamic = 'force-dynamic';

const STATUSES = ['CLEAR', 'ERROR', 'TLE', 'MLE', 'SUCCESS'];
// Statuses that require a non-empty solution to accompany them.
const SOLUTION_REQUIRED = ['ERROR', 'TLE', 'MLE', 'SUCCESS'];

// POST /update-problem
// Body: {
//   "link": "https://leetcode.com/problems/two-sum/",  required, identifies the row
//   "comment": "…",                                    optional; empty string clears it (-> NULL)
//   "status": "SUCCESS",                               optional, one of STATUSES
//   "solution": "…"                                    see rules below
// }
//
// solution rules (only relevant when 'status' is present):
//   - no status          -> solution is ignored, not updated
//   - status === CLEAR   -> solution is cleared (set to "")
//   - status in ERROR/TLE/MLE/SUCCESS -> solution must be a non-empty string
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

  const { link, comment, status, solution } = body ?? {};

  // --- link: required, non-empty string ---
  if (typeof link !== 'string' || link.trim() === '') {
    return NextResponse.json(
      { error: "Field 'link' (non-empty string) is required." },
      { status: 400 },
    );
  }

  // Columns to update, built up as fields are validated.
  const updates = {};

  // --- comment: optional; an empty/whitespace value clears it (-> NULL) ---
  if (comment !== undefined) {
    if (typeof comment !== 'string') {
      return NextResponse.json(
        { error: "Field 'comment', if provided, must be a string." },
        { status: 400 },
      );
    }
    const trimmed = comment.trim();
    updates.comment = trimmed === '' ? null : trimmed;
  }

  // --- status (+ solution): optional ---
  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Field 'status' must be one of ${STATUSES.join(', ')}.` },
        { status: 400 },
      );
    }
    updates.status = status;

    if (status === 'CLEAR') {
      // CLEAR wipes any existing solution.
      updates.solution = '';
    } else {
      // ERROR / TLE / MLE / SUCCESS require a non-empty solution.
      if (typeof solution !== 'string' || solution.trim() === '') {
        return NextResponse.json(
          {
            error: `Field 'solution' (non-empty string) is required when status is one of ${SOLUTION_REQUIRED.join(', ')}.`,
          },
          { status: 400 },
        );
      }
      updates.solution = solution;
    }
  }

  // Nothing to change beyond the row identifier.
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Provide at least one of 'comment' or 'status' to update." },
      { status: 400 },
    );
  }

  try {
    // Bind every value; always bump updated_at to now. RETURNING * hands back
    // the freshly updated row in the same round trip.
    const columns = Object.keys(updates);
    const setClause = [
      ...columns.map((c, i) => `${c} = $${i + 1}`),
      'updated_at = CURRENT_TIMESTAMP',
    ].join(', ');

    const result = await query(
      `UPDATE leetcode_problems
          SET ${setClause}
        WHERE link = $${columns.length + 1}
        RETURNING *`,
      [...columns.map((c) => updates[c]), link.trim()],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'No problem found for the given link.' },
        { status: 404 },
      );
    }

    return NextResponse.json(result.rows[0], { status: 200 });
  } catch (err) {
    console.error('POST /update-problem failed:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
