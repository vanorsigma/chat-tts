import { readFileSync, existsSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { json, text } from '@sveltejs/kit';
import { parse as parseYaml } from 'yaml';
import { stringify as stringifyYaml } from 'yaml';
import { ConfigParsingError, ParseableConfig } from '$lib/config';

const CONFIG_PATH = join(process.cwd(), 'config.yml');

export function GET() {
  if (!existsSync(CONFIG_PATH)) {
    return json(null);
  }

  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  try {
    const config = new ParseableConfig(parseYaml(raw));
    return json(config.toFullConfig());
  } catch (e) {
    if (e instanceof ConfigParsingError) {
      return json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
}

export async function POST({ request }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return text('Invalid JSON body', { status: 400 });
  }

  try {
    const config = new ParseableConfig(body);
    const full = config.toFullConfig();
    const yamlStr = stringifyYaml(full);

    const tmpPath = CONFIG_PATH + '.tmp';
    writeFileSync(tmpPath, yamlStr, 'utf-8');
    renameSync(tmpPath, CONFIG_PATH);

    return json({ ok: true });
  } catch (e) {
    if (e instanceof ConfigParsingError) {
      return json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
}
