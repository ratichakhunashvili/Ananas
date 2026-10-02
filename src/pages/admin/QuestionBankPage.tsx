import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCategories, useMusicLibrary, useQuestions } from '../../hooks/dataHooks';
import { createCategory, deleteCategory, renameCategory } from '../../services/categoryService';
import { deleteQuestion } from '../../services/questionService';
import type { Question, QuestionType } from '../../types';
import { QuestionFormCard } from './QuestionFormCard';

const TYPE_LABEL: Record<QuestionType, string> = {
  TEXT: 'Normal',
  MULTIPLE_CHOICE: 'Multiple Choice',
  PHOTO_ASSOCIATION: 'Photo Association',
  MUSIC_GUESS: 'Music',
  PROBLEM_CASE: 'Problem Case',
};

export default function QuestionBankPage() {
  const { profile } = useAuth();
  const categories = useCategories();
  const musicTracks = useMusicLibrary();
  const questions = useQuestions();

  const [newCategory, setNewCategory] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [editing, setEditing] = useState<Question | null | 'new'>(null);

  const filtered = questions.filter(
    (q) =>
      (!filterCategory || q.categoryId === filterCategory) &&
      (!filterType || q.type === filterType) &&
      (!filterDifficulty || q.difficulty === filterDifficulty)
  );

  async function handleAddCategory() {
    if (!newCategory.trim()) return;
    await createCategory(newCategory);
    setNewCategory('');
  }

  if (editing && profile) {
    return (
      <div className="stack">
        <h1 className="title-lg">{editing === 'new' ? 'New question' : 'Edit question'}</h1>
        <QuestionFormCard
          categories={categories}
          musicTracks={musicTracks}
          existing={editing === 'new' ? null : editing}
          actorUid={profile.uid}
          onDone={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1 className="title-lg">Question Bank</h1>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + New Question
        </button>
      </div>

      <div className="card">
        <div className="title-md" style={{ marginBottom: 10 }}>
          Categories
        </div>
        <div className="row-wrap" style={{ marginBottom: 10 }}>
          {categories.map((c) => (
            <span key={c.id} className="badge badge-primary">
              {c.name}
              <button
                className="icon-btn"
                style={{ width: 18, height: 18, border: 'none', marginLeft: 4 }}
                onClick={() => {
                  const name = prompt('Rename category', c.name);
                  if (name) renameCategory(c.id, name);
                }}
              >
                ✎
              </button>
              <button
                className="icon-btn"
                style={{ width: 18, height: 18, border: 'none' }}
                onClick={() => confirm(`Delete category "${c.name}"?`) && deleteCategory(c.id)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="row">
          <input
            placeholder="New category name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          <button className="btn btn-outline btn-sm" onClick={handleAddCategory}>
            Add category
          </button>
        </div>
      </div>

      <div className="row-wrap">
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">All difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Type</th>
              <th>Category</th>
              <th>Points</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => (
              <tr key={q.id}>
                <td>{'text' in q ? q.text : 'title' in q ? q.title : '(photo/music round)'}</td>
                <td>{TYPE_LABEL[q.type]}</td>
                <td>{categories.find((c) => c.id === q.categoryId)?.name ?? '-'}</td>
                <td>{q.points}</td>
                <td>
                  <span className={`badge ${q.active ? 'badge-success' : 'badge-warning'}`}>
                    {q.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="row">
                  <button className="btn btn-sm btn-outline" onClick={() => setEditing(q)}>
                    Edit
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => confirm('Delete this question?') && deleteQuestion(q.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No questions match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
