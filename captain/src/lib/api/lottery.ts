import { PUBLIC_LOTTERY_URL } from '$env/static/public';

export interface LotteryEntry {
  username: string;
  shares: number;
}

export async function getLottery(): Promise<{ entries: LotteryEntry[]; tax: number }> {
  const response = await fetch(PUBLIC_LOTTERY_URL);
  if (response.status !== 200) return { entries: [], tax: 0 };
  return (await response.json()) as { entries: LotteryEntry[]; tax: number };
}

export async function addLotteryEntry(username: string, shares: number): Promise<void> {
  const response = await fetch(
    `${PUBLIC_LOTTERY_URL}?action=add&username=${username}&shares=${shares}`,
    { method: 'POST' }
  );
  if (response.status !== 200) console.error(`could not add lottery entry for ${username}`);
}

export async function addLotteryTax(amount: number): Promise<void> {
  const response = await fetch(`${PUBLIC_LOTTERY_URL}?action=addtax&amount=${amount}`, {
    method: 'POST'
  });
  if (response.status !== 200) console.error(`could not add lottery tax of ${amount}`);
}

export async function clearLottery(): Promise<void> {
  const response = await fetch(`${PUBLIC_LOTTERY_URL}?action=clear`, { method: 'POST' });
  if (response.status !== 200) console.error('could not clear lottery');
}
