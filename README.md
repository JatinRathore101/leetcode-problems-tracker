# LeetCode Problems Explorer

A Next.js (App Router) app to browse, search, filter, and sort LeetCode
problems scraped from LeetCode's GraphQL API.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

## Scripts

| Command          | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `npm run dev`    | Start the Next.js dev server.                                      |
| `npm run build`  | Production build.                                                  |
| `npm run start`  | Serve the production build.                                        |
| `npm run scrape` | Run `script/scrapper.js` to (re)generate `scrapped_leetcode_problems.json`. |
| `npm run topics` | Run `script/script.js` to print the unique list of topics.        |

## Project structure

```
app/                       Next.js App Router
  layout.js
  page.js                  Server component — reads scrapped_leetcode_problems.json
  ProblemsTable.js         Client component — search / filter / sort / paginate
  globals.css
script/
  scrapper.js              Scrapes LeetCode GraphQL → scrapped_leetcode_problems.json
  script.js                Prints the unique set of topics
scrapped_leetcode_problems.json     Scraped dataset (data source for the app)
```

## Re-scraping

```bash
npm run scrape
```

Optionally set `LEETCODE_SESSION` (a premium, logged-in cookie) to also
populate each problem's "Companies" data:

```bash
LEETCODE_SESSION=your_cookie npm run scrape
```
