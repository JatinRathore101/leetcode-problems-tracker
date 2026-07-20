'use client';

import Link from 'next/link';
import { DIFFICULTIES } from '../../../lib/constants.js';

// Three horizontally stacked tabs at the top of every topic page. Each links to
// the same topic at a different difficulty, so switching is a client-side
// navigation between /:topic/EASY <-> /:topic/MEDIUM <-> /:topic/HARD.
export default function DifficultyTabs({ topicSlug, activeDifficulty }) {
  return (
    <div className="tabs" role="tablist" aria-label="Difficulty">
      {DIFFICULTIES.map((difficulty) => {
        const isActive = difficulty === activeDifficulty;
        return (
          <Link
            key={difficulty}
            href={`/${topicSlug}/${difficulty.toLowerCase()}`}
            role="tab"
            aria-selected={isActive}
            className={`tab tab--${difficulty.toLowerCase()}${
              isActive ? ' tab--active' : ''
            }`}
          >
            {difficulty}
          </Link>
        );
      })}
    </div>
  );
}
