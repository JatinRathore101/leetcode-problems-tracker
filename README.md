# LeetCode Problems Explorer

A Next.js (App Router) app to browse LeetCode problems by topic and difficulty,
and to track your progress (status, comment, solution) per problem. Problems are
scraped from LeetCode's GraphQL API and persisted in a Supabase Postgres
database.

Each topic in the sidebar also carries a concept-covered marker (the dot next to
the success percentage): grey outline = not covered, blue with a tick = covered.
Clicking it opens a confirmation and then flips that topic's `concept_covered`
flag in the `dsa_topics` table via `POST /set-topic-covered`
(`{ topic, covered }`).

## Setup and run

```bash
cp .env.example .env   # then fill in any values you need
npm run dev
```

## Environment variables

All credentials live in `.env`, which is gitignored — never hardcode one in a
source file. `.env.example` is the committed, secret-free template; add any new
variable there (with an empty value and a comment) at the same time you add it
to `.env`.

| Variable           | Required | Used by              | Purpose                                                                                       |
| ------------------ | -------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | Yes      | app + all DB scripts | Supabase Postgres connection string (see `.env.example` for format and pooler fallback).      |
| `LEETCODE_SESSION` | No       | `npm run scrape`     | LeetCode session cookie. Without it the scrape still works, but `companies` comes back empty. |

`npm run dev` / `build` / `start` load `.env` automatically (Next.js), and
`npm run scrape` / `transaction` / `merge` / `backup` / `dump` load it via
`node --env-file-if-exists=.env`.

### Data refresh pipeline

```bash
npm run scrape                          # LeetCode -> script/scrapped_leetcode_problems.json (raw)
npm run parse                           # -> script/parsed_leetcode_problems.json + script/topics.json
npm run backup                          # snapshot problems (backup/backup-<ts>.csv/.json) + dsa_topics (backup/dsa-topics-<ts>.json)
npm run merge <ts>                      # fresh scrape + user work from that backup -> backup/backup-<ts2>.csv
npm run transaction -- --schema-only    # drop + recreate the empty problems table; add new tags to dsa_topics
npm run dump <ts2>                      # load the merged CSV
```

- `topic` holds every LeetCode tag of a problem, trimmed, uppercased and
  pipe-joined (`"ARRAY|HASH TABLE"`); `''` when LeetCode has no tags. The
  column is `TEXT` (longest value today is 223 chars).
- `script/topics.json` lists every distinct tag, most frequent first.
- `dsa_topics` (`topic` PK, `concept_covered`) has one row per individual tag.
  `transaction` never drops it: it only inserts tags missing from it, so the
  flags survive every rebuild.
- Premium problems (`isPaidOnly`) load as `status = 'LOCKED'`; `merge` keeps
  the user's `SUCCESS`/`ERROR`/`TLE`/`MLE`, `solution` and `comment` from the
  backup.

The table-rebuild script accepts a schema-only mode —
`npm run transaction -- --schema-only` — which recreates an empty
`leetcode_problems` table (DDL, indices, trigger) without inserting the parsed
scrape data, for when the table will be reloaded from a backup instead.

If a credential is ever committed by accident, rotating it is the fix — removing
the file from the working tree does not invalidate a leaked secret. For
`LEETCODE_SESSION`, log out of LeetCode; for the `DATABASE_URL` password, reset
it in the Supabase dashboard (Settings → Database).
