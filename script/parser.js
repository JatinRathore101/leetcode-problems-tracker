import data from './scrapped_leetcode_problems.json' with { type: 'json' };
import { writeJsonFile } from './file.utils.js';

// Raw LeetCode tag name -> canonical form, e.g. " Hash Table" -> "HASH TABLE".
const normalizeTopic = (topic) => topic?.trim()?.toUpperCase() ?? '';

// Every tag a problem carries, as one pipe-separated string,
// e.g. ["Array", "Hash Table"] -> "ARRAY|HASH TABLE". No tags -> ''.
const joinTopics = (topics) =>
  (topics ?? []).map(normalizeTopic).filter(Boolean).join('|');

const main = () => {
  const rows = data?.map(
    ({ name, link, topics, difficulty, totalSubmissions, isPaidOnly }) => ({
      name,
      link,
      topic: joinTopics(topics),
      difficulty: difficulty?.toUpperCase()?.trim(),
      popularity: totalSubmissions,
      // Passed straight through for script/merge.js, which turns it into the
      // LOCKED status. Coalescing to false here would hide a stale scrape, so
      // keep whatever the scraper wrote (merge.js rejects a file missing it).
      isPaidOnly,
    }),
  );

  // How many problems carry each tag (a tag repeated within one problem
  // counts once).
  const frequency = new Map();
  for (const { topics } of data ?? []) {
    for (const topic of new Set((topics ?? []).map(normalizeTopic))) {
      if (topic) frequency.set(topic, (frequency.get(topic) ?? 0) + 1);
    }
  }

  // Unique tags, most frequent first; ties broken alphabetically.
  const topics = [...frequency.keys()].sort(
    (a, b) => frequency.get(b) - frequency.get(a) || a.localeCompare(b),
  );

  writeJsonFile(rows, 'parsed_leetcode_problems.json');
  writeJsonFile(topics, 'topics.json');

  console.log(`Exported ${rows.length} problems and ${topics.length} topics.`);
};

try {
  main();
} catch (error) {
  console.error(error);
  // Non-zero exit so a chained `npm run scrape && npm run parse && ...` stops.
  process.exitCode = 1;
}
