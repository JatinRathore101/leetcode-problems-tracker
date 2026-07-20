# LeetCode Problems Explorer

A Next.js (App Router) app to browse LeetCode problems by topic and difficulty,
and to track your progress (status, comment, solution) per problem. Problems are
scraped from LeetCode's GraphQL API and persisted in a local SQLite database.

## Setup and run

Run these steps in order from the project root:

```bash
# 1. Install dependencies
npm install

# 2. Scrape problems from LeetCode's GraphQL API
#    -> writes script/scrapped_leetcode_problems.json
node script/scrapper.js

# 3. Parse the scraped data into the app's shape
#    -> writes script/parsed_leetcode_problems.json and script/topics.json
node script/parser.js

# 4. Build and seed the SQLite database from the parsed data
#    -> creates data/leetcode.db
node script/transaction.js

# 5. Start the dev server -> http://localhost:3000
npm run dev
```

Steps 2–4 are the one-time (or re-scrape) data pipeline: **scrape → parse →
load into the DB**. Once `data/leetcode.db` exists, you only need step 5 to run
the app again.

> Optional: set `LEETCODE_SESSION` (a premium, logged-in cookie) before step 2
> to also fetch each problem's company data:
>
> ```bash
> LEETCODE_SESSION=your_cookie node script/scrapper.js
> ```

## Scripts

Each pipeline step also has an npm alias:

| Command                | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `npm run dev`          | Start the Next.js dev server.                                               |
| `npm run build`        | Production build.                                                           |
| `npm run start`        | Serve the production build.                                                 |
| `npm run scrape`       | `node script/scrapper.js` — (re)generate `scrapped_leetcode_problems.json`. |
| `npm run parse`        | `node script/parser.js` — build `parsed_leetcode_problems.json` + topics.   |
| `npm run db:setup`     | `node script/transaction.js` — rebuild and seed `data/leetcode.db`.         |
| `npm run lint`         | Run the Next.js linter.                                                     |
| `npm run format`       | Format the whole repo with Prettier.                                        |
| `npm run format:check` | Check formatting without writing changes.                                   |

## Project structure

```
app/                               Next.js App Router
  layout.js                        Root layout + persistent Sidebar
  page.js                          Redirects "/" to the default topic's EASY page
  Sidebar.js                       Topic navigation rail
  [topic]/[difficulty]/            Dynamic route: one page per topic + difficulty
    page.js                        Server component — reads live rows from SQLite
    ProblemsList.js                Problems table
    ProblemActions.js              Copy / view / update actions + modals
    Chip.js                        Status / difficulty badge
    DifficultyTabs.js              EASY / MEDIUM / HARD tabs
  get-problem-details/route.js     POST — full problem row by link
  update-problem/route.js          POST — update comment / status / solution
  globals.css
lib/
  db.js                            Singleton better-sqlite3 connection (WAL mode)
  constants.js                     Topic list, slug helpers, difficulty defaults
script/
  scrapper.js                      Scrapes LeetCode GraphQL -> scrapped_*.json
  parser.js                        Maps topics + shapes data -> parsed_*.json
  transaction.js                   Rebuilds and seeds the SQLite table
  file.utils.js / topics.utils.js  Shared helpers (JSON writer, topic mapping)
data/
  leetcode.db                      SQLite database (created by step 4)
```
