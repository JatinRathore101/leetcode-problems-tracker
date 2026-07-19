import { NextResponse } from "next/server";
import { getDb } from "../../lib/db.js";

// better-sqlite3 is synchronous/native, so this route must run on the Node.js
// runtime (not the Edge runtime).
export const runtime = "nodejs";
// The result depends on request body, so never statically cache it.
export const dynamic = "force-dynamic";

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];

// Results are always ordered most-popular first. A secondary sort on link keeps
// results stable when popularity ties.
const ORDER_BY = "popularity DESC, link ASC";

// POST /get-problems-list
// Body: {
//   "topics": ["HASH TABLE", ...],          non-empty array of strings
//   "difficulty": ["EASY", "MEDIUM"]        non-empty array of the difficulty enum
// }
// Returns an array of { name, link, topic, difficulty, status } objects,
// ordered by popularity (most popular first).
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  // --- topics: non-empty array of non-empty strings ---
  const { topics, difficulty } = body ?? {};
  if (
    !Array.isArray(topics) ||
    topics.length === 0 ||
    !topics.every((t) => typeof t === "string" && t.trim() !== "")
  ) {
    return NextResponse.json(
      { error: "Field 'topics' must be a non-empty array of strings." },
      { status: 400 },
    );
  }

  // --- difficulty: non-empty array restricted to the difficulty enum ---
  if (
    !Array.isArray(difficulty) ||
    difficulty.length === 0 ||
    !difficulty.every((d) => DIFFICULTIES.includes(d))
  ) {
    return NextResponse.json(
      {
        error: `Field 'difficulty' must be a non-empty array of ${DIFFICULTIES.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  try {
    const db = getDb();

    // Build placeholders for the two IN clauses so every value stays bound.
    const cleanTopics = topics.map((t) => t.trim());
    const topicPlaceholders = cleanTopics.map(() => "?").join(", ");
    const difficultyPlaceholders = difficulty.map(() => "?").join(", ");

    const rows = db
      .prepare(
        `SELECT name, link, topic, difficulty, status
           FROM leetcode_problems
          WHERE topic IN (${topicPlaceholders})
            AND difficulty IN (${difficultyPlaceholders})
          ORDER BY ${ORDER_BY}`,
      )
      .all(...cleanTopics, ...difficulty);

    return NextResponse.json(rows, { status: 200 });
  } catch (err) {
    console.error("POST /get-problems-list failed:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
