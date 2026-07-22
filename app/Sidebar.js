'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TOPICS, topicToSlug, DEFAULT_DIFFICULTY } from '../lib/constants.js';

// The 33-topic navigation rail. Lives in the root layout so it stays mounted
// across every /:topic/:difficulty navigation (client-side transitions never
// remount it — no flicker, no scroll reset). Each option links to the topic's
// EASY page; the active topic is derived from the first path segment.
export default function Sidebar() {
  const pathname = usePathname();
  // pathname is "/<topicSlug>/<difficulty>" -> grab the topic slug segment.
  const activeSlug = pathname.split('/').filter(Boolean)[0] ?? '';

  const isHome = pathname === '/';

  // Per-topic success rates keyed by slug ({ [slug]: { total, solved, percent } }).
  // The sidebar stays mounted across client navigations, so we refetch on every
  // pathname change to pick up status edits made on the page just left.
  const [stats, setStats] = useState({});
  useEffect(() => {
    let cancelled = false;
    fetch('/topic-stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && !data.error) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <nav className="sidebar" aria-label="Topics">
      <ul className="sidebar__list">
        <li>
          <Link
            href="/"
            className={`sidebar__item${isHome ? ' sidebar__item--active' : ''}`}
            aria-current={isHome ? 'page' : undefined}
            aria-label="Search"
            title="Search"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </Link>
        </li>
        {TOPICS.map((topic) => {
          const slug = topicToSlug(topic);
          const isActive = slug === activeSlug;
          const stat = stats[slug];
          return (
            <li key={topic}>
              <Link
                href={`/${slug}/${DEFAULT_DIFFICULTY.toLowerCase()}`}
                className={`sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="sidebar__item-name">{topic}</span>
                {stat && (
                  <span
                    className="sidebar__item-stat"
                    title={`${stat.solved} of ${stat.total} solved`}
                  >
                    {stat.percent}%
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
