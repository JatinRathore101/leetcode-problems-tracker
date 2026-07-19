"use client";

import { useMemo, useState } from "react";

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];
const PAGE_SIZE = 50;

const COLUMNS = [
  { key: "name", label: "Problem", numeric: false },
  { key: "difficulty", label: "Difficulty", numeric: false },
  { key: "likes", label: "Likes", numeric: true },
  { key: "likeRatio", label: "Like Ratio", numeric: true },
  { key: "acceptanceRate", label: "Acceptance", numeric: true },
  { key: "totalAccepted", label: "Accepted", numeric: true },
  { key: "discussionCount", label: "Discussions", numeric: true },
];

function num(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const parsed = parseFloat(String(value).replace("%", ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function formatCell(problem, key) {
  const value = problem[key];
  if (value == null) return "—";
  switch (key) {
    case "likeRatio":
      return `${(value * 100).toFixed(1)}%`;
    case "likes":
    case "totalAccepted":
    case "discussionCount":
      return Number(value).toLocaleString();
    default:
      return value;
  }
}

export default function ProblemsTable({ problems }) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [topic, setTopic] = useState("");
  const [sortKey, setSortKey] = useState("likes");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);

  const topics = useMemo(() => {
    const set = new Set();
    for (const p of problems) {
      for (const t of p.topics || []) set.add(t);
    }
    return [...set].sort();
  }, [problems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = problems.filter((p) => {
      if (difficulty && p.difficulty !== difficulty) return false;
      if (topic && !(p.topics || []).includes(topic)) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });

    const column = COLUMNS.find((c) => c.key === sortKey);
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (column?.numeric) {
        av = num(av);
        bv = num(bv);
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [problems, query, difficulty, topic, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(COLUMNS.find((c) => c.key === key)?.numeric ? "desc" : "asc");
    }
    setPage(0);
  }

  function resetPageAnd(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(0);
    };
  }

  return (
    <section className="explorer">
      <div className="controls">
        <input
          type="search"
          placeholder="Search by name…"
          value={query}
          onChange={resetPageAnd(setQuery)}
          className="control control--grow"
        />
        <select value={difficulty} onChange={resetPageAnd(setDifficulty)} className="control">
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select value={topic} onChange={resetPageAnd(setTopic)} className="control">
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <p className="summary">
        Showing {pageRows.length ? safePage * PAGE_SIZE + 1 : 0}–
        {safePage * PAGE_SIZE + pageRows.length} of {filtered.length.toLocaleString()}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`${col.numeric ? "num" : ""} sortable`}
                >
                  {col.label}
                  {sortKey === col.key && <span className="arrow">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p) => (
              <tr key={p.link}>
                <td>
                  <a href={p.link} target="_blank" rel="noreferrer">
                    {p.name}
                  </a>
                  <div className="topics">{(p.topics || []).join(" · ")}</div>
                </td>
                <td>
                  <span className={`badge badge--${(p.difficulty || "").toLowerCase()}`}>
                    {p.difficulty}
                  </span>
                </td>
                {COLUMNS.slice(2).map((col) => (
                  <td key={col.key} className="num">
                    {formatCell(p, col.key)}
                  </td>
                ))}
              </tr>
            ))}
            {!pageRows.length && (
              <tr>
                <td colSpan={COLUMNS.length} className="empty">
                  No problems match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>
          ← Prev
        </button>
        <span>
          Page {safePage + 1} of {pageCount}
        </span>
        <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1}>
          Next →
        </button>
      </div>
    </section>
  );
}
