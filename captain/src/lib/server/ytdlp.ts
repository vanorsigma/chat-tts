import { constants } from 'fs';
import { access } from 'fs/promises';
import { delimiter, join } from 'path';
import { YtDlp } from 'ytdlp-nodejs';

let instance: YtDlp | null = null;

async function findYtdlpBinary(): Promise<string> {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const candidates = await Promise.all(
    dirs.map(async (dir) => {
      const candidate = join(dir, 'yt-dlp');
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        return null;
      }
    })
  );

  const binaryPath = candidates.find((candidate): candidate is string => candidate !== null);
  if (!binaryPath) throw new Error('yt-dlp not found in PATH');
  return binaryPath;
}

export async function getYtdlp(): Promise<YtDlp> {
  if (!instance) {
    const binaryPath = await findYtdlpBinary();
    console.log('ytdlp: using binary', binaryPath);
    instance = new YtDlp({ binaryPath });
  }
  return instance;
}
