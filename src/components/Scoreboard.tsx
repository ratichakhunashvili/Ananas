import type { Team } from '../types';

export function Scoreboard({ teams, highlightTeamId }: { teams: Team[]; highlightTeamId?: string | null }) {
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  return (
    <div className="scoreboard">
      {sorted.map((team, i) => (
        <div
          key={team.id}
          className={`score-row${i === 0 && team.score > 0 ? ' is-top' : ''}`}
          style={
            highlightTeamId === team.id
              ? { outline: `2px solid var(--color-accent)`, outlineOffset: 2 }
              : undefined
          }
        >
          <span className="score-rank">{i + 1}</span>
          <span className="score-name">{team.name}</span>
          <span className="score-value">{team.score}</span>
        </div>
      ))}
      {sorted.length === 0 && <div className="empty-state">No teams yet.</div>}
    </div>
  );
}
