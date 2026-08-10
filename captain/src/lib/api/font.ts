export interface UserFont {
  fontname: string;
  filename: string;
  url: string;
}

export async function getUserFont(username: string): Promise<UserFont | null> {
  const response = await fetch(`/api/font?user=${encodeURIComponent(username)}`);
  if (response.status !== 200) return null;

  const data = (await response.json()) as UserFont | { default: true };
  if ('default' in data) return null;
  return data;
}

export async function listFontNames(): Promise<string[]> {
  const response = await fetch('/api/fonts');
  if (response.status !== 200) return [];

  return (await response.json()) as string[];
}

export async function setUserFont(username: string, fontname: string): Promise<boolean> {
  const response = await fetch(
    `/api/font?user=${encodeURIComponent(username)}&fontname=${encodeURIComponent(fontname)}`,
    { method: 'POST' }
  );
  return response.status === 200;
}

export async function clearUserFont(username: string): Promise<boolean> {
  const response = await fetch(`/api/font?user=${encodeURIComponent(username)}&reset=1`, {
    method: 'POST'
  });
  return response.status === 200;
}
