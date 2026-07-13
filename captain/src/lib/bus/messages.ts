export interface LogMessage {
  type: 'log';
  level: 'info' | 'warn' | 'error' | 'debug';
  ts: number;
  msg: string;
  args?: unknown[];
}

export interface FakerMessage {
  type: 'faker';
  text: string;
  displayName?: string;
}

export interface ControlMessage {
  type: 'control';
  op: 'cancel' | 'blackSilence' | 'setEnabled';
  enabled?: boolean;
}

export type ClientToServer = FakerMessage | ControlMessage;

export type ServerToClient = LogMessage;

export type BusMessage = ClientToServer | ServerToClient;

export function isLogMessage(obj: unknown): obj is LogMessage {
  return typeof obj === 'object' && obj !== null && (obj as LogMessage).type === 'log';
}

export function isFakerMessage(obj: unknown): obj is FakerMessage {
  return typeof obj === 'object' && obj !== null && (obj as FakerMessage).type === 'faker';
}

export function isControlMessage(obj: unknown): obj is ControlMessage {
  return typeof obj === 'object' && obj !== null && (obj as ControlMessage).type === 'control';
}

export function isClientToServer(obj: unknown): obj is ClientToServer {
  return isFakerMessage(obj) || isControlMessage(obj);
}
