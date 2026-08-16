# LeetCode Problems Explorer

A Next.js (App Router) app to browse LeetCode problems by topic and difficulty,
and to track your progress (status, comment, solution) per problem. Problems are
scraped from LeetCode's GraphQL API and persisted in a local SQLite database.

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

| Variable           | Required | Used by          | Purpose                                                                                       |
| ------------------ | -------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `LEETCODE_SESSION` | No       | `npm run scrape` | LeetCode session cookie. Without it the scrape still works, but `companies` comes back empty. |

`npm run dev` / `build` / `start` load `.env` automatically (Next.js), and
`npm run scrape` loads it via `node --env-file-if-exists=.env`.

If a credential is ever committed by accident, rotating it (for
`LEETCODE_SESSION`, logging out of LeetCode) is the fix — removing the file from
the working tree does not invalidate a leaked secret.
