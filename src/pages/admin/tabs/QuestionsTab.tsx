import { useEffect, useRef, useState } from 'react';
import { useCategories, useGameQuestions, useQuestions } from '../../../hooks/dataHooks';
import { setGameQuestions } from '../../../services/gameService';
import type { QuestionType } from '../../../types';

const TYPE_LABEL: Record<QuestionType, string> = {
  TEXT: 'Normal',
  MULTIPLE_CHOICE: 'Multiple Choice',
  PHOTO_ASSOCIATION: 'Photo Association',
  MUSIC_GUESS: 'Music',
  PROBLEM_CASE: 'Problem Case',
};

export function QuestionsTab({ gameId }: { gameId: string }) {
  const allQuestions = useQuestions();
  const categories = useCategories();
  const gameQuestions = useGameQuestions(gameId);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Hydrate the local selection from the server exactly once per game, but
  // only once the server data has actually arrived. Keying this off [gameId]
  // alone would latch in the empty array that Firestore returns on the first
  // render - which then looked like "no questions selected" and, on save,
  // silently wiped the real list.
  const hydratedGameId = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedGameId.current === gameId) return;
    if (gameQuestions.length === 0) return;
    hydratedGameId.current = gameId;
    setSelectedIds(gameQuestions.map((gq) => gq.questionId));
  }, [gameId, gameQuestions]);

  // A game with genuinely zero questions still needs to be marked hydrated,
  // otherwise the first add would be followed by a late hydration that
  // clobbers it. Firestore delivers an initial snapshot either way, so one
  // tick after mount is enough to distinguish "empty" from "not loaded yet".
  useEffect(() => {
    if (hydratedGameId.current === gameId) return;
    const t = window.setTimeout(() => {
      if (hydratedGameId.current !== gameId) hydratedGameId.current = gameId;
    }, 1500);
    return () => window.clearTimeout(t);
  }, [gameId]);

  const available = allQuestions.filter(
    (q) => q.active && !selectedIds.includes(q.id) && (!filterCategory || q.categoryId === filterCategory)
  );
  const selectedQuestions = selectedIds
    .map((id) => allQuestions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => !!q);

  // Every change persists immediately. The previous explicit "Save order"
  // button meant a teacher who edited the list and navigated away silently
  // lost the whole thing; setGameQuestions reconciles rather than recreates,
  // so writing on every edit is safe even while a game is live.
  async function commit(next: string[]) {
    setSelectedIds(next);
    setSaveState('saving');
    try {
      await setGameQuestions(
        gameId,
        next.map((questionId) => ({ questionId }))
      );
      setSaveState('saved');
      window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch {
      setSaveState('error');
    }
  }

  function addQuestion(id: string) {
    commit([...selectedIds, id]);
  }
  function removeQuestion(id: string) {
    commit(selectedIds.filter((x) => x !== id));
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...selectedIds];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="spread">
          <div className="title-md">Question bank</div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="stack" style={{ marginTop: 10, maxHeight: 460, overflowY: 'auto' }}>
          {available.map((q) => (
            <div key={q.id} className="row surface">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>
                  {'text' in q ? q.text : 'title' in q ? q.title : TYPE_LABEL[q.type]}
                </div>
                <div className="muted">
                  {TYPE_LABEL[q.type]} - {q.points} pts
                </div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => addQuestion(q.id)}>
                Add
              </button>
            </div>
          ))}
          {available.length === 0 && <div className="empty-state">No more questions available.</div>}
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <div className="title-md">Selected for this homework ({selectedQuestions.length})</div>
          <span className={`badge ${saveState === 'error' ? 'badge-live' : 'badge-success'}`}>
            {saveState === 'saving'
              ? 'Saving...'
              : saveState === 'error'
                ? 'Save failed'
                : saveState === 'saved'
                  ? 'Saved'
                  : 'Saves automatically'}
          </span>
        </div>
        <div className="stack" style={{ marginTop: 10, maxHeight: 460, overflowY: 'auto' }}>
          {selectedQuestions.map((q, i) => (
            <div key={q.id} className="row surface">
              <span className="muted">{i + 1}.</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>
                  {'text' in q ? q.text : 'title' in q ? q.title : TYPE_LABEL[q.type]}
                </div>
                <div className="muted">
                  {TYPE_LABEL[q.type]} - {q.points} pts
                </div>
              </div>
              <button className="icon-btn" onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="icon-btn" onClick={() => move(i, 1)}>
                ↓
              </button>
              <button className="icon-btn" onClick={() => removeQuestion(q.id)}>
                ✕
              </button>
            </div>
          ))}
          {selectedQuestions.length === 0 && (
            <div className="empty-state">Add questions from the bank on the left.</div>
          )}
        </div>
      </div>
    </div>
  );
}
