import http from 'http';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const CLIENT_ID = process.env.PUBLIC_TWITCH_APP_ID;
const CLIENT_SECRET = process.env.TWITCH_APP_SECRET;
const PROD_MODE = false;

const ACCOUNT = process.argv[2] ?? 'broadcaster';

if (!CLIENT_ID) throw new Error('Missing PUBLIC_TWITCH_APP_ID in .env');
if (!CLIENT_SECRET) throw new Error('Missing TWITCH_APP_SECRET in .env');
if (ACCOUNT !== 'broadcaster' && ACCOUNT !== 'bot') {
  throw new Error(`Usage: bun run authflow.ts <broadcaster|bot>`);
}

const BROADCASTER_SCOPES = [
  'channel:read:subscriptions',
  'channel:manage:polls',
  'channel:read:polls',
  'channel:manage:predictions',
  'channel:read:predictions',
  'channel:read:redemptions',
  'channel:manage:redemptions'
];
const BOT_SCOPES = [
  'user:write:chat',
  'user:bot',
  'moderator:read:chatters',
  'moderator:manage:banned_users',
  'moderator:manage:chat_messages',
  'channel:read:subscriptions'
];
const SCOPES = ACCOUNT === 'broadcaster' ? BROADCASTER_SCOPES : BOT_SCOPES;
const TOKEN_FILE = join(process.cwd(), `tokens.${ACCOUNT}.json`);

export function getAuthUrl(client_id: string, redirect_uri: string): string {
  return `https://id.twitch.tv/oauth2/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=${SCOPES.join('+')}`;
}

export function getFollowUpUrl(
  client_id: string,
  client_secret: string,
  redirect_uri: string,
  code: string
): string {
  return `https://id.twitch.tv/oauth2/token?client_id=${client_id}&client_secret=${client_secret}&code=${code}&grant_type=authorization_code&redirect_uri=${redirect_uri}`;
}

export async function callback(
  url: string,
  response: http.ServerResponse<http.IncomingMessage>,
  callback_url: string
) {
  const queryParams = new URLSearchParams(url.split('?')[1]);
  const code = queryParams.get('code');
  if (!code) {
    console.error(`Cannot get code from url: ${url}`);
    throw new Error('Fatal error, cannot continue');
  }

  const result = await fetch(getFollowUpUrl(CLIENT_ID!, CLIENT_SECRET!, callback_url, code), {
    method: 'POST'
  });
  if (result.status !== 200)
    throw new Error(
      'Fatal error, cannot get access token and/or refresh token. Error: ' + (await result.text())
    );

  const data: {
    readonly access_token: string;
    readonly refresh_token: string;
    readonly scope: string;
    readonly expires_in: number;
  } = await result.json();

  const validateRes = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `Bearer ${data.access_token}` }
  });
  const validateData: { user_id: string; login: string } = await validateRes.json();

  const tokenData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: typeof data.scope === 'string' ? data.scope.split(' ') : SCOPES,
    expiresIn: data.expires_in,
    obtainmentTimestamp: Date.now(),
    userId: validateData.user_id
  };

  writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  console.log(`Tokens written to ${TOKEN_FILE}`);
  console.log(`Account: ${validateData.login} (${validateData.user_id})`);
  response.writeHead(200);
  response.write(`Authorised as ${ACCOUNT} (${validateData.login}). Token saved to ${TOKEN_FILE}`);
  response.end();

  process.exit(0);
}

export function main() {
  const port = PROD_MODE ? 4173 : 5173;
  const callback_url = `http://localhost:${port}/callback`;
  const server = http.createServer((req, res) => {
    console.log(`Auth flow request: ${req.url}`);
    if (req.url) {
      const paths = req.url.split('/');
      const afterRoot = paths[1];
      switch (afterRoot.split('?')[0]) {
        case 'callback':
          return callback(req.url, res, callback_url);
      }
    }
    res.writeHead(302, { Location: getAuthUrl(CLIENT_ID!, callback_url) });
    res.write('Redirecting you...');
    res.end();
  });

  server.listen(port, () => {
    console.log(`Auth flow for "${ACCOUNT}" starting on http://localhost:${port}/`);
    console.log(`Scopes: ${SCOPES.join(', ')}`);
  });
}

main();
