/**
 * Quick offline auth flow to get the access token and refresh tokens.
 * Put the result into .env.
 */

import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.PUBLIC_TWITCH_APP_ID;
const CLIENT_SECRET = process.env.PUBLIC_TWITCH_APP_SECRET;
const PROD_MODE = false; // set this to true to prime the server

if (!CLIENT_ID) throw new Error('Need to set PUBLIC_TWITCH_APP_ID in .venv');
if (!CLIENT_SECRET) throw new Error('Need to set PUBLIC_TWITCH_APP_SECRET in .env');

export function getAuthUrl(client_id: string, redirect_uri: string): string {
  return `https://id.twitch.tv/oauth2/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=moderator:read:chatters+user:bot+user:read:chat+moderator:manage:banned_users+user:write:chat+user:read:chat`;
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
      'Fatal error, cannot get acceess token and/or refresh token to continue. Error: ' +
        (await result.text())
    );

  const data: {
    readonly access_token: string;
    readonly refresh_token: string;
  } = await result.json();

  response.writeHead(200, {
    'Set-Cookie': [`access_token=${data.access_token}`, `refresh_token=${data.refresh_token};`]
  });
  response.write('Authorised, u can now close this tab');
  response.end();

  process.exit(0);
}

export function main() {
  const port = PROD_MODE ? 4173 : 5173;
  const callback_url = `http://localhost:${port}/callback`;
  const server = http.createServer((req, res) => {
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

  // Make the server listen on the specified port
  server.listen(port, () => {
    console.log(`Callback server running on http://localhost:${port}/`);
  });
}

main();
