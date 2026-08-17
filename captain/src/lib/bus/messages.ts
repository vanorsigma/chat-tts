import type { OverlayPositionsConfig } from '$lib/config';

export interface LogMessage {
  type: 'log';
  source: 'captain' | 'overlay' | 'startingsoon';
  level: 'info' | 'warn' | 'error' | 'debug';
  ts: number;
  msg: string;
  args?: unknown[];
}

export interface FakerMessage {
  type: 'faker';
  text: string;
  displayName?: string;
  userId?: string;
}

export interface FakerSubMessage {
  type: 'faker-sub';
  displayName?: string;
  tier: number;
}

export interface FakerBitsMessage {
  type: 'faker-bits';
  displayName?: string;
  amount: number;
}

export interface FakerWatchStreakMessage {
  type: 'faker-watch-streak';
  displayName?: string;
  streak: number;
}

export interface ControlMessage {
  type: 'control';
  op: 'cancel' | 'blackSilence' | 'setEnabled' | 'important';
  enabled?: boolean;
  importantActive?: boolean;
  importantDurationSec?: number;
}

export interface OverlayPositionsMessage {
  type: 'overlayPositions';
  positions: OverlayPositionsConfig;
}

export interface ConfigUpdatedMessage {
  type: 'config';
  config: Record<string, unknown>;
}

export interface PollOptionPayload {
  id: string;
  name: string;
  votes: number;
  channelPoints?: number;
}

export interface PollUpdateMessage {
  type: 'poll-update';
  id: string;
  title: string;
  options: PollOptionPayload[];
  totalVotes: number;
  status: 'active' | 'completed' | 'terminated';
  startDate: string;
  endDate: string;
}

export interface PredictionOutcomePayload {
  id: string;
  name: string;
  channelPoints: number;
  voters: number;
  color?: string;
}

export interface PredictionUpdateMessage {
  type: 'prediction-update';
  id: string;
  title: string;
  outcomes: PredictionOutcomePayload[];
  status: 'active' | 'locked' | 'resolved' | 'canceled';
  winningOutcomeId: string | null;
  startDate: string;
  endDate: string;
}

export interface KarmaUpdateMessage {
  type: 'karma-update';
  amount: number;
  label?: string;
}

export interface FontChangedMessage {
  type: 'font-changed';
  username: string;
}

export interface TokenRefreshedMessage {
  type: 'tokenRefreshed';
  account: 'bot' | 'broadcaster';
}

export type ClientToServer =
  | FakerMessage
  | FakerSubMessage
  | FakerBitsMessage
  | FakerWatchStreakMessage
  | ControlMessage
  | FontChangedMessage;

export type ServerToClient =
  | LogMessage
  | PollUpdateMessage
  | PredictionUpdateMessage
  | KarmaUpdateMessage
  | TokenRefreshedMessage
  | ConfigUpdatedMessage;

export type BusMessage = ClientToServer | ServerToClient;

export function isLogMessage(obj: unknown): obj is LogMessage {
  return typeof obj === 'object' && obj !== null && (obj as LogMessage).type === 'log';
}

export function isFakerMessage(obj: unknown): obj is FakerMessage {
  return typeof obj === 'object' && obj !== null && (obj as FakerMessage).type === 'faker';
}

export function isFakerSubMessage(obj: unknown): obj is FakerSubMessage {
  return typeof obj === 'object' && obj !== null && (obj as FakerSubMessage).type === 'faker-sub';
}

export function isFakerBitsMessage(obj: unknown): obj is FakerBitsMessage {
  return typeof obj === 'object' && obj !== null && (obj as FakerBitsMessage).type === 'faker-bits';
}

export function isFakerWatchStreakMessage(obj: unknown): obj is FakerWatchStreakMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as FakerWatchStreakMessage).type === 'faker-watch-streak'
  );
}

export function isControlMessage(obj: unknown): obj is ControlMessage {
  return typeof obj === 'object' && obj !== null && (obj as ControlMessage).type === 'control';
}

export function isClientToServer(obj: unknown): obj is ClientToServer {
  return (
    isFakerMessage(obj) ||
    isFakerSubMessage(obj) ||
    isFakerBitsMessage(obj) ||
    isFakerWatchStreakMessage(obj) ||
    isControlMessage(obj)
  );
}

export function isOverlayPositionsMessage(obj: unknown): obj is OverlayPositionsMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as OverlayPositionsMessage).type === 'overlayPositions'
  );
}

export function isConfigUpdatedMessage(obj: unknown): obj is ConfigUpdatedMessage {
  return typeof obj === 'object' && obj !== null && (obj as ConfigUpdatedMessage).type === 'config';
}

export function isPollUpdateMessage(obj: unknown): obj is PollUpdateMessage {
  return (
    typeof obj === 'object' && obj !== null && (obj as PollUpdateMessage).type === 'poll-update'
  );
}

export function isPredictionUpdateMessage(obj: unknown): obj is PredictionUpdateMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as PredictionUpdateMessage).type === 'prediction-update'
  );
}

export function isKarmaUpdateMessage(obj: unknown): obj is KarmaUpdateMessage {
  return (
    typeof obj === 'object' && obj !== null && (obj as KarmaUpdateMessage).type === 'karma-update'
  );
}

export function isFontChangedMessage(obj: unknown): obj is FontChangedMessage {
  return (
    typeof obj === 'object' && obj !== null && (obj as FontChangedMessage).type === 'font-changed'
  );
}

export function isTokenRefreshedMessage(obj: unknown): obj is TokenRefreshedMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as TokenRefreshedMessage).type === 'tokenRefreshed'
  );
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[\d;]*[a-zA-Z]/g, '');
}
