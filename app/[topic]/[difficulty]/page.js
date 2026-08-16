import { notFound } from 'next/navigation';
import { query } from '../../../lib/db.js';
import { DIFFICULTIES, slugToTopic } from '../../../lib/constants.js';
import DifficultyTabs from './DifficultyTabs.js';
import ProblemsList from './ProblemsList.js';

// pg is a Node-only module -> Node.js runtime, not Edge.
export const runtime = 'nodejs';
// Problem status is mutated by /update-problem, so render on demand to always
// reflect live DB state rather than freezing rows at build time. The [topic] and
// [difficulty] segments cover all 33 * 3 = 99 routes; loadProblems() validates
// them and anything outside that set falls through to notFound().
export const dynamic = 'force-dynamic';

// Fetch problems for one topic + difficulty, ordered most popular first.
// Returns { problems } on success or { error } if the DB isn't reachable yet.
async function loadProblems(topic, difficulty) {
  try {
    const { rows } = await query(
      `SELECT name, link, topic, difficulty, status
         FROM leetcode_problems
        WHERE topic = $1 AND difficulty = $2
        ORDER BY popularity DESC, link ASC`,
      [topic, difficulty],
    );
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

  const { problems, error } = await loadProblems(topic, difficulty);

  // Share of problems on this page that have been solved (status "SUCCESS").
  const total = problems?.length ?? 0;
  const solved = problems?.filter((p) => p.status === 'SUCCESS').length ?? 0;
  const successPercent = total ? ((solved / total) * 100).toFixed(2) : '0.00';

  return (
    <div className="topic-page">
      <header className="topic-page__header">
        <div className="topic-page__header-row">
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

          {!error && total > 0 && (
            <div
              className="success-stat"
              title={`${solved} of ${total} problems solved`}
            >
              <span className="success-stat__label">{`${solved} of ${total} solved`}</span>
              <span className="success-stat_divider"></span>
              <span className="success-stat__value">{successPercent}%</span>
            </div>
          )}
        </div>

        <DifficultyTabs topicSlug={topicSlug} activeDifficulty={difficulty} />
      </header>

      <div className="topic-page__body">
        <ProblemsList problems={problems} error={error} />
      </div>
    </div>
  );
}
