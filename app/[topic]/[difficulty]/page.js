import { notFound } from 'next/navigation';
import { getDb } from '../../../lib/db.js';
import { DIFFICULTIES, slugToTopic } from '../../../lib/constants.js';
import DifficultyTabs from './DifficultyTabs.js';
import ProblemsList from './ProblemsList.js';

// better-sqlite3 is a native/synchronous module -> Node.js runtime only.
export const runtime = 'nodejs';
// Problem status is mutated by /update-problem, so render on demand to always
// reflect live DB state rather than freezing rows at build time. The [topic] and
// [difficulty] segments cover all 33 * 3 = 99 routes; loadProblems() validates
// them and anything outside that set falls through to notFound().
export const dynamic = 'force-dynamic';

// Fetch problems for one topic + difficulty, ordered most popular first.
// Returns { problems } on success or { error } if the DB isn't reachable yet.
function loadProblems(topic, difficulty) {
  try {
    const rows = getDb()
      .prepare(
        `SELECT name, link, topic, difficulty, status
           FROM leetcode_problems
          WHERE topic = ? AND difficulty = ?
          ORDER BY popularity DESC, link ASC`,
      )
      .all(topic, difficulty);
    return { problems: rows };
  } catch (err) {
    console.error('Failed to load problems:', err);
    return { error: true };
  }
}

export default async function TopicDifficultyPage({ params }) {
  const { topic: topicSlug, difficulty: difficultySlug } = await params;

  // URLs carry a lowercase difficulty ("easy"); the DB/enum use uppercase.
  const topic = slugToTopic(topicSlug);
  const difficulty = difficultySlug.toUpperCase();
  // Validate both segments; anything outside the known 99 routes -> 404.
  if (!topic || !DIFFICULTIES.includes(difficulty)) {
    notFound();
  }

  const { problems, error } = loadProblems(topic, difficulty);

  return (
    <div className="topic-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span className="breadcrumb__dot" aria-hidden="true">
          &#9679;
        </span>
        <span className="breadcrumb__topic">{topic}</span>
        <span className="breadcrumb__chevron" aria-hidden="true">
          &#9654;
        </span>
        <span
          className={`breadcrumb__difficulty breadcrumb__difficulty--${difficulty.toLowerCase()}`}
        >
          {difficulty}
        </span>
      </nav>

      <DifficultyTabs topicSlug={topicSlug} activeDifficulty={difficulty} />

      <ProblemsList problems={problems} error={error} />
    </div>
  );
}
