// Lightweight, dependency-free fuzzy matcher used by the home-page search.
//
// scoreFuzzy(query, text) returns a relevance score for how well `query`
// fuzzy-matches `text`, or -1 when there is no match at all. Higher is better.
//
// The scorer is tolerant in the fzf sense: the query need only appear as a
// (case-insensitive) subsequence of the text. Contiguous runs, matches at word
// boundaries, and exact substrings are all rewarded so the most "obvious" hits
// float to the top.

// Characters that begin a new "word" inside a problem name or link, e.g. the
// space in "Two Sum", the hyphen/slash in "two-sum" or ".../two-sum/".
function isBoundary(ch) {
  return ch === ' ' || ch === '-' || ch === '/' || ch === '_' || ch === '.';
}

export function scoreFuzzy(query, text) {
  if (!query) return 0;
  if (!text) return -1;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring is the strongest signal: rank earlier and more complete
  // (query covers more of the text) matches higher.
  const idx = t.indexOf(q);
  if (idx !== -1) {
    return 1000 - idx + (q.length / t.length) * 100;
  }

  // Otherwise require `q` to appear as a subsequence of `t`. Walk `t` once,
  // consuming query chars in order and accumulating bonuses.
  let ti = 0;
  let score = 0;
  let consecutive = 0;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === ch) {
        found = j;
        break;
      }
    }
    if (found === -1) return -1; // a query char is missing -> not a match

    if (found === ti) {
      // Immediately after the previous match: reward the growing run.
      consecutive += 1;
      score += 5 + consecutive;
    } else {
      consecutive = 0;
      score += 1;
    }
    // Bonus for landing at the start of a word (or the very start of the text).
    if (found === 0 || isBoundary(t[found - 1])) score += 3;

    ti = found + 1;
  }

  return score;
}

// Rank `rows` against `query` by the best fuzzy score across the given text
// `fields` (defaults to name + link). Non-matching rows are dropped. Ties break
// by popularity (desc) then link (asc) to mirror the topic pages' ordering.
export function fuzzyRank(rows, query, fields = ['name', 'link']) {
  const scored = [];
  for (const row of rows) {
    let best = -1;
    for (const field of fields) {
      const s = scoreFuzzy(query, row[field]);
      if (s > best) best = s;
    }
    if (best >= 0) scored.push({ row, score: best });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pa = a.row.popularity ?? 0;
    const pb = b.row.popularity ?? 0;
    if (pb !== pa) return pb - pa;
    return String(a.row.link).localeCompare(String(b.row.link));
  });

  return scored.map((s) => s.row);
}
