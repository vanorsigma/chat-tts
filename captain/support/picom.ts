import { connect } from 'net';
import WebSocket from 'ws';

const BUS_URL = process.env.BUS_URL ?? 'ws://localhost:3001';
const PICOM_SOCKET_PATH = process.env.PICOM_SOCKET_PATH ?? '/tmp/picom.sock';

type PicomShaderMessage = {
  type: 'picom-shader';
  op: 'ENABLE' | 'DISABLE' | 'LIST';
  shader: string;
  durationMs?: number;
};

function isPicomShaderMessage(data: unknown): data is PicomShaderMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).type === 'picom-shader' &&
    typeof (data as Record<string, unknown>).op === 'string' &&
    typeof (data as Record<string, unknown>).shader === 'string'
  );
}

function sendToPicom(line: string): Promise<void> {
  return new Promise((resolve) => {
    const sock = connect(PICOM_SOCKET_PATH);
    sock.on('connect', () => {
      sock.end(line, () => resolve());
    });
    sock.on('error', (err) => {
      console.warn(`[PicomCtl] socket write failed (${PICOM_SOCKET_PATH}):`, err.message);
      resolve();
    });
  });
}

function connectToBus() {
  const ws = new WebSocket(`${BUS_URL}/receivers`);

  ws.on('open', () => {
    console.log(`[PicomCtl] connected to receiver bus at ${BUS_URL}`);
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (!isPicomShaderMessage(msg)) return;

      const line = `${msg.op} ${msg.shader}\n`;
      console.log(`[PicomCtl] -> ${line.trim()}`);
      await sendToPicom(line);

      if (msg.op === 'ENABLE' && typeof msg.durationMs === 'number' && msg.durationMs > 0) {
        setTimeout(async () => {
          const disableLine = `DISABLE ${msg.shader}\n`;
          console.log(`[PicomCtl] -> ${disableLine.trim()}`);
          await sendToPicom(disableLine);
        }, msg.durationMs);
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    console.warn('[PicomCtl] bus closed, reconnecting in 2s');
    setTimeout(connectToBus, 2000);
  });

  ws.on('error', (err) => {
    console.warn('[PicomCtl] bus error:', err.message);
    // close handler will reconnect
  });
}

connectToBus();
