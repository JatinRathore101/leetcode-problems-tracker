import fs from "fs";
import path from "path";
import ProblemsTable from "./ProblemsTable";

// Read the scraped dataset at request/build time on the server so the large
// JSON file is never shipped whole to the client as a JS bundle.
function getProblems() {
  const file = path.join(process.cwd(), "script", "scrapped_leetcode_problems.json");
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Could not read scrapped_leetcode_problems.json:", err.message);
    return [];
  }
}

export default function Home() {
  const problems = getProblems();

  return (
    <main>
      <header className="hero">
        <h1>LeetCode Problems Explorer</h1>
        <p>
          {problems.length.toLocaleString()} problems scraped from LeetCode —
          search, filter by difficulty or topic, and sort by popularity.
        </p>
      </header>
      <ProblemsTable problems={problems} />
    </main>
  );
}
