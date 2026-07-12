import { listSongs } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function GET() {
  return json((await listSongs()).map(entry => entry.shortname));
}
