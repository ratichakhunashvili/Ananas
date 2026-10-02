// Realtime Database shapes. This is the server-authoritative live session state:
// every connected client (admin/team/spectator) subscribes to these paths
// and reacts instantly to changes. Nothing here is trusted blindly on write -
// see database.rules.json for the server-side write rules, and
// src/services/buzzerService.ts for the atomic transaction logic.

import type { GameStatus, QuestionStatus, QuestionType } from './index';

export interface LiveQuestionState {
  gameQuestionId: string;
  questionId: string;
  type: QuestionType;
  categoryName: string | null;
  points: number;
  timerSeconds: number | null;
  status: QuestionStatus;
  startedAt: number | null;
  endsAt: number | null;
  pausedRemainingMs: number | null;

  // Sanitized, display-only projections. NEVER include correctAnswer.
  text: string | null;
  imageUrl: string | null;
  imageUrls: string[] | null;
  choices: string[] | null;
  answerLength: number | null;

  // Problem case specific
  title: string | null;
  description: string | null;
  fileUrls: string[] | null;

  // Set when the question is resolved, so the Spectator screen can announce
  // the result ("TEAM ATLAS +2 POINTS") without having to diff the scoreboard.
  winningTeamId: string | null;
  awardedPoints: number | null;
}

export interface BuzzerAttempt {
  uid: string;
  teamId: string;
  at: number | object; // number once resolved from ServerValue.TIMESTAMP
  result: 'pending' | 'correct' | 'wrong';
}

export interface BuzzerClaim {
  uid: string;
  teamId: string;
  teamName: string;
  at: number | object;
}

export interface BuzzerWindow {
  open: boolean;
  claim?: BuzzerClaim | null;
  attempts?: Record<string, BuzzerAttempt>;
}

/**
 * PUBLIC music state - every signed-in client can read this (RTDB read
 * permission cascades down from `liveGames/$gameId`, so anything placed here
 * is readable by every team). It therefore contains NOTHING that identifies
 * the track: a team opening devtools must not be able to read the answer to
 * a "guess the song" round. The identifying fields live in LiveMusicPrivate
 * at a separate top-level path with its own read rule.
 */
export interface LiveMusicState {
  active: boolean;
  gameQuestionId: string | null;
  playing: boolean;
  playbackToken: number;
  playbackStartedAt: number | null;
  /** Seconds of clip to play before auto-pausing; not identifying. */
  playbackDurationSeconds: number | null;
}

/** Stored at `liveMusic/{gameId}` - readable only by Admin and Spectator. */
export interface LiveMusicPrivate {
  musicTrackId: string | null;
  provider: 'youtube' | null;
  providerId: string | null;
  title: string | null;
  artist: string | null;
  startSeconds: number;
}

export interface LiveProblemCaseState {
  active: boolean;
  gameQuestionId: string | null;
  title: string | null;
  description: string | null;
  fileUrls: string[] | null;
  phase: 'prep' | 'presenting' | 'done';
  startedAt: number | null;
  endsAt: number | null;
  presentationOrder: string[];
  currentPresentingTeamId: string | null;
}

export interface LiveKaraokeState {
  active: boolean;
  targetTeamId: string | null;
  targetTeamName: string | null;
  musicTrackId: string | null;
  providerId: string | null;
  title: string | null;
  artist: string | null;
  startSeconds: number;
  durationSeconds: number;
  playing: boolean;
  playbackToken: number;
  playbackStartedAt: number | null;
}

export interface LiveGameMeta {
  status: GameStatus;
  updatedAt: number | object;
  currentQuestion?: LiveQuestionState | null;
  buzzer?: Record<string, BuzzerWindow>; // keyed by gameQuestionId
  music?: LiveMusicState | null;
  problemCase?: LiveProblemCaseState | null;
  karaoke?: LiveKaraokeState | null;
}
