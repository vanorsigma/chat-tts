const SUBTIERS_URL = '/subtier';

export async function getSubTier(userId: string, channelId: string): Promise<number> {
  const response = await fetch(
    `${SUBTIERS_URL}?userId=${encodeURIComponent(userId)}&channelId=${encodeURIComponent(channelId)}`
  );
  if (response.status !== 200) return 0;
  return Number(await response.text());
}

export async function setSubTier(username: string, tier: number): Promise<void> {
  const response = await fetch(
    `${SUBTIERS_URL}?username=${encodeURIComponent(username)}&tier=${tier}`,
    { method: 'POST' }
  );
  if (response.status !== 200) console.error(`could not set sub tier for ${username}`);
}
