import type { LogMessage } from '$lib/bus/messages';

type BroadcastFn = (msg: LogMessage) => void;

let broadcastFn: BroadcastFn | null = null;
let _hijacked = false;

function makeBroadcastFn(ws: WebSocket): BroadcastFn {
  return (entry: LogMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(entry));
    }
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

export function installConsoleHijack(busSocket: WebSocket) {
  if (_hijacked) return;
  _hijacked = true;

  if (busSocket.readyState === WebSocket.OPEN) {
    broadcastFn = makeBroadcastFn(busSocket);
  }

  busSocket.addEventListener('open', () => {
    broadcastFn = makeBroadcastFn(busSocket);
  });

  busSocket.addEventListener('close', () => {
    broadcastFn = null;
  });

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

  console.log('Console hijack installed');
}
