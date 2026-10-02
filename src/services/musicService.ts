import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { MusicTrack } from '../types';

export interface YouTubeSearchResult {
  providerId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}

/**
 * Extracts an 11-character YouTube video ID from a full URL, short URL, or a
 * bare ID typed directly. Keeps the music provider replaceable: this is the
 * only place that needs to change to support a different URL shape.
 */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.replace('/', '') || null;
    }
    if (url.searchParams.get('v')) {
      return url.searchParams.get('v');
    }
    const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
  } catch {
    return null;
  }
  return null;
}

/**
 * Searches YouTube via the official Data API v3. Requires VITE_YOUTUBE_API_KEY.
 * Without a key, Admin can still add tracks by pasting a URL/ID directly -
 * see extractYouTubeId - so the music library works either way.
 */
export async function searchYouTube(queryText: string): Promise<YouTubeSearchResult[]> {
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'No YouTube API key configured (VITE_YOUTUBE_API_KEY). Paste a YouTube URL or video ID directly instead.'
    );
  }
  const params = new URLSearchParams({
    key: apiKey,
    part: 'snippet',
    type: 'video',
    maxResults: '10',
    videoCategoryId: '10',
    q: queryText,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`YouTube search failed (${res.status}).`);
  }
  const json = await res.json();
  return (json.items ?? []).map(
    (item: {
      id: { videoId: string };
      snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string } } };
    }) => ({
      providerId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium?.url ?? '',
    })
  );
}

export async function addTrack(
  track: Omit<MusicTrack, 'id' | 'createdAt' | 'provider'>
): Promise<string> {
  const docRef = await addDoc(collection(db, 'musicLibrary'), {
    ...track,
    provider: 'youtube',
    createdAt: Date.now(),
  });
  return docRef.id;
}

export async function deleteTrack(id: string): Promise<void> {
  await deleteDoc(doc(db, 'musicLibrary', id));
}

export function listenMusicLibrary(cb: (tracks: MusicTrack[]) => void): () => void {
  const q = query(collection(db, 'musicLibrary'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MusicTrack, 'id'>) })));
  });
}
