import { listFonts } from '$lib/server/db';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
  const fonts = await listFonts();
  return json(fonts.map((font) => font.fontname));
};
