'use client';

import { useState } from 'react';
import ProblemsList from './[topic]/[difficulty]/ProblemsList.js';

// Home-page search. Enter a string and hit Search to fuzzy-match it against the
// `name` and `link` columns of leetcode_problems; matches render in the same
// table (columns, actions, status) used on every topic page.
export default function HomeSearch() {
  const [term, setTerm] = useState('');
  const [problems, setProblems] = useState(null); // null = no search run yet
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    const query = term.trim();
    if (query.length < 3) return;

    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/search-problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Search failed.');
      setProblems(data.problems);
      setTotal(data.total ?? data.problems.length);
      setSearched(query);
    } catch (err) {
      console.error(err);
      setError(true);
      setProblems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  const shown = problems?.length ?? 0;
  const truncated = total > shown;

  return (
    <div className="topic-page">
      <header className="topic-page__header">
        <form className="home-search" onSubmit={handleSearch} role="search">
          <input
            type="text"
            className="control control--grow"
            placeholder="Search problems by name or link…"
            aria-label="Search problems"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading || term.trim().length < 3}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>
      </header>

      <div className="topic-page__body">
        {problems === null ? (
          <p className="empty">
            Search LeetCode problems by name or link to get started.
          </p>
        ) : (
          <>
            {!error && shown > 0 && (
              <p className="summary">
                {truncated
                  ? `Showing top ${shown} of ${total} matches for “${searched}”.`
                  : `${total} ${total === 1 ? 'match' : 'matches'} for “${searched}”.`}
              </p>
            )}
            {!error && shown === 0 ? (
              <p className="empty">No problems match “{searched}”.</p>
            ) : (
              <ProblemsList problems={problems} error={error} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
