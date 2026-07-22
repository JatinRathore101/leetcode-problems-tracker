// Canonical ordered list of the 33 topic accordions rendered on the home page.
export const TOPICS = [
  'ARRAY',
  'HASH TABLE',
  'STRING',
  'MATRIX',
  'TWO POINTERS',
  'BIT MANIPULATION',
  'SLIDING WINDOW',
  'BINARY SEARCH',
  'SORTING',
  'TREE',
  'BINARY TREE',
  'BINARY SEARCH TREE',
  'GRAPH THEORY',
  'STACK',
  'QUEUE',
  'HEAP (PRIORITY QUEUE)',
  'TRIE',
  'RECURSION',
  'GREEDY',
  'DIVIDE AND CONQUER',
  'DYNAMIC PROGRAMMING',
  'BACKTRACKING',
  'LINKED LIST',
  'DOUBLY-LINKED LIST',
  'MISCELLANEOUS',
  'MATH',
  'BINARY INDEXED TREE',
  'SIMULATION',
  'ENUMERATION',
  'RANDOMIZED',
  'CONCURRENCY',
  'DATABASE',
  'SHELL',
];

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

// slug -> canonical topic, e.g. "hash-table" -> "HASH TABLE".
export const SLUG_TO_TOPIC = Object.fromEntries(
  TOPICS.map((topic) => [topicToSlug(topic), topic]),
);

// Resolve a URL slug back to its canonical topic name (or undefined if unknown).
export function slugToTopic(slug) {
  return SLUG_TO_TOPIC[slug];
}
