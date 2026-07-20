'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TOPICS, topicToSlug, DEFAULT_DIFFICULTY } from '../lib/constants.js';

// The 33-topic navigation rail. Lives in the root layout so it stays mounted
// across every /:topic/:difficulty navigation (client-side transitions never
// remount it — no flicker, no scroll reset). Each option links to the topic's
// EASY page; the active topic is derived from the first path segment.
export default function Sidebar() {
  const pathname = usePathname();
  // pathname is "/<topicSlug>/<difficulty>" -> grab the topic slug segment.
  const activeSlug = pathname.split('/').filter(Boolean)[0] ?? '';

  return (
    <nav className="sidebar" aria-label="Topics">
      <div className="sidebar__brand">Topics</div>
      <ul className="sidebar__list">
        {TOPICS.map((topic) => {
          const slug = topicToSlug(topic);
          const isActive = slug === activeSlug;
          return (
            <li key={topic}>
              <Link
                href={`/${slug}/${DEFAULT_DIFFICULTY.toLowerCase()}`}
                className={`sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {topic}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
