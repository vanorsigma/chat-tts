const BITS_URL = '/bits';

export async function getBitBoost(username: string): Promise<number> {
  const response = await fetch(`${BITS_URL}?username=${encodeURIComponent(username)}`);
  if (response.status !== 200) return 0;
  return Number(await response.text());
}

export async function addBitBoost(username: string, amount: number): Promise<void> {
  const response = await fetch(
    `${BITS_URL}?username=${encodeURIComponent(username)}&amount=${amount}`,
    { method: 'POST' }
  );
  if (response.status !== 200) console.error(`could not add bit boost for ${username}`);
}

export async function flushBitBoosts(): Promise<void> {
  const response = await fetch(BITS_URL, { method: 'DELETE' });
  if (response.status !== 200) console.error('could not flush bit boosts');
}
