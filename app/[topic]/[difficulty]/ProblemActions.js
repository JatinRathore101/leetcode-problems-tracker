'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Chip from './Chip';
import { DIFFICULTIES } from '@/lib/constants';

// Status options offered in the update form. The form is prefilled with the
// row's current status, so every option is a real status value.
const STATUS_OPTIONS = ['CLEAR', 'ERROR', 'TLE', 'MLE', 'SUCCESS'];

// Small inline SVG icons so the component stays dependency-free.
function CopyIcon() {
  return (
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ViewIcon() {
  return (
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
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function UpdateIcon() {
  return (
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
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// Overlay + centered panel. Closes on the backdrop click, the cross button, or
// the Escape key. Clicks inside the panel are stopped so they don't bubble to
// the backdrop.
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button
            type="button"
            className="modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

// A single labelled read-only field for the details view. `span` makes the
// field occupy the full grid width (used for long values: link/comment/solution).
function DetailRow({ label, value, pre, span }) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return (
    <div className={`detail-row${span ? ' detail-row--full' : ''}`}>
      <div className="detail-row__label">{label}</div>
      {pre ? (
        <pre className="detail-row__pre">{value}</pre>
      ) : (
        <div className="detail-row__value">{value}</div>
      )}
    </div>
  );
}

export default function ProblemActions({ problem }) {
  const router = useRouter();

  const [copied, setCopied] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');

  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('');
  const [solution, setSolution] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // --- Copy ---------------------------------------------------------------
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(problem.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers/contexts without the async clipboard API.
      const ta = document.createElement('textarea');
      ta.value = problem.link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } catch {
        /* give up silently */
      }
      document.body.removeChild(ta);
    }
  }

  // --- View ---------------------------------------------------------------
  async function openView() {
    setViewOpen(true);
    setViewLoading(true);
    setViewError('');
    setDetails(null);
    try {
      const res = await fetch('/get-problem-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: problem.link }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load details.');
      setDetails(data);
    } catch (err) {
      setViewError(err.message || 'Failed to load details.');
    } finally {
      setViewLoading(false);
    }
  }

  // --- Update -------------------------------------------------------------
  // Open the form and prefill it from the row's current DB values (the table
  // query doesn't carry comment/solution, so fetch the full row on demand).
  async function openUpdate() {
    setUpdateOpen(true);
    setUpdateLoading(true);
    setFormError('');
    setComment('');
    // Status is already on the row, so prefill it instantly; comment/solution
    // arrive from the fetch below.
    setStatus(problem.status ?? 'CLEAR');
    setSolution('');
    try {
      const res = await fetch('/get-problem-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: problem.link }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load problem.');
      setComment(data.comment ?? '');
      setStatus(data.status ?? 'CLEAR');
      setSolution(data.solution ?? '');
    } catch (err) {
      setFormError(err.message || 'Failed to load problem.');
    } finally {
      setUpdateLoading(false);
    }
  }

  // A non-CLEAR status requires a solution.
  const solutionRequired = status !== 'CLEAR';

  function validate() {
    // Comment may be empty (that clears it). Only the solution rule applies.
    if (solutionRequired && solution.trim() === '') {
      return 'A solution is required for this status.';
    }
    return '';
  }

  async function handleSave(e) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    // The form reflects the row's desired final state, so always send comment
    // and status. An empty comment clears it server-side; CLEAR wipes the
    // solution server-side, so a solution is only sent for non-CLEAR statuses.
    const body = {
      link: problem.link,
      comment: comment.trim(),
      status,
    };
    if (status !== 'CLEAR') body.solution = solution;

    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/update-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Update failed.');
      setUpdateOpen(false);
      // Re-render the server component so the table reflects the new status.
      router.refresh();
    } catch (err) {
      setFormError(err.message || 'Update failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="actions">
      <button
        type="button"
        className="icon-btn"
        title={copied ? 'Copied!' : 'Copy problem link'}
        aria-label="Copy problem link"
        onClick={handleCopy}
      >
        <CopyIcon />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="View details"
        aria-label="View details"
        onClick={openView}
      >
        <ViewIcon />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Update problem"
        aria-label="Update problem"
        onClick={openUpdate}
      >
        <UpdateIcon />
      </button>

      {copied && (
        <div className="toast" role="status" aria-live="polite">
          Link copied to clipboard.
        </div>
      )}

      {viewOpen && (
        <Modal title={problem.name} onClose={() => setViewOpen(false)}>
          {viewLoading && <p className="modal__hint">Loading…</p>}
          {viewError && <p className="modal__error">{viewError}</p>}
          {details && (
            <div className="details">
              <DetailRow
                label="Status"
                value={
                  <Chip
                    text={details.status}
                    state={details.status}
                    style={{ fontSize: '11px', width: '70px', padding: '4px' }}
                  />
                }
              />
              <DetailRow
                label="Difficulty"
                value={
                  <Chip
                    text={details.difficulty}
                    state={
                      details.difficulty === DIFFICULTIES[1]
                        ? 'orange'
                        : details.difficulty === DIFFICULTIES[2]
                          ? 'red'
                          : 'green'
                    }
                    style={{ fontSize: '11px', width: '70px', padding: '4px' }}
                  />
                }
              />
              <DetailRow label="Topic" value={details.topic} />
              <DetailRow label="Last updated" value={details.updated_at} />
              <DetailRow
                label="Link"
                span
                value={
                  <a href={details.link} target="_blank" rel="noreferrer">
                    {details.link}
                  </a>
                }
              />
              <DetailRow label="Comment" value={details.comment} pre span />
              <DetailRow label="Solution" value={details.solution} pre span />
            </div>
          )}
        </Modal>
      )}

      {updateOpen && (
        <Modal title={problem.name} onClose={() => setUpdateOpen(false)}>
          {updateLoading ? (
            <p className="modal__hint">Loading…</p>
          ) : (
            <form className="update-form" onSubmit={handleSave}>
              <label className="field">
                <span className="field__label">Comment</span>
                <textarea
                  className="field__input"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Leave a note about this problem"
                />
              </label>

              <label className="field">
                <span className="field__label">Status</span>
                <select
                  className="field__input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                {status === 'CLEAR' && (
                  <p className="modal__hint">
                    Marking as CLEAR will erase any saved solution.
                  </p>
                )}
              </label>

              {solutionRequired && (
                <label className="field field--full">
                  <span className="field__label">
                    Solution <span className="field__req">*</span>
                  </span>
                  <textarea
                    className="field__input field__input--mono"
                    rows={8}
                    value={solution}
                    onChange={(e) => setSolution(e.target.value)}
                    placeholder="Paste your solution"
                  />
                </label>
              )}

              {formError && <p className="modal__error">{formError}</p>}

              <div className="update-form__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setUpdateOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
