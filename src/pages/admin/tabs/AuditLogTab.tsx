import { useAuditLog } from '../../../hooks/dataHooks';

export function AuditLogTab({ gameId }: { gameId: string }) {
  const entries = useAuditLog(gameId);

  return (
    <div className="card" style={{ padding: 0 }}>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>By</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.timestamp).toLocaleTimeString()}</td>
              <td>{e.action}</td>
              <td>{e.actorName}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{JSON.stringify(e.payload)}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-state">
                No activity logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
