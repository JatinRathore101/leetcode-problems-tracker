import { query } from './db.js';
import { topicToSlug, UNTAGGED_SLUG, UNTAGGED_TOPIC } from './constants.js';

// Resolve a URL slug ("hash-table") to its canonical topic ("HASH TABLE") using
// dsa_topics, the source of truth for which topics exist. "untagged" resolves
// to the UNTAGGED pseudo-topic (problems with topic = ''). Returns undefined
// for an unknown slug. The table is ~200 rows, so matching in-process is
// cheaper than keeping a slug column in sync.
export async function resolveTopicSlug(slug) {
  if (slug === UNTAGGED_SLUG) return UNTAGGED_TOPIC;
  const { rows } = await query('SELECT topic FROM dsa_topics');
  return rows.find(({ topic }) => topicToSlug(topic) === slug)?.topic;
}
