import { PUBLIC_POINTS_URL } from '$env/static/public';

export async function getPointsForUser(username: string): Promise<number | null> {
  const response = await fetch(`${PUBLIC_POINTS_URL}?username=${username}`);
  if (response.status !== 200) return null;

  return Number(await response.text());
}

export async function setPointsForUser(username: string, points: number): Promise<void> {
  const response = await fetch(`${PUBLIC_POINTS_URL}?username=${username}&points=${points}`, {
    method: 'POST'
  });
  if (response.status !== 200) console.error(`could not set points for ${username}`);
}
