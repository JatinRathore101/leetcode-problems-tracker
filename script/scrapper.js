import axios from 'axios';
import { writeJsonFile } from './file.utils.js';

const GRAPHQL_URL = 'https://leetcode.com/graphql';

// Optional: set LEETCODE_SESSION (a premium, logged-in cookie) to also populate
// the "Companies" column. Without it, companyTagStats comes back null.
const COOKIE = process.env.LEETCODE_SESSION
  ? `LEETCODE_SESSION=${process.env.LEETCODE_SESSION}`
  : undefined;

const listQuery = `
query problemsetQuestionListV2($filters: QuestionFilterInput, $limit: Int, $skip: Int, $categorySlug: String) {
  problemsetQuestionListV2(
    filters: $filters
    limit: $limit
    skip: $skip
    categorySlug: $categorySlug
  ) {
    totalLength
    hasMore
    questions {
      title
      titleSlug
      difficulty
      topicTags {
        name
      }
    }
  }
}
`;

const detailQuery = `
query questionDetail($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    likes
    dislikes
    discussionCount
    stats
    companyTagStats
  }
}
`;

// V2 requires a structured filters object; filterCombineType is mandatory.
const filters = {
  filterCombineType: 'ALL',
  statusFilter: { questionStatuses: [], operator: 'IS' },
  difficultyFilter: { difficulties: [], operator: 'IS' },
  languageFilter: { languageSlugs: [], operator: 'IS' },
  topicFilter: { topicSlugs: [], operator: 'IS' },
  acceptanceFilter: {},
  frequencyFilter: {},
  frontendIdFilter: {},
  lastSubmittedFilter: {},
  publishedFilter: {},
  companyFilter: { companySlugs: [], operator: 'IS' },
  positionFilter: { positionSlugs: [], operator: 'IS' },
  premiumFilter: { premiumStatus: [], operator: 'IS' },
};

function baseHeaders(referer) {
  const headers = {
    'Content-Type': 'application/json',
    Referer: referer,
  };
  if (COOKIE) headers.Cookie = COOKIE;
  return headers;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POST with retry + exponential backoff (handles transient 429/5xx/network errors).
async function gqlPost(body, referer, attempt = 0) {
  try {
    const res = await axios.post(GRAPHQL_URL, body, {
      headers: baseHeaders(referer),
      timeout: 20000,
    });
    if (res.data.errors) throw new Error(JSON.stringify(res.data.errors));
    return res.data.data;
  } catch (err) {
    if (attempt >= 5) throw err;
    const wait = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s, 16s
    await sleep(wait);
    return gqlPost(body, referer, attempt + 1);
  }
}

async function fetchProblems() {
  let allProblems = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    console.log(`Fetching list ${skip}...`);

    const data = await gqlPost(
      {
        query: listQuery,
        variables: {
          categorySlug: 'all-code-essentials',
          skip,
          limit,
          filters,
        },
      },
      'https://leetcode.com/problemset/',
    );

    const page = data.problemsetQuestionListV2;
    allProblems.push(...page.questions);
    skip += limit;
    if (!page.hasMore) break;
  }

  return allProblems;
}

async function fetchDetail(titleSlug) {
  const data = await gqlPost(
    { query: detailQuery, variables: { titleSlug } },
    `https://leetcode.com/problems/${titleSlug}/`,
  );
  const q = data.question || {};

  let stats = {};
  try {
    stats = JSON.parse(q.stats || '{}');
  } catch (_) {}

  // companyTagStats is a JSON string keyed by frequency bucket ("1","2","3");
  // each value is an array of { taggedByAdmin, name, slug, timesEncountered }.
  let companies = [];
  if (q.companyTagStats) {
    try {
      const parsed = JSON.parse(q.companyTagStats);
      const names = Object.values(parsed)
        .flat()
        .map((c) => c.name);
      companies = [...new Set(names)];
    } catch (_) {}
  }

  return {
    likes: q.likes ?? null,
    dislikes: q.dislikes ?? null,
    likeRatio:
      q.likes != null && q.likes + q.dislikes > 0
        ? Number((q.likes / (q.likes + q.dislikes)).toFixed(4))
        : null,
    totalAccepted: stats.totalAcceptedRaw ?? null,
    totalSubmissions: stats.totalSubmissionRaw ?? null,
    acceptanceRate: stats.acRate ?? null,
    discussionCount: q.discussionCount ?? null,
    companies,
  };
}

// Run tasks with a bounded concurrency pool, reporting progress.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  let done = 0;

  async function runner() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
      done++;
      if (done % 100 === 0 || done === items.length) {
        console.log(`Enriched ${done}/${items.length}...`);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, runner));
  return results;
}

async function main() {
  const problems = await fetchProblems();
  console.log(
    `Found ${problems.length} problems. Fetching popularity details...`,
  );

  const CONCURRENCY = 8;
  const details = await mapWithConcurrency(problems, CONCURRENCY, async (p) => {
    try {
      return await fetchDetail(p.titleSlug);
    } catch (err) {
      console.error(`Failed detail for ${p.titleSlug}: ${err.message}`);
      return {
        likes: null,
        dislikes: null,
        likeRatio: null,
        totalAccepted: null,
        totalSubmissions: null,
        acceptanceRate: null,
        discussionCount: null,
        companies: [],
      };
    }
  });

  const rows = problems.map((p, i) => ({
    name: p.title,
    link: `https://leetcode.com/problems/${p.titleSlug}/`,
    topics: p.topicTags.map((t) => t.name),
    difficulty: p.difficulty,
    ...details[i],
  }));

  writeJsonFile(rows, 'scrapped_leetcode_problems.json');

  console.log(`Exported ${rows.length} problems.`);
}

main().catch(console.error);
