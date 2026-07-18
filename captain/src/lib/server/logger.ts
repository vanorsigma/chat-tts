import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { stripAnsi, type LogMessage } from '$lib/bus/messages';

type BroadcastFn = (msg: LogMessage) => void;

const RING_MAX = 500;
const ring: LogMessage[] = [];
let broadcastFn: BroadcastFn | null = null;

const LOG_DIR = join(process.cwd(), 'logs');
let _hijacked = false;
let _logFilePath: string | null = null;

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFilePath(): string {
  if (_logFilePath) return _logFilePath;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-');
  _logFilePath = join(LOG_DIR, `${dateStr}T${timeStr}.log`);
  ensureLogDir();
  return _logFilePath;
}

function appendToFile(entry: LogMessage) {
  appendFileSync(getLogFilePath(), JSON.stringify(entry) + '\n');
}

function pushRing(entry: LogMessage) {
  ring.push(entry);
  if (ring.length > RING_MAX) {
    ring.shift();
  }
}

export function getLogFile(): string {
  return getLogFilePath();
}

export function getRecentLogs(): LogMessage[] {
  return [...ring];
}

export function setBroadcastFn(fn: BroadcastFn) {
  broadcastFn = fn;
}

export function installConsoleHijack() {
  if (_hijacked) return;
  _hijacked = true;

  const levels = {
    log: 'info',
    info: 'info',
    warn: 'warn',
    error: 'error',
    debug: 'debug'
  } as const;

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
  };

  function makeLogger(level: keyof typeof levels) {
    return (...args: unknown[]) => {
      orig[level](...args);

      const msg = stripAnsi(
        `[Captain] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`
      );

      const entry: LogMessage = {
        type: 'log',
        level: levels[level],
        ts: Date.now(),
        msg,
        args: args.length > 1 ? args.slice(1) : undefined
      };

      pushRing(entry);
      appendToFile(entry);

      if (broadcastFn) {
        broadcastFn(entry);
      }
    };
  }

  console.log = makeLogger('log');
  console.info = makeLogger('info');
  console.warn = makeLogger('warn');
  console.error = makeLogger('error');
  console.debug = makeLogger('debug');

  console.log(`Console hijack installed, logging to ${getLogFilePath()}`);
}
