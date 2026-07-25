const BASE = '/api/stock-market';

export interface BuyRequest {
  username: string;
  stock: string;
  points: number;
  price: number;
  steepness: number;
  overpay?: number;
  overpayFactor?: number;
  skipChance?: boolean;
  checkedInUsers?: string[];
}

export interface BuyResponse {
  ok: boolean;
  error?: string;
  invested?: number;
  price?: number;
  holdingId?: number;
  failChance?: number;
  medianPoints?: number;
}

export async function apiBuy(req: BuyRequest): Promise<BuyResponse> {
  const response = await fetch(`${BASE}?action=buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  return (await response.json()) as BuyResponse;
}

export interface SellHoldingInput {
  id: number;
  price: number;
  amount?: number;
}

export interface SellRequest {
  username: string;
  holdings: SellHoldingInput[];
}

export interface SellDetail {
  id: number;
  stock: string;
  invested: number;
  profit: number;
  returned: number;
  oldPrice: number;
  newPrice: number;
  remaining?: number;
}

export interface SellResponse {
  ok: boolean;
  error?: string;
  totalReturned?: number;
  details?: SellDetail[];
}

export async function apiSell(req: SellRequest): Promise<SellResponse> {
  const response = await fetch(`${BASE}?action=sell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  return (await response.json()) as SellResponse;
}

export interface GrantRequest {
  username: string;
  stock: string;
  points: number;
  price: number;
}

export interface GrantResponse {
  ok: boolean;
  error?: string;
  holdingId?: number;
  invested?: number;
  buyPrice?: number;
}

export async function apiGrantPoints(req: GrantRequest): Promise<GrantResponse> {
  const response = await fetch(`${BASE}?action=grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  return (await response.json()) as GrantResponse;
}

export interface HoldingInfo {
  id: number;
  stock: string;
  investedPoints: number;
  buyPrice: number;
  createdAt: string;
  currentPrice: number | null;
  marketValue: number | null;
  profit: number | null;
}

export interface HoldingsResponse {
  holdings: HoldingInfo[];
}

export async function apiGetHoldings(username: string): Promise<HoldingsResponse> {
  const response = await fetch(`${BASE}?username=${encodeURIComponent(username)}`);
  return (await response.json()) as HoldingsResponse;
}
