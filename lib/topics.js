import { query } from './db.js';
import { topicToSlug } from './constants.js';

// Resolve a URL slug ("hash-table") to its canonical topic ("HASH TABLE") using
// dsa_topics, the source of truth for which topics exist. Returns undefined for
// an unknown slug. The table is ~200 rows, so matching in-process is cheaper
// than keeping a slug column in sync.
export async function resolveTopicSlug(slug) {
  const { rows } = await query('SELECT topic FROM dsa_topics');
  return rows.find(({ topic }) => topicToSlug(topic) === slug)?.topic;
}
