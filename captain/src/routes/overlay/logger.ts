import type { LogMessage } from '$lib/bus/messages';

const RECONNECT_DELAY = 2000;

type BroadcastFn = (msg: LogMessage) => void;

let broadcastFn: BroadcastFn | null = null;
let _hijacked = false;
let ws: WebSocket | null = null;

function connect(busUrl: string) {
  console.log(`[Overlay] Connecting to bus at ${busUrl}...`);

  ws = new WebSocket(busUrl);
  ws.onopen = () => {
    console.log('[Overlay] Connected to the bus');

    broadcastFn = (entry: LogMessage) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(entry));
      }
    };
  };

  ws.onclose = () => {
    console.warn('[Overlay] Disconnected from bus, retrying...');
    broadcastFn = null;
    setTimeout(() => connect(busUrl), RECONNECT_DELAY);
  };

  ws.onerror = () => {
    console.error('[Overlay] Unable to connect to the bus, retrying...');
  };
}

function safeSend(entry: LogMessage) {
  if (broadcastFn) {
    try {
      broadcastFn(entry);
    } catch {
      // silently drop if send fails
    }
  }
}

export function installConsoleHijack(busUrl: string) {
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

      const msg = `[Overlay] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;

      const entry: LogMessage = {
        type: 'log',
        level: levels[level],
        ts: Date.now(),
        msg,
        args: args.length > 1 ? args.slice(1) : undefined
      };

      safeSend(entry);
    };
  }

  console.log = makeLogger('log');
  console.info = makeLogger('info');
  console.warn = makeLogger('warn');
  console.error = makeLogger('error');
  console.debug = makeLogger('debug');

  connect(busUrl);
  console.log('[Overlay] Console hijack installed');
}
