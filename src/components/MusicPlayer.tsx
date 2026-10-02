import { useEffect, useRef, useState } from 'react';

// Minimal shape of the bits of the YT.Player API this component actually uses.
interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

interface YouTubeNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars: Record<string, number>;
      events: { onReady: () => void };
    }
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiLoadPromise;
}

interface MusicPlayerProps {
  providerId: string;
  startSeconds: number;
  shouldPlay: boolean;
  /** Stop after this many seconds of actual playback; null plays on. */
  playbackDurationSeconds?: number | null;
  visible?: boolean;
}

/**
 * Thin wrapper around the YouTube IFrame API. The provider is intentionally
 * isolated here - swapping in Spotify (or anything else) later only means
 * replacing this component and the `provider`/`providerId` fields it reads.
 *
 * Give this component a `key` (e.g. the live music state's playbackToken)
 * from the parent whenever a brand-new track/round starts, so it remounts
 * and seeks to `startSeconds` fresh. Toggling `shouldPlay` on an already-
 * mounted instance just pauses/resumes from the current position.
 */
export function MusicPlayer({
  providerId,
  startSeconds,
  shouldPlay,
  playbackDurationSeconds = null,
  visible = false,
}: MusicPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playedMsRef = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: providerId,
        playerVars: { autoplay: 0, controls: visible ? 1 : 0, start: Math.floor(startSeconds) },
        events: { onReady: () => setReady(true) },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // Intentionally only re-run when the provider id changes; a dedicated
    // `key` prop from the caller is what forces a true remount per round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  useEffect(() => {
    if (!ready || !playerRef.current) return;
    if (shouldPlay) playerRef.current.playVideo();
    else playerRef.current.pauseVideo();
  }, [shouldPlay, ready]);

  // Honour the configured clip length. Without this, a "play 20 seconds of
  // this song" round just kept playing the whole track under the discussion.
  // Measured in play-time, not wall-clock, so pausing for a buzz doesn't
  // eat into the clip.
  useEffect(() => {
    if (!ready || !shouldPlay || !playbackDurationSeconds || playbackDurationSeconds <= 0) return;
    const remainingMs = Math.max(0, playbackDurationSeconds * 1000 - playedMsRef.current);
    const startedAt = Date.now();
    const timer = window.setTimeout(() => {
      playedMsRef.current = playbackDurationSeconds * 1000;
      playerRef.current?.pauseVideo();
    }, remainingMs);
    return () => {
      window.clearTimeout(timer);
      playedMsRef.current += Date.now() - startedAt;
    };
  }, [ready, shouldPlay, playbackDurationSeconds]);

  return (
    <div
      ref={containerRef}
      style={
        visible
          ? { width: '100%', aspectRatio: '16/9', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }
          : { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }
      }
    />
  );
}
