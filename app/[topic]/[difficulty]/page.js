import { notFound } from 'next/navigation';
import { query } from '../../../lib/db.js';
import { DIFFICULTIES } from '../../../lib/constants.js';
import { resolveTopicSlug } from '../../../lib/topics.js';
import DifficultyTabs from './DifficultyTabs.js';
import ProblemsList from './ProblemsList.js';

// pg is a Node-only module -> Node.js runtime, not Edge.
export const runtime = 'nodejs';
// Problem status is mutated by /update-problem, so render on demand to always
// reflect live DB state rather than freezing rows at build time. [topic] must be
// the slug of a dsa_topics row and [difficulty] one of DIFFICULTIES; anything
// else falls through to notFound().
export const dynamic = 'force-dynamic';

// Fetch problems for one topic + difficulty: everything attemptable first, most
// popular first within that, and the LOCKED (LeetCode Premium) rows pushed to
// the bottom. Returns { problems } on success or { error } if the DB isn't
// reachable yet.
async function loadProblems(topic, difficulty) {
  try {
    const { rows } = await query(
      // `status = 'LOCKED'` sorts as a boolean, and Postgres orders false
      // before true, so the non-LOCKED rows come first. Every other status
      // shares one rank — only LOCKED is singled out. status is NOT NULL, so
      // there is no NULL case to place.
      // topic is pipe-joined ("ARRAY|HASH TABLE"): substring-match it with
      // '|' on both sides so "TREE" does not also match "BINARY TREE"; strpos
      // (not LIKE) matches the topic literally, never as a pattern.
      `SELECT name, link, topic, difficulty, status
         FROM leetcode_problems
        WHERE strpos('|' || topic || '|', '|' || $1 || '|') > 0
          AND difficulty = $2
        ORDER BY (status = 'LOCKED'), popularity DESC, link ASC`,
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
  const difficulty = difficultySlug.toUpperCase();
  if (!DIFFICULTIES.includes(difficulty)) {
    notFound();
  }

  // The topic slug is validated against dsa_topics. If the DB is unreachable
  // the slug cannot be checked, so show the page's DB-error state (with the
  // raw slug as its label) instead of a misleading 404.
  let topic;
  let lookupFailed = false;
  try {
    topic = await resolveTopicSlug(topicSlug);
  } catch (err) {
    console.error('Failed to resolve topic slug:', err);
    lookupFailed = true;
  }
  if (!lookupFailed && !topic) {
    notFound();
  }

  const { problems, error } = lookupFailed
    ? { error: true }
    : await loadProblems(topic, difficulty);
  topic ??= topicSlug;

  // Share of problems on this page that have been solved (status "SUCCESS").
  // LOCKED rows (LeetCode Premium) are excluded from the denominator — they
  // can't be attempted, so counting them would cap the percent below 100
  // forever. Matches the `total` that /topic-stats reports.
  const total = problems?.filter((p) => p.status !== 'LOCKED').length ?? 0;
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
