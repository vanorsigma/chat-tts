import { json } from '@sveltejs/kit';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import type { RequestHandler } from './$types';

const CONFIG_PATH = join(process.cwd(), 'config.yml');

export const GET: RequestHandler = async () => {
  if (!existsSync(CONFIG_PATH)) return json({ channelName: 'vanorsigma' });
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const config = parse(raw);
    return json({ channelName: config.channelName ?? 'vanorsigma' });
  } catch {
    return json({ channelName: 'vanorsigma' });
  }
};
