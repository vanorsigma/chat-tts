import { readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { removeTempDir } from '$lib/server/tempFiles';
import { CLIP_DIR_PREFIX, downloadClip } from './twitchClip';

const IDLE_TTL_MS = 10 * 60 * 1000;
const MAX_CONCURRENT_DOWNLOADS = 2;

export interface ClipFile {
  dir: string;
  filePath: string;
  size: number;
  lastUsed: number;
}

const files = new Map<string, ClipFile>();
const downloads = new Map<string, Promise<ClipFile | null>>();
const downloadWaiters: Array<() => void> = [];
let activeDownloads = 0;

function sweepOrphanedDirs(): void {
  try {
    const dir = tmpdir();
    for (const name of readdirSync(dir)) {
      if (name.startsWith(CLIP_DIR_PREFIX)) removeTempDir(join(dir, name));
    }
  } catch (err) {
    console.warn('clipFiles: failed to sweep orphaned clip dirs', err);
  }
}

function sweepIdleFiles(now: number): void {
  for (const [id, file] of files) {
    if (now - file.lastUsed > IDLE_TTL_MS) {
      files.delete(id);
      removeTempDir(file.dir);
    }
  }
}

async function withDownloadSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
    await new Promise<void>((resolve) => downloadWaiters.push(resolve));
  }

  activeDownloads++;
  try {
    return await task();
  } finally {
    activeDownloads--;
    downloadWaiters.shift()?.();
  }
}

function startDownload(id: string): Promise<ClipFile | null> {
  const pending = withDownloadSlot(() => downloadClip(id))
    .then((downloaded) => {
      if (!downloaded) return null;
      const file: ClipFile = {
        dir: downloaded.dir,
        filePath: downloaded.filePath,
        size: statSync(downloaded.filePath).size,
        lastUsed: Date.now()
      };
      files.set(id, file);
      return file;
    })
    .catch((err) => {
      console.warn('clipFiles: failed to download clip', id, err);
      return null;
    });

  downloads.set(id, pending);
  void pending.finally(() => downloads.delete(id));
  return pending;
}

export async function acquireClipFile(id: string): Promise<ClipFile | null> {
  const now = Date.now();
  sweepIdleFiles(now);

  const cached = files.get(id);
  if (cached) {
    cached.lastUsed = now;
    return cached;
  }

  const file = await (downloads.get(id) ?? startDownload(id));
  if (file) file.lastUsed = Date.now();
  return file;
}

export function releaseClipFile(id: string): void {
  const file = files.get(id);
  if (!file) return;
  files.delete(id);
  removeTempDir(file.dir);
}

sweepOrphanedDirs();
