const STATUS_COLOR_MAPPING = {
  CLEAR: 'grey',
  ERROR: 'red',
  TLE: 'yellow',
  MLE: 'yellow',
  SUCCESS: 'green',
  LOCKED: 'orange',
};

// Small inline SVGs so the component stays dependency-free, matching the icon
// style already used in ProblemActions.js (24x24 box, strokeWidth 2, round
// caps). Every stroke and fill is `currentColor`, so each icon automatically
// takes the chip's own colour from the .chip--<color> rule.
//
// The two "filled" glyphs (ERROR, SUCCESS) draw a solid disc and then punch the
// cross/tick out of it in var(--bg). A real transparent knockout would need
// evenodd path arithmetic; against these near-black surfaces (--bg #0f1117 in
// the table, --panel #171a23 in the modal) the flat fill is indistinguishable.
const KNOCKOUT = 'var(--bg)';

// CLEAR — outlined circle with a dot: nothing attempted yet.
function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.75" fill="currentColor" />
    </svg>
  );
}

// ERROR — filled disc with a cross knocked out.
function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M8.5 8.5l7 7M15.5 8.5l-7 7"
        stroke={KNOCKOUT}
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

// TLE — outlined clock: ran out of time.
function TleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// MLE — outlined database: ran out of memory.
function MleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="6" rx="7.5" ry="3.25" />
      <path d="M4.5 6v6c0 1.8 3.36 3.25 7.5 3.25s7.5-1.46 7.5-3.25V6" />
      <path d="M4.5 12v6c0 1.8 3.36 3.25 7.5 3.25s7.5-1.46 7.5-3.25v-6" />
    </svg>
  );
}

// SUCCESS — filled disc with a tick knocked out.
function SuccessIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M7.75 12.25l2.75 2.75 5.75-5.75"
        stroke={KNOCKOUT}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// LOCKED — padlock: LeetCode Premium, can't be attempted.
function LockedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4.75"
        y="10.5"
        width="14.5"
        height="9.75"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8.25 10.5V7.75a3.75 3.75 0 017.5 0v2.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const STATUS_ICON_MAPPING = {
  CLEAR: ClearIcon,
  ERROR: ErrorIcon,
  TLE: TleIcon,
  MLE: MleIcon,
  SUCCESS: SuccessIcon,
  LOCKED: LockedIcon,
};

export default function Chip({ text, state, style = {} }) {
  const color = STATUS_COLOR_MAPPING?.[state] || state || 'grey';

  // Keyed off `state`, so only real status values get an icon. Difficulty chips
  // pass a raw colour name ('orange', 'red', 'green') and stay text-only.
  const Icon = STATUS_ICON_MAPPING?.[state];

  return (
    <span
      className={`chip chip--${color}`}
      {...(Object.keys(style || {}).length > 0 && { style })}
    >
      {Icon && (
        <span className="chip__icon">
          <Icon />
        </span>
      )}
      {text}
    </span>
  );
}
