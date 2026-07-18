import { StaticAuthProvider, RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { PUBLIC_TWITCH_APP_ID } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  scope?: string[];
  expiresIn?: number;
  obtainmentTimestamp?: number;
  userId?: string;
}

const TOKEN_FILES: Record<string, string> = {
  broadcaster: join(process.cwd(), 'tokens.broadcaster.json'),
  bot: join(process.cwd(), 'tokens.bot.json')
};

const _tokenCache: Record<string, TokenData | null> = {};

function loadTokenData(name: 'broadcaster' | 'bot'): TokenData | null {
  const cached = _tokenCache[name];
  if (cached) return cached;

  const filePath = TOKEN_FILES[name];
  if (!existsSync(filePath)) {
    console.warn(
      `No ${name} tokens found at tokens.${name}.json. ` +
        `Run \`bun run authflow.ts ${name}\` to generate them.`
    );
    return null;
  }

  try {
    const data: TokenData = JSON.parse(readFileSync(filePath, 'utf-8'));
    _tokenCache[name] = data;
    return data;
  } catch (e) {
    console.warn(`Failed to parse ${name} token file:`, e);
    return null;
  }
}

function buildProvider(
  name: 'broadcaster' | 'bot'
): { provider: StaticAuthProvider | RefreshingAuthProvider; userId: string } | null {
  const tokenData = loadTokenData(name);
  if (!tokenData) return null;

  const clientId = PUBLIC_TWITCH_APP_ID;
  if (!clientId) return null;

  const userId = tokenData.userId ?? name;

  if (tokenData.refreshToken) {
    const clientSecret = env.TWITCH_APP_SECRET;
    if (!clientSecret) {
      console.warn(`TWITCH_APP_SECRET not set — falling back to static auth for ${name}.`);
    } else {
      const provider = new RefreshingAuthProvider({ clientId, clientSecret });

      provider.onRefresh((_userId, token) => {
        const filePath = TOKEN_FILES[name];
        try {
          const updated: TokenData = {
            accessToken: token.accessToken,
            refreshToken: token.refreshToken ?? undefined,
            scope: token.scope,
            expiresIn: token.expiresIn ?? undefined,
            obtainmentTimestamp: token.obtainmentTimestamp,
            userId: _userId
          };
          writeFileSync(filePath, JSON.stringify(updated, null, 2));
          _tokenCache[name] = updated;
        } catch (e) {
          console.error(`Failed to save refreshed ${name} tokens:`, e);
        }
      });

      provider.addUser(
        userId,
        {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken ?? null,
          scope: tokenData.scope ?? [],
          expiresIn: tokenData.expiresIn ?? null,
          obtainmentTimestamp: tokenData.obtainmentTimestamp ?? Date.now()
        },
        tokenData.scope
      );

      return { provider, userId };
    }
  }

  console.warn(`tokens.${name}.json lacks refreshToken — using static auth (no auto-refresh).`);
  const provider = new StaticAuthProvider(clientId, tokenData.accessToken, tokenData.scope);
  return { provider, userId };
}

export function loadBotTokenData(): TokenData | null {
  return loadTokenData('bot');
}

export function loadBroadcasterTokenData(): TokenData | null {
  return loadTokenData('broadcaster');
}

export function getBroadcasterApi(): { api: ApiClient; userId: string } | null {
  const built = buildProvider('broadcaster');
  if (!built) return null;
  return { api: new ApiClient({ authProvider: built.provider }), userId: built.userId };
}

export function getBotApi(): { api: ApiClient; userId: string } | null {
  const built = buildProvider('bot');
  if (!built) return null;
  return { api: new ApiClient({ authProvider: built.provider }), userId: built.userId };
}
