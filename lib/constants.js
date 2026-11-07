// The three difficulty tabs rendered on every topic page.
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];

// The default difficulty a topic opens on (sidebar links + home redirect).
export const DEFAULT_DIFFICULTY = DIFFICULTIES[0];

// Turn a canonical topic name into a URL-safe slug.
//   "HASH TABLE"            -> "hash-table"
//   "HEAP (PRIORITY QUEUE)" -> "heap-priority-queue"
//   "DOUBLY-LINKED LIST"    -> "doubly-linked-list"
export function topicToSlug(topic) {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics -> single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

// Pseudo-topic for problems LeetCode gives no tags (topic = ''). It is not a
// dsa_topics row, so it has no concept-covered flag; /topic-stats appends it
// last and /untagged/:difficulty lists those problems.
export const UNTAGGED_TOPIC = 'UNTAGGED';
export const UNTAGGED_SLUG = topicToSlug(UNTAGGED_TOPIC);
