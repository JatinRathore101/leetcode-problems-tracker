const STATUS_CHIPS = {
  CLEAR: { color: "grey" },
  ERROR: { color: "red" },
  TLE: { color: "orange" },
  MLE: { color: "yellow" },
  SUCCESS: { color: "green" },
};

export default function Chip({ text, state, style = {} }) {
  const color = STATUS_CHIPS?.[state]?.color || state || "grey";

  return (
    <>
      <span
        className={`chip chip--${color}`}
        {...(Object.keys(style || {}).length > 0 && { style })}
      >
        {text}
      </span>
    </>
  );
}
