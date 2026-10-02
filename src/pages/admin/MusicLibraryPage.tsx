import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMusicLibrary } from '../../hooks/dataHooks';
import { addTrack, deleteTrack, extractYouTubeId, searchYouTube, type YouTubeSearchResult } from '../../services/musicService';

export default function MusicLibraryPage() {
  const { profile } = useAuth();
  const tracks = useMusicLibrary();

  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteArtist, setPasteArtist] = useState('');

  async function handleSearch() {
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchYouTube(searchText));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  async function addFromSearch(result: YouTubeSearchResult) {
    if (!profile) return;
    await addTrack({
      title: result.title,
      artist: result.channelTitle,
      thumbnail: result.thumbnail,
      providerId: result.providerId,
      url: `https://www.youtube.com/watch?v=${result.providerId}`,
      defaultStartSeconds: 0,
      createdBy: profile.uid,
    });
  }

  async function addFromUrl() {
    if (!profile) return;
    const providerId = extractYouTubeId(pasteUrl);
    if (!providerId) {
      alert('Could not parse a YouTube video ID from that input.');
      return;
    }
    await addTrack({
      title: pasteTitle || 'Untitled track',
      artist: pasteArtist || 'Unknown artist',
      thumbnail: `https://img.youtube.com/vi/${providerId}/mqdefault.jpg`,
      providerId,
      url: `https://www.youtube.com/watch?v=${providerId}`,
      defaultStartSeconds: 0,
      createdBy: profile.uid,
    });
    setPasteUrl('');
    setPasteTitle('');
    setPasteArtist('');
  }

  return (
    <div className="stack">
      <h1 className="title-lg">Music Library</h1>

      <div className="grid grid-2">
        <div className="card">
          <div className="title-md">Search YouTube</div>
          <div className="row" style={{ margin: '10px 0' }}>
            <input
              placeholder="Song or artist..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
              Search
            </button>
          </div>
          {searchError && <p className="muted">{searchError}</p>}
          <div className="stack" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {results.map((r) => (
              <div key={r.providerId} className="row surface">
                <img src={r.thumbnail} alt="" style={{ width: 64, borderRadius: 6 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{r.title}</div>
                  <div className="muted">{r.channelTitle}</div>
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => addFromSearch(r)}>
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="title-md">Add by URL (no API key needed)</div>
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="field">
              <label>YouTube URL or video ID</label>
              <input value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} placeholder="https://youtu.be/..." />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label>Title</label>
                <input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} />
              </div>
              <div className="field">
                <label>Artist</label>
                <input value={pasteArtist} onChange={(e) => setPasteArtist(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={addFromUrl} disabled={!pasteUrl.trim()}>
              Add track
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="title-md" style={{ marginBottom: 10 }}>
          Library ({tracks.length})
        </div>
        <div className="grid grid-3">
          {tracks.map((t) => (
            <div key={t.id} className="surface row">
              {t.thumbnail && <img src={t.thumbnail} alt="" style={{ width: 56, borderRadius: 6 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </div>
                <div className="muted">{t.artist}</div>
              </div>
              <button className="icon-btn" onClick={() => confirm('Remove this track?') && deleteTrack(t.id)}>
                ✕
              </button>
            </div>
          ))}
          {tracks.length === 0 && <div className="empty-state">No tracks yet.</div>}
        </div>
      </div>
    </div>
  );
}
