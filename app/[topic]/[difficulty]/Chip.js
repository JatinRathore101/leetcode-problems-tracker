const STATUS_COLOR_MAPPING = {
  CLEAR: 'grey',
  ERROR: 'red',
  TLE: 'orange',
  MLE: 'yellow',
  SUCCESS: 'green',
};

export default function Chip({ text, state, style = {} }) {
  const color = STATUS_COLOR_MAPPING?.[state] || state || 'grey';

  return (
    <span
      className={`chip chip--${color}`}
      {...(Object.keys(style || {}).length > 0 && { style })}
    >
      {text}
    </span>
  );
}
