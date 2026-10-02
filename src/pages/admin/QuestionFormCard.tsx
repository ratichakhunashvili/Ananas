import { useState } from 'react';
import type { Category, Difficulty, DistributiveOmit, MusicTrack, Question, QuestionType } from '../../types';
import { answerLength, createQuestion, updateQuestion, uploadQuestionImage } from '../../services/questionService';

const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'TEXT', label: 'Normal' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
  { value: 'PHOTO_ASSOCIATION', label: 'Photo Association' },
  { value: 'MUSIC_GUESS', label: 'Music' },
  { value: 'PROBLEM_CASE', label: 'Problem Case' },
];

const TIMER_PRESETS = [0, 15, 30, 60, 120];

interface Props {
  categories: Category[];
  musicTracks: MusicTrack[];
  existing?: Question | null;
  onDone: () => void;
  actorUid: string;
}

export function QuestionFormCard({ categories, musicTracks, existing, onDone, actorUid }: Props) {
  const [type, setType] = useState<QuestionType>(existing?.type ?? 'TEXT');
  const [categoryId, setCategoryId] = useState<string>(existing?.categoryId ?? '');
  const [points, setPoints] = useState(existing?.points ?? 1);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(existing?.timerSeconds ?? 30);
  const [customTimer, setCustomTimer] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(existing?.difficulty ?? '');
  const [active, setActive] = useState(existing?.active ?? true);

  const [text, setText] = useState(existing && 'text' in existing ? existing.text : '');
  const [imageUrl, setImageUrl] = useState<string | null>(
    existing && 'imageUrl' in existing ? existing.imageUrl : null
  );
  const [choicesText, setChoicesText] = useState(
    existing && 'choices' in existing && existing.choices ? existing.choices.join('\n') : ''
  );
  const [correctAnswer, setCorrectAnswer] = useState(
    existing && 'correctAnswer' in existing ? existing.correctAnswer : ''
  );

  const [imageUrls, setImageUrls] = useState<string[]>(
    existing && existing.type === 'PHOTO_ASSOCIATION' ? existing.imageUrls : []
  );

  const [musicTrackId, setMusicTrackId] = useState(
    existing && existing.type === 'MUSIC_GUESS' ? existing.musicTrackId : musicTracks[0]?.id ?? ''
  );
  const [startSeconds, setStartSeconds] = useState(
    existing && existing.type === 'MUSIC_GUESS' ? existing.startSeconds : 0
  );
  const [playbackDurationSeconds, setPlaybackDurationSeconds] = useState<number | null>(
    existing && existing.type === 'MUSIC_GUESS' ? existing.playbackDurationSeconds : 20
  );

  const [caseTitle, setCaseTitle] = useState(existing && existing.type === 'PROBLEM_CASE' ? existing.title : '');
  const [description, setDescription] = useState(
    existing && existing.type === 'PROBLEM_CASE' ? existing.description : ''
  );
  const [fileUrls, setFileUrls] = useState<string[]>(
    existing && existing.type === 'PROBLEM_CASE' ? existing.fileUrls : []
  );
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(
    existing && existing.type === 'PROBLEM_CASE' ? existing.timeLimitSeconds : 300
  );

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload(file: File, onUrl: (url: string) => void) {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadQuestionImage(file, type.toLowerCase());
      onUrl(url);
    } catch (err) {
      // Firebase Storage needs the Blaze plan on newer projects, so uploads
      // can fail on an otherwise perfectly working setup. Say so plainly and
      // point at the URL field, which works regardless.
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
      setUploadError(
        code.includes('unauthorized') || code.includes('unknown')
          ? 'Upload failed - Firebase Storage may not be enabled on this project. Paste an image URL instead.'
          : err instanceof Error
            ? err.message
            : 'Upload failed. Paste an image URL instead.'
      );
    } finally {
      setUploading(false);
    }
  }

  /** Lets images be added by URL when Storage isn't available. */
  function ImageUrlAdder({ onAdd }: { onAdd: (url: string) => void }) {
    const [value, setValue] = useState('');
    return (
      <div className="row" style={{ marginTop: 6 }}>
        <input
          placeholder="...or paste an image URL"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault();
              onAdd(value.trim());
              setValue('');
            }
          }}
        />
        <button
          type="button"
          className="btn btn-sm btn-outline"
          disabled={!value.trim()}
          onClick={() => {
            onAdd(value.trim());
            setValue('');
          }}
        >
          Add URL
        </button>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const base = {
        categoryId: categoryId || null,
        points: Number(points),
        timerSeconds: timerSeconds,
        difficulty: difficulty || null,
        active,
        order: existing?.order ?? Date.now(),
        createdBy: actorUid,
      };

      let payload: DistributiveOmit<Question, 'id' | 'createdAt'>;
      if (type === 'TEXT' || type === 'MULTIPLE_CHOICE') {
        payload = {
          ...base,
          type,
          text,
          imageUrl,
          choices: type === 'MULTIPLE_CHOICE' ? choicesText.split('\n').map((s) => s.trim()).filter(Boolean) : null,
          correctAnswer,
        };
      } else if (type === 'PHOTO_ASSOCIATION') {
        payload = { ...base, type, imageUrls, correctAnswer };
      } else if (type === 'MUSIC_GUESS') {
        payload = { ...base, type, musicTrackId, startSeconds: Number(startSeconds), playbackDurationSeconds };
      } else {
        payload = { ...base, type, title: caseTitle, description, fileUrls, timeLimitSeconds: Number(timeLimitSeconds) };
      }

      if (existing) {
        await updateQuestion(existing.id, payload);
      } else {
        await createQuestion(payload);
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card stack">
      <div className="field">
        <label>Question type</label>
        <div className="row-wrap">
          {TYPES.map((t) => (
            <button
              key={t.value}
              className={`btn btn-sm ${type === t.value ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setType(t.value)}
              disabled={!!existing}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-3">
        <div className="field">
          <label>Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Points</label>
          <input type="number" value={points} onChange={(e) => setPoints(Number(e.target.value))} min={0} />
        </div>
        <div className="field">
          <label>Difficulty</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}>
            <option value="">-</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>
      </div>

      {type !== 'PROBLEM_CASE' && (
        <div className="field">
          <label>Timer</label>
          <div className="row-wrap">
            {TIMER_PRESETS.map((s) => (
              <button
                key={s}
                className={`btn btn-sm ${!customTimer && timerSeconds === (s || null) ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => {
                  setCustomTimer(false);
                  setTimerSeconds(s === 0 ? null : s);
                }}
              >
                {s === 0 ? 'No timer' : `${s}s`}
              </button>
            ))}
            <button
              className={`btn btn-sm ${customTimer ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setCustomTimer(true)}
            >
              Custom
            </button>
            {customTimer && (
              <input
                type="number"
                style={{ width: 90 }}
                value={timerSeconds ?? ''}
                onChange={(e) => setTimerSeconds(Number(e.target.value))}
                placeholder="seconds"
              />
            )}
          </div>
        </div>
      )}

      {(type === 'TEXT' || type === 'MULTIPLE_CHOICE') && (
        <>
          <div className="field">
            <label>Question text</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="field">
            <label>Image (optional)</label>
            {imageUrl && <img src={imageUrl} alt="" style={{ maxHeight: 140, marginBottom: 8 }} />}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], setImageUrl)}
            />
            <ImageUrlAdder onAdd={setImageUrl} />
          </div>
          {type === 'MULTIPLE_CHOICE' && (
            <div className="field">
              <label>Choices (one per line)</label>
              <textarea value={choicesText} onChange={(e) => setChoicesText(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label>Correct answer</label>
            <input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
          </div>
        </>
      )}

      {type === 'PHOTO_ASSOCIATION' && (
        <>
          <div className="field">
            <label>Images (3-4 recommended)</label>
            <div className="image-grid" style={{ marginBottom: 8 }}>
              {imageUrls.map((url, i) => (
                <div key={url} style={{ position: 'relative' }}>
                  <img src={url} alt="" />
                  <button
                    className="icon-btn"
                    style={{ position: 'absolute', top: 4, right: 4 }}
                    onClick={() => setImageUrls(imageUrls.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], (url) => setImageUrls([...imageUrls, url]))}
            />
            <ImageUrlAdder onAdd={(url) => setImageUrls((prev) => [...prev, url])} />
          </div>
          <div className="field">
            <label>Correct answer</label>
            <input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
            {correctAnswer && <p className="muted">Answer length hint shown to players: {answerLength(correctAnswer)} letters</p>}
          </div>
        </>
      )}

      {type === 'MUSIC_GUESS' && (
        <>
          <div className="field">
            <label>Track (from Music Library)</label>
            <select value={musicTrackId} onChange={(e) => setMusicTrackId(e.target.value)}>
              <option value="">Select a track...</option>
              {musicTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} - {t.artist}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>Start position (seconds)</label>
              <input type="number" value={startSeconds} onChange={(e) => setStartSeconds(Number(e.target.value))} min={0} />
            </div>
            <div className="field">
              <label>Playback duration (seconds, optional)</label>
              <input
                type="number"
                value={playbackDurationSeconds ?? ''}
                onChange={(e) => setPlaybackDurationSeconds(e.target.value ? Number(e.target.value) : null)}
                min={0}
              />
            </div>
          </div>
        </>
      )}

      {type === 'PROBLEM_CASE' && (
        <>
          <div className="field">
            <label>Title</label>
            <input value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Problem description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
          </div>
          <div className="field">
            <label>Files / images (optional)</label>
            <div className="image-grid" style={{ marginBottom: 8 }}>
              {fileUrls.map((url, i) => (
                <div key={url} style={{ position: 'relative' }}>
                  <img src={url} alt="" />
                  <button
                    className="icon-btn"
                    style={{ position: 'absolute', top: 4, right: 4 }}
                    onClick={() => setFileUrls(fileUrls.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], (url) => setFileUrls([...fileUrls, url]))}
            />
            <ImageUrlAdder onAdd={(url) => setFileUrls((prev) => [...prev, url])} />
          </div>
          <div className="field">
            <label>Time limit (seconds)</label>
            <input type="number" value={timeLimitSeconds} onChange={(e) => setTimeLimitSeconds(Number(e.target.value))} />
          </div>
        </>
      )}

      <div className="checkbox-row">
        <input id="active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <label htmlFor="active" style={{ marginBottom: 0 }}>
          Active (eligible to appear in games)
        </label>
      </div>

      {uploadError && (
        <p className="badge badge-live" style={{ display: 'inline-block' }}>
          {uploadError}
        </p>
      )}

      <div className="row">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || uploading}>
          {saving ? 'Saving...' : 'Save question'}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
