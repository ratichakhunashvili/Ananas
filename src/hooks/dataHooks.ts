import { useEffect, useState } from 'react';
import type { AuditLogEntry, Category, Game, GameQuestion, MusicTrack, Question, ScoreEvent, Team, UserProfile } from '../types';
import type { LiveGameMeta } from '../types/live';
import { listenTeams } from '../services/teamService';
import { listenCategories } from '../services/categoryService';
import { listenQuestions } from '../services/questionService';
import { listenMusicLibrary } from '../services/musicService';
import {
  listenGame,
  listenGames,
  listenGameQuestions,
  listenLiveGame,
  listenLiveMusic,
} from '../services/gameService';
import { listenConnection, listenPresence } from '../services/presenceService';
import { listenSpectators } from '../services/userService';
import type { LiveMusicPrivate } from '../types/live';
import { listenScoreHistory } from '../services/scoreService';
import { listenAuditLog } from '../services/auditService';

export function useTeams(gameId: string | null | undefined): Team[] {
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => {
    if (!gameId) {
      setTeams([]);
      return;
    }
    return listenTeams(gameId, setTeams);
  }, [gameId]);
  return teams;
}

export function useCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => listenCategories(setCategories), []);
  return categories;
}

export function useQuestions(): Question[] {
  const [questions, setQuestions] = useState<Question[]>([]);
  useEffect(() => listenQuestions(setQuestions), []);
  return questions;
}

export function useMusicLibrary(): MusicTrack[] {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  useEffect(() => listenMusicLibrary(setTracks), []);
  return tracks;
}

export function useGame(gameId: string | null | undefined): Game | null {
  const [game, setGame] = useState<Game | null>(null);
  useEffect(() => {
    if (!gameId) {
      setGame(null);
      return;
    }
    return listenGame(gameId, setGame);
  }, [gameId]);
  return game;
}

export function useGames(): Game[] {
  const [games, setGames] = useState<Game[]>([]);
  useEffect(() => listenGames(setGames), []);
  return games;
}

export function useLiveGame(gameId: string | null | undefined): LiveGameMeta | null {
  const [state, setState] = useState<LiveGameMeta | null>(null);
  useEffect(() => {
    if (!gameId) {
      setState(null);
      return;
    }
    return listenLiveGame(gameId, setState);
  }, [gameId]);
  return state;
}

export function useGameQuestions(gameId: string | null | undefined): GameQuestion[] {
  const [gqs, setGqs] = useState<GameQuestion[]>([]);
  useEffect(() => {
    if (!gameId) {
      setGqs([]);
      return;
    }
    return listenGameQuestions(gameId, setGqs);
  }, [gameId]);
  return gqs;
}

/** Admin/Spectator only - the identity of the track in the live music round. */
export function useLiveMusic(gameId: string | null | undefined): LiveMusicPrivate | null {
  const [music, setMusic] = useState<LiveMusicPrivate | null>(null);
  useEffect(() => {
    if (!gameId) {
      setMusic(null);
      return;
    }
    return listenLiveMusic(gameId, setMusic);
  }, [gameId]);
  return music;
}

/** Whether THIS client currently has a live connection to Firebase. */
export function useIsConnected(): boolean {
  const [connected, setConnected] = useState(true);
  useEffect(() => listenConnection(setConnected), []);
  return connected;
}

/** Map of teamId -> true for teams with at least one device connected. */
export function usePresence(gameId: string | null | undefined): Record<string, boolean> {
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!gameId) {
      setPresence({});
      return;
    }
    return listenPresence(gameId, setPresence);
  }, [gameId]);
  return presence;
}

export function useSpectators(): UserProfile[] {
  const [spectators, setSpectators] = useState<UserProfile[]>([]);
  useEffect(() => listenSpectators(setSpectators), []);
  return spectators;
}

export function useScoreHistory(gameId: string | null | undefined): ScoreEvent[] {
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  useEffect(() => {
    if (!gameId) {
      setEvents([]);
      return;
    }
    return listenScoreHistory(gameId, setEvents);
  }, [gameId]);
  return events;
}

export function useAuditLog(gameId: string | null | undefined): AuditLogEntry[] {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  useEffect(() => {
    if (!gameId) {
      setEntries([]);
      return;
    }
    return listenAuditLog(gameId, setEntries);
  }, [gameId]);
  return entries;
}
