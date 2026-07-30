const UNIT_TO_SEC: Record<string, number> = { s: 1, m: 60, h: 3600 };

export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return n > 0 ? n : null;
  }
  const re = /(\d+)\s*([smh])/gi;
  let total = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    if (m.index !== idx) return null;
    idx = m.index + m[0].length;
    total += Number(m[1]) * (UNIT_TO_SEC[m[2].toLowerCase()] ?? 0);
  }
  if (idx !== trimmed.length) return null;
  return total > 0 ? total : null;
}

export function formatRemaining(totalMs: number): string {
  const s = Math.ceil(totalMs / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
