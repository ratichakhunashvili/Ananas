import { useScoreHistory } from '../../../hooks/dataHooks';

export function ScoreHistoryTab({ gameId }: { gameId: string }) {
  const events = useScoreHistory(gameId);

  return (
    <div className="card" style={{ padding: 0 }}>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Team</th>
            <th>Amount</th>
            <th>Reason</th>
            <th>Source</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.timestamp).toLocaleTimeString()}</td>
              <td>{e.teamName}</td>
              <td style={{ color: e.amount >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>
                {e.amount >= 0 ? '+' : ''}
                {e.amount}
              </td>
              <td>{e.reason}</td>
              <td>{e.source}</td>
              <td>{e.adminName}</td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-state">
                No score events yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
