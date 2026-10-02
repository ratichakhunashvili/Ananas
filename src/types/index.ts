// Core domain types shared across the app. Firestore = durable structured data.
// See src/types/live.ts for the Realtime Database (ephemeral, live-session) shapes.

// Plain `Omit<T, K>` does NOT distribute over a union: `keyof` of a union
// type is the INTERSECTION of each member's keys, so `Omit<Question, 'id'>`
// silently collapses to only the fields every question type shares (losing
// `text`, `imageUrls`, `title`, etc). This version distributes first.
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type DistributivePartial<T> = T extends unknown ? Partial<T> : never;

export type Role = 'admin' | 'team' | 'spectator';

export type GameStatus = 'DRAFT' | 'LOBBY' | 'LIVE' | 'PAUSED' | 'FINISHED';

export type QuestionStatus =
  | 'WAITING'
  | 'ACTIVE'
  | 'BUZZER_LOCKED'
  | 'ANSWERING'
  | 'WRONG_ANSWER'
  | 'COMPLETED'
  | 'TIME_EXPIRED';

export type QuestionType =
  | 'TEXT'
  | 'MULTIPLE_CHOICE'
  | 'PHOTO_ASSOCIATION'
  | 'MUSIC_GUESS'
  | 'PROBLEM_CASE';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface UserProfile {
  uid: string;
  role: Role;
  username: string;
  displayName: string;
  email: string | null;
  gameId: string | null;
  teamId: string | null;
  disabled: boolean;
  createdAt: number;
  createdBy: string | null;
}

export interface Category {
  id: string;
  name: string;
  createdAt: number;
}

interface QuestionBase {
  id: string;
  categoryId: string | null;
  points: number;
  timerSeconds: number | null;
  difficulty: Difficulty | null;
  active: boolean;
  order: number;
  createdAt: number;
  createdBy: string;
}

export interface TextQuestion extends QuestionBase {
  type: 'TEXT' | 'MULTIPLE_CHOICE';
  text: string;
  imageUrl: string | null;
  choices: string[] | null;
  correctAnswer: string;
}

export interface PhotoAssociationQuestion extends QuestionBase {
  type: 'PHOTO_ASSOCIATION';
  imageUrls: string[];
  correctAnswer: string;
}

export interface MusicGuessQuestion extends QuestionBase {
  type: 'MUSIC_GUESS';
  musicTrackId: string;
  startSeconds: number;
  playbackDurationSeconds: number | null;
}

export interface ProblemCaseQuestion extends QuestionBase {
  type: 'PROBLEM_CASE';
  title: string;
  description: string;
  fileUrls: string[];
  timeLimitSeconds: number;
}

export type Question =
  | TextQuestion
  | PhotoAssociationQuestion
  | MusicGuessQuestion
  | ProblemCaseQuestion;

export type MusicProvider = 'youtube';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  provider: MusicProvider;
  providerId: string;
  url: string;
  defaultStartSeconds: number;
  createdAt: number;
  createdBy: string;
}

export interface Game {
  id: string;
  name: string;
  status: GameStatus;
  createdAt: number;
  createdBy: string;
  startedAt: number | null;
  pausedAt: number | null;
  endedAt: number | null;
  currentGameQuestionId: string | null;
}

export interface Team {
  id: string;
  gameId: string;
  name: string;
  color: string | null;
  score: number;
  // A team IS the login: one shared username/password, used from however
  // many devices the team's members are on. `uid` is that Firebase Auth
  // user's id; `username` is duplicated here for display/management.
  uid: string | null;
  username: string | null;
  disabled: boolean;
  createdAt: number;
}

export interface GameQuestion {
  id: string;
  questionId: string;
  order: number;
  pointsOverride: number | null;
  status: QuestionStatus;
}

export type ScoreSource =
  | 'QUESTION'
  | 'PHOTO_ASSOCIATION'
  | 'MUSIC_GUESS'
  | 'KARAOKE_BONUS'
  | 'PROBLEM_CASE'
  | 'MANUAL_ADJUSTMENT';

export interface ScoreEvent {
  id: string;
  gameId: string;
  teamId: string;
  teamName: string;
  amount: number;
  reason: string;
  source: ScoreSource;
  questionId: string | null;
  adminUid: string;
  adminName: string;
  timestamp: number;
}

export type AuditAction =
  | 'GAME_CREATED'
  | 'GAME_STARTED'
  | 'GAME_PAUSED'
  | 'GAME_RESUMED'
  | 'GAME_ENDED'
  | 'QUESTION_STARTED'
  | 'QUESTION_ENDED'
  | 'TEAM_BUZZED'
  | 'ANSWER_CORRECT'
  | 'ANSWER_WRONG'
  | 'POINTS_ADDED'
  | 'POINTS_REMOVED'
  | 'KARAOKE_STARTED'
  | 'KARAOKE_SCORED'
  | 'CASE_STARTED'
  | 'CASE_SCORED'
  | 'TEAM_CREATED'
  | 'TEAM_UPDATED'
  | 'TEAM_DELETED';

export interface AuditLogEntry {
  id: string;
  gameId: string;
  action: AuditAction;
  actorUid: string;
  actorName: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
