'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import { TOPICS, topicToSlug, DEFAULT_DIFFICULTY } from '../lib/constants.js';

// White tick shown inside a covered topic's dot.
function TickIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

// The 33-topic navigation rail. Lives in the root layout so it stays mounted
// across every /:topic/:difficulty navigation (client-side transitions never
// remount it — no flicker, no scroll reset). Each option links to the topic's
// EASY page; the active topic is derived from the first path segment.
export default function Sidebar() {
  const pathname = usePathname();
  // pathname is "/<topicSlug>/<difficulty>" -> grab the topic slug segment.
  const activeSlug = pathname.split('/').filter(Boolean)[0] ?? '';

  const isHome = pathname === '/';

  // Per-topic success rates keyed by slug
  // ({ [slug]: { total, solved, percent, covered } }).
  const [stats, setStats] = useState({});
  const loadStats = useCallback(() => {
    fetch('/topic-stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.error) setStats(data);
      })
      .catch(() => {});
  }, []);

  // The sidebar stays mounted across client navigations, so refetch on every
  // pathname change to pick up status edits made on the page just left.
  useEffect(loadStats, [pathname, loadStats]);

  // Concept-covered confirmation dialog: { topic, covered } of the clicked
  // dot, or null when closed. `covered` is the topic's CURRENT state — the
  // confirm action writes its inverse.
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const closeConfirm = useCallback(() => {
    if (saving) return;
    setConfirm(null);
    setConfirmError('');
  }, [saving]);

  async function handleConfirm() {
    if (!confirm || saving) return;
    setSaving(true);
    setConfirmError('');
    try {
      const res = await fetch('/set-topic-covered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: confirm.topic,
          covered: !confirm.covered,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status}).`);
      }
      loadStats();
      setConfirm(null);
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setSaving(false);
    }
  }

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
                  <span className="sidebar__item-meta">
                    <span
                      className="sidebar__item-stat"
                      title={`${stat.solved} of ${stat.total} solved`}
                    >
                      {stat.percent}%
                    </span>
                    <button
                      type="button"
                      className={`sidebar__dot${stat.covered ? ' sidebar__dot--covered' : ''}`}
                      title={
                        stat.covered
                          ? 'Concept covered — click to mark as not covered'
                          : 'Concept not covered — click to mark as covered'
                      }
                      aria-label={`Mark ${topic} as ${stat.covered ? 'not covered' : 'covered'}`}
                      onClick={(e) => {
                        // The dot sits inside the topic <Link> — keep the
                        // click from navigating.
                        e.preventDefault();
                        e.stopPropagation();
                        setConfirmError('');
                        setConfirm({ topic, covered: stat.covered });
                      }}
                    >
                      {stat.covered && <TickIcon />}
                    </button>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {confirm && (
        <Modal
          className="modal--confirm"
          title={
            confirm.covered
              ? `Mark "${confirm.topic}" as concept not covered?`
              : `Mark "${confirm.topic}" as concept covered?`
          }
          onClose={closeConfirm}
        >
          {confirmError && <p className="modal__error">{confirmError}</p>}
          <div className="update-form__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={closeConfirm}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${confirm.covered ? 'btn--danger' : 'btn--blue'}`}
              onClick={handleConfirm}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </nav>
  );
}
