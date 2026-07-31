import { json, type RequestHandler } from '@sveltejs/kit';
import {
  createHolding,
  getHoldingById,
  getAllHoldingsForUser,
  getHoldingsForUserAndStock,
  deleteHoldingById,
  updateHoldingPoints,
  getMedianPointsForUsers,
  setPointsForUser,
  getPointsForUser
} from '$lib/server/db';
import type { BuyRequest, SellRequest, GrantRequest } from '$lib/api/stock-market';

function inverseSChance(invested: number, medianPoints: number, steepness: number): number {
  const mid = Math.max(medianPoints, 1);
  const t = invested / mid;
  return 1 / (1 + Math.exp(steepness * (t - 1)));
}

export const POST: RequestHandler = async ({ url, request }) => {
  const action = url.searchParams.get('action');

  if (action === 'median') {
    const { checkedInUsers } = (await request.json()) as { checkedInUsers?: string[] };
    const medianPoints = await getMedianPointsForUsers(checkedInUsers ?? []);
    return json({ ok: true, medianPoints });
  }

  if (action === 'buy') {
    const body = (await request.json()) as BuyRequest;
    const { username, stock, points, price, steepness, skipChance, checkedInUsers, check } = body;
    const overpay = body.overpay ?? 0;
    const overpayFactor = body.overpayFactor ?? 0.1;

    console.log(
      `[stock-market] buy: user=${username} stock=${stock} points=${points} price=${price} steepness=${steepness} overpay=${overpay} overpayFactor=${overpayFactor} skipChance=${skipChance ?? false}`
    );

    if (!username || !stock || !points || points <= 0 || !price || price <= 0 || overpay < 0) {
      console.log('[stock-market] buy: invalid request params');
      return json({ ok: false, error: 'invalid request' }, { status: 400 });
    }

    const totalCost = points + overpay;
    const balance = await getPointsForUser(username);
    if (balance < totalCost) {
      console.log(`[stock-market] buy: insufficient points (balance=${balance}, needed=${totalCost})`);
      return json({ ok: false, error: `Insufficient points (have ${balance}, need ${totalCost})` }, { status: 400 });
    }

    const existingHoldings = await getHoldingsForUserAndStock(username, stock);
    const existingTotal = existingHoldings.reduce((s, h) => s + h.invested_points, 0);
    const totalInvested = existingTotal + points - overpay * overpayFactor;

    const medianPoints = await getMedianPointsForUsers(checkedInUsers ?? []);
    const chance = inverseSChance(totalInvested, medianPoints, steepness);
    const failChance = 100 - Math.min(chance * 100, 100);

    if (!skipChance) {
      if (Math.random() >= chance) {
        console.log(
          `[stock-market] buy: S-curve fail chance=${failChance.toFixed(0)}% invested=${points} overpay=${overpay} totalInvested=${totalInvested} existing=${existingTotal} median=${medianPoints} steepness=${steepness}`
        );
        return json({
          ok: false,
          failChance: Math.round(failChance),
          invested: points,
          medianPoints
        });
      }

      console.log(
        `[stock-market] buy: S-curve passed chance=${(chance * 100).toFixed(0)}% invested=${points} overpay=${overpay} totalInvested=${totalInvested} existing=${existingTotal} median=${medianPoints}`
      );
    }

    !check ? await setPointsForUser(username, balance - totalCost) : null;
    const amend = existingHoldings.find((h) => Math.abs(h.buy_price - price) < 0.001);
    if (amend) {
      const newPoints = amend.invested_points + points;
      !check ? await updateHoldingPoints(amend.id, newPoints) : null;
      console.log(
        `[stock-market] buy: amended holding id=${amend.id} old=${amend.invested_points} new=${newPoints}`
      );
      return json({
        ok: true,
        failChance: Math.round(failChance),
        invested: points,
        price,
        holdingId: amend.id
      });
    }

    const holdingId = !check ? await createHolding(username, stock, points, price) : '';

    console.log(
      `[stock-market] buy: success user=${username} stock=${stock} invested=${points} price=${price} id=${holdingId}`
    );
    return json({ ok: true, failChance: Math.round(failChance), invested: points, price, holdingId });
  }

  if (action === 'sell') {
    const body = (await request.json()) as SellRequest;
    const { username, holdings } = body;

    console.log(`[stock-market] sell: user=${username} holdings=${holdings?.length ?? 0}`);

    if (!username || !holdings || holdings.length === 0) {
      console.log('[stock-market] sell: invalid request params');
      return json({ ok: false, error: 'invalid request' }, { status: 400 });
    }

    const balance = await getPointsForUser(username);
    let totalReturned = 0;
    const details: Array<{
      id: number;
      stock: string;
      invested: number;
      profit: number;
      returned: number;
      oldPrice: number;
      newPrice: number;
      remaining?: number;
    }> = [];

    for (const { id, price, amount } of holdings) {
      if (!price || price <= 0) {
        console.log(`[stock-market] sell: invalid price for holding id=${id}`);
        return json({ ok: false, error: `invalid price for holding ${id}` }, { status: 400 });
      }

      const holding = await getHoldingById(id);
      if (!holding) {
        console.log(`[stock-market] sell: holding not found id=${id}`);
        return json({ ok: false, error: `holding ${id} not found` }, { status: 400 });
      }

      if (holding.username !== username) {
        console.log(
          `[stock-market] sell: ownership mismatch id=${id} owner=${holding.username} requester=${username}`
        );
        return json(
          { ok: false, error: `holding ${id} does not belong to ${username}` },
          { status: 400 }
        );
      }

      const oldPrice = holding.buy_price;
      const sellAmount =
        amount !== undefined ? Math.min(amount, holding.invested_points) : holding.invested_points;
      const profit = ((price - oldPrice) / oldPrice) * sellAmount;
      const returned = sellAmount + profit;
      const remaining = holding.invested_points - sellAmount;

      totalReturned += Math.round(returned);
      details.push({
        id,
        stock: holding.stock,
        invested: sellAmount,
        profit: Math.round(profit),
        returned: Math.round(returned),
        oldPrice,
        newPrice: price,
        remaining: remaining > 0 ? remaining : undefined
      });

      if (remaining > 0) {
        await updateHoldingPoints(id, remaining);
        console.log(
          `[stock-market] sell: partial id=${id} stock=${holding.stock} sold=${sellAmount} remaining=${remaining} returned=${Math.round(returned)}`
        );
      } else {
        await deleteHoldingById(id);
        console.log(
          `[stock-market] sell: liquidated id=${id} stock=${holding.stock} invested=${holding.invested_points} returned=${Math.round(returned)}`
        );
      }
    }

    await setPointsForUser(username, balance + totalReturned);

    console.log(
      `[stock-market] sell: success user=${username} totalReturned=${totalReturned} lots=${details.length}`
    );
    return json({ ok: true, totalReturned, details });
  }

  if (action === 'grant') {
    const body = (await request.json()) as GrantRequest;
    const { username, stock, points, price } = body;

    console.log(
      `[stock-market] grant: user=${username} stock=${stock} points=${points} price=${price}`
    );

    if (!username || !stock || !points || points <= 0 || !price || price <= 0) {
      console.log('[stock-market] grant: invalid request params');
      return json({ ok: false, error: 'invalid request' }, { status: 400 });
    }

    const holdingId = await createHolding(username, stock, points, price);

    console.log(
      `[stock-market] grant: success user=${username} stock=${stock} invested=${points} buyPrice=${price} id=${holdingId}`
    );
    return json({ ok: true, holdingId, invested: points, buyPrice: price });
  }

  console.log(`[stock-market] unknown action: ${action}`);
  return json({ ok: false, error: 'unknown action' }, { status: 400 });
};

export const GET: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('username')?.trim() ?? '';
  if (!username) {
    return json({ holdings: [] });
  }

  console.log(`[stock-market] getHoldings: user=${username}`);

  const rows = await getAllHoldingsForUser(username);
  const holdings = rows.map((r) => ({
    id: r.id,
    stock: r.stock,
    investedPoints: r.invested_points,
    buyPrice: r.buy_price,
    createdAt: r.created_at,
    currentPrice: null,
    marketValue: null,
    profit: null
  }));

  console.log(`[stock-market] getHoldings: user=${username} count=${holdings.length}`);
  return json({ holdings });
};
