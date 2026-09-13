const CLIP_ID_RE = /^[A-Za-z0-9_-]{3,120}$/;

export function isValidClipId(value: string): boolean {
  return CLIP_ID_RE.test(value);
}

export function parseTwitchClipId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (!trimmed.includes('/')) {
    return isValidClipId(trimmed) ? trimmed : null;
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  let slug: string | undefined;
  const clipIndex = segments.indexOf('clip');
  if (clipIndex >= 0 && segments[clipIndex + 1]) {
    slug = segments[clipIndex + 1];
  } else if (url.hostname === 'clips.twitch.tv' || url.hostname.endsWith('.clips.twitch.tv')) {
    slug = segments[0];
  }

  if (!slug) return null;
  return isValidClipId(slug) ? slug : null;
}
