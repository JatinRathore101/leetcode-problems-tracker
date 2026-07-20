import data from './scrapped_leetcode_problems.json' with { type: 'json' };
import { TOPICS_MAPPING, TOPICS_RANKING } from './topics.utils.js';
import { writeJsonFile } from './file.utils.js';

const getTopic = (topics) => {
  const parsedTopics = topics
    ?.map((topic) => TOPICS_MAPPING?.[topic?.toUpperCase()?.trim() ?? ''] || '')
    ?.filter(Boolean);
  for (const topic of TOPICS_RANKING) {
    if (parsedTopics?.includes(topic)) {
      return topic;
    }
  }
  return 'MISCELLANEOUS';
};

const main = () => {
  const rows = data?.map(
    ({ name, link, topics, difficulty, totalSubmissions }) => ({
      name,
      link,
      topic: getTopic(topics),
      difficulty: difficulty?.toUpperCase()?.trim(),
      popularity: totalSubmissions,
    }),
  );

  const topics = [...new Set(rows?.map(({ topic }) => topic))];

  writeJsonFile(rows, 'parsed_leetcode_problems.json');
  writeJsonFile(topics, 'topics.json');

  console.log(`Exported ${rows.length} problems.`);
};

try {
  main();
} catch (error) {
  console.error(error);
}
