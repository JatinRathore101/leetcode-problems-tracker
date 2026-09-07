import ProblemRow from './ProblemRow.js';

// Renders the problems table for a single topic + difficulty. Rows come
// pre-fetched from the caller so this stays a pure presentational component;
// the only interactivity lives inside ProblemRow (a client component).
export default function ProblemsList({ problems, error }) {
  if (error) {
    return (
      <p className="empty">
        Couldn&apos;t load problems. Make sure the database is set up (
        <code>npm run db:setup</code>).
      </p>
    );
  }

  if (!problems || problems.length === 0) {
    return (
      <p className="empty">No problems found for this topic and difficulty.</p>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Problem</th>
            <th className="col-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((p, i) => (
            <ProblemRow key={p.link} problem={p} index={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
