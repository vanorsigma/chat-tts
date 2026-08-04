import { connect } from 'net';
import WebSocket from 'ws';

const BUS_URL = process.env.BUS_URL ?? 'ws://localhost:3001';
const PICOM_SOCKET_PATH = process.env.PICOM_SOCKET_PATH ?? '/tmp/picom.sock';

type PicomShaderMessage = {
  type: 'picom-shader';
  op: 'ENABLE' | 'DISABLE' | 'LIST';
  shader: string;
  parameters?: Record<string, number>;
};

function isParameters(value: unknown): value is Record<string, number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((parameter) => typeof parameter === 'number')
  );
}

function isPicomShaderMessage(data: unknown): data is PicomShaderMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).type === 'picom-shader' &&
    typeof (data as Record<string, unknown>).op === 'string' &&
    typeof (data as Record<string, unknown>).shader === 'string' &&
    ((data as Record<string, unknown>).parameters === undefined ||
      isParameters((data as Record<string, unknown>).parameters))
  );
}

function sendToPicom(payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect(PICOM_SOCKET_PATH);
    const response: Buffer[] = [];

    sock.on('data', (chunk: Buffer) => response.push(chunk));
    sock.on('connect', () => {
      sock.end(payload);
    });
    sock.on('end', () => {
      resolve(Buffer.concat(response).toString('utf8'));
    });
    sock.on('error', (err) => {
      console.warn(`[PicomCtl] socket write failed (${PICOM_SOCKET_PATH}):`, err.message);
      reject(err);
    });
  });
}

export function startPicomService() {
  function connectToBus() {
    const ws = new WebSocket(`${BUS_URL}/receivers`);

    ws.on('open', () => {
      console.log(`[PicomCtl] connected to receiver bus at ${BUS_URL}`);
    });

    let commandQueue = Promise.resolve();
    ws.on('message', (raw) => {
      commandQueue = commandQueue.then(async () => {
        try {
          const msg = JSON.parse(raw.toString());
          if (!isPicomShaderMessage(msg)) return;

          const commands: string[] = [];
          if (msg.parameters) {
            for (const [name, value] of Object.entries(msg.parameters)) {
              commands.push(`SET ${name} float ${value}`);
            }
          }

          commands.push(`${msg.op} ${msg.shader}`);
          const payload = `${commands.join('\n')}\n`;
          console.log(`[PicomCtl] -> ${payload.trim().replaceAll('\n', '; ')}`);
          const response = await sendToPicom(payload);
          if (response.includes('ERR')) {
            console.warn(`[PicomCtl] picom rejected command: ${response.trim()}`);
          }
        } catch (err) {
          console.warn('[PicomCtl] failed to send command to picom:', err);
        }
      });
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
}
