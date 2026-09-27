interface TokenRecord {
  accessToken: string;
  refreshToken: string;
  scope?: string[];
  expiresAt: number; // epoch ms
  displayName?: string;
  login?: string;
}

export interface Env {
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  CLIP_STORE_KEY: string;
  CLIP_TOKENS: KVNamespace;
}

const KEY_HEADER = 'x-clip-store-key';
const CLIP_SCOPE = 'clips:edit';

interface Config {
  clientId: string;
  clientSecret: string;
  storeKey: string;
  tokens: KVNamespace;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function loadConfig(env: Env): Config {
  return {
    clientId: required('TWITCH_CLIENT_ID', env.TWITCH_CLIENT_ID),
    clientSecret: required('TWITCH_CLIENT_SECRET', env.TWITCH_CLIENT_SECRET),
    storeKey: required('CLIP_STORE_KEY', env.CLIP_STORE_KEY),
    tokens: env.CLIP_TOKENS
  };
}

function isAuthed(request: Request, config: Config): boolean {
  const key = request.headers.get(KEY_HEADER);
  return !!key && key === config.storeKey;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

async function exchangeCode(
  config: Config,
  code: string,
  redirectUri: string
): Promise<TokenRecord | null> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    scope?: string[];
  };
  if (!data.access_token || !data.refresh_token) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: Array.isArray(data.scope) ? data.scope : [CLIP_SCOPE],
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000
  };
}

async function validateToken(token: string): Promise<{
  user_id: string;
  login: string;
  display_name: string;
} | null> {
  const res = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    user_id: string;
    login: string;
    display_name: string;
  }>;
}

async function refreshTwitchToken(config: Config, refreshToken: string): Promise<TokenRecord | null> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string[];
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    scope: data.scope,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000
  };
}

async function store(config: Config, userId: string, rec: TokenRecord): Promise<void> {
  await config.tokens.put(userId, JSON.stringify(rec));
}

async function read(config: Config, userId: string): Promise<TokenRecord | null> {
  const raw = await config.tokens.get(userId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenRecord;
  } catch {
    return null;
  }
}

async function getValidToken(config: Config, userId: string): Promise<TokenRecord | null> {
  const rec = await read(config, userId);
  if (!rec) return null;
  if (rec.accessToken && rec.expiresAt > Date.now() + 30_000) return rec;

  const refreshed = await refreshTwitchToken(config, rec.refreshToken);
  if (!refreshed) {
    await config.tokens.delete(userId);
    return null;
  }
  const updated: TokenRecord = {
    ...refreshed,
    scope: refreshed.scope ?? rec.scope,
    displayName: rec.displayName,
    login: rec.login
  };
  await store(config, userId, updated);
  return updated;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function htmlPage(title: string, body: string): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: sans-serif; max-width: 30rem; margin: 4rem auto; padding: 0 1rem; }
      h1 { font-size: 1.25rem; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${body}</p>
    <p><a href="/">clipstore</a></p>
  </body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

async function handleAuthCallback(request: Request, config: Config): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;

  const error = params.get('error');
  if (error) {
    return htmlPage(
      'Not linked',
      `Twitch refused the authorization${error ? ` (${escapeHtml(error)})` : ''}. You can close this tab and try again.`
    );
  }

  const code = params.get('code');
  if (!code) {
    return htmlPage('Not linked', 'Missing authorization code - go back and try the link again.');
  }

  const record = await exchangeCode(config, code, `${url.origin}/auth/callback`);
  if (!record) {
    return htmlPage('Not linked', 'Twitch rejected the authorization code. Please try again.');
  }

  const info = await validateToken(record.accessToken);
  if (!info) {
    return htmlPage('Not linked', 'Could not verify the token with Twitch. Please try again.');
  }

  const stored: TokenRecord = {
    ...record,
    displayName: info.display_name,
    login: info.login
  };
  await store(config, info.user_id, stored);

  return htmlPage(
    `Linked as ${escapeHtml(info.login ?? info.display_name)}!`,
    'You can close this tab and go back to Twitch chat - type <code>%clip</code> to make a clip.'
  );
}

const router = async (request: Request, env: Env): Promise<Response> => {
  const config = loadConfig(env);
  const url = new URL(request.url);
  const { pathname } = url;

  // GET /
  if (request.method === 'GET' && pathname === '/') {
    return Response.json({ ok: true, service: 'clipstore' });
  }

  // GET /auth
  if (request.method === 'GET' && pathname === '/auth') {
    const authorizeUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authorizeUrl.searchParams.set('client_id', config.clientId);
    authorizeUrl.searchParams.set('redirect_uri', `${url.origin}/auth/callback`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', CLIP_SCOPE);
    return Response.redirect(authorizeUrl.toString(), 302);
  }

  // GET /auth/callback
  if (request.method === 'GET' && pathname === '/auth/callback') {
    return handleAuthCallback(request, config);
  }

  if (!isAuthed(request, config)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  // POST /token
  if (request.method === 'POST' && pathname === '/token') {
    const body = await readJson(request);
    const userId = String(body.userId ?? '');
    const accessToken = String(body.accessToken ?? '');
    const refreshToken = String(body.refreshToken ?? '');
    if (!userId || !accessToken || !refreshToken) {
      return Response.json(
        { error: 'userId, accessToken and refreshToken are required' },
        { status: 400 }
      );
    }
    const rec: TokenRecord = {
      accessToken,
      refreshToken,
      scope: Array.isArray(body.scope) ? (body.scope as string[]) : undefined,
      expiresAt:
        typeof body.expiresIn === 'number'
          ? Date.now() + body.expiresIn * 1000
          : Date.now() + 3600 * 1000,
      displayName: body.displayName ? String(body.displayName) : undefined,
      login: body.login ? String(body.login) : undefined
    };
    await store(config, userId, rec);
    return Response.json({ ok: true, userId });
  }

  // GET /token/:userId
  const tokenMatch = pathname.match(/^\/token\/([^/]+)$/);
  if (request.method === 'GET' && tokenMatch) {
    const userId = decodeSegment(tokenMatch[1]);
    if (userId === null) return Response.json({ error: 'bad user id' }, { status: 400 });
    const rec = await getValidToken(config, userId);
    if (!rec) return Response.json({ error: 'no token for user' }, { status: 404 });
    return Response.json({
      ok: true,
      userId,
      accessToken: rec.accessToken,
      scope: rec.scope ?? []
    });
  }

  // DELETE /token/:userId (unlink)
  if (request.method === 'DELETE' && tokenMatch) {
    const userId = decodeSegment(tokenMatch[1]);
    if (userId === null) return Response.json({ error: 'bad user id' }, { status: 400 });
    await config.tokens.delete(userId);
    return Response.json({ ok: true, userId });
  }

  return Response.json({ error: 'not found' }, { status: 404 });
};

export default {
  fetch: (request: Request, env: Env): Promise<Response> | Response => router(request, env)
};
