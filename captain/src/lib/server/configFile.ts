import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

const CONFIG_PATH = join(process.cwd(), 'config.yml');
const FALLBACK_CHANNEL = 'vanorsigma';

let cache: { mtimeMs: number; channelName: string } | null = null;

export function readChannelName(): string {
  try {
    const mtimeMs = statSync(CONFIG_PATH).mtimeMs;
    if (cache?.mtimeMs === mtimeMs) return cache.channelName;

    const parsed = parse(readFileSync(CONFIG_PATH, 'utf-8')) as { channelName?: unknown } | null;
    const name = parsed?.channelName;
    const channelName = typeof name === 'string' && name.trim() ? name.trim() : FALLBACK_CHANNEL;
    cache = { mtimeMs, channelName };
    return channelName;
  } catch {
    return FALLBACK_CHANNEL;
  }
}
