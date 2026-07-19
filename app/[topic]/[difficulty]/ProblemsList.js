// Server component: renders the problems table for a single topic + difficulty.
// Rows come pre-fetched from the caller so this stays a pure presentational
// component.
export default function ProblemsList({ problems, error }) {
  if (error) {
    return (
      <p className="empty">
        Couldn&apos;t load problems. Make sure the database is set up
        (<code>npm run db:setup</code>).
      </p>
    );
  }

  if (!problems || problems.length === 0) {
    return <p className="empty">No problems found for this topic and difficulty.</p>;
  }

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Problem</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p, i) => (
              <tr key={p.link}>
                <td className="num">{i + 1}</td>
                <td>
                  <a href={p.link} target="_blank" rel="noreferrer">
                    {p.name}
                  </a>
                  <div className="topics">{p.topic}</div>
                </td>
                <td>{p.status || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
