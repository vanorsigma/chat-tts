import { getBotApi, loadBotTokenData } from './twitchAuth';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function msUntilExpiry(): number | null {
  const data = loadBotTokenData();
  if (!data || !data.expiresIn || !data.obtainmentTimestamp) return null;

  const expiresAt = data.obtainmentTimestamp + data.expiresIn * 1000;
  return Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, 60_000);
}

function scheduleNextRefresh() {
  const delay = msUntilExpiry();
  if (delay === null) {
    console.warn(
      '[TokenRefresher] Cannot determine bot token expiry — no proactive refresh possible.'
    );
    return;
  }

  console.log(
    `[TokenRefresher] Scheduling bot token refresh in ${Math.round(delay / 1000)}s (${Math.round(delay / 60000)}min)`
  );

  setTimeout(() => {
    console.log('[TokenRefresher] Refreshing bot token...');
    refreshBotToken().catch((e) =>
      console.error('[TokenRefresher] Failed to refresh bot token:', e)
    );
  }, delay);
}

async function refreshBotToken() {
  const api = getBotApi();
  if (!api) {
    console.warn('[TokenRefresher] Unable to build bot API client — skipping refresh');
    return;
  }

  await api.api.users.getUserById(api.userId);

  scheduleNextRefresh();
}

export function startBotTokenRefresher() {
  const data = loadBotTokenData();
  if (!data || !data.refreshToken) {
    console.warn(
      '[TokenRefresher] No bot token or refresh token available. ' +
        'Run `bun run authflow.ts bot` to generate one. ' +
        'Proactive refresh is disabled.'
    );
    return;
  }

  const delay = msUntilExpiry();
  if (delay === null) {
    console.warn(
      '[TokenRefresher] Cannot determine bot token expiry — no proactive refresh possible.'
    );
    return;
  }

  console.log(
    `[TokenRefresher] Bot token expiry in ${Math.round(delay / 1000)}s, starting scheduler`
  );

  setTimeout(() => {
    console.log('[TokenRefresher] Refreshing bot token...');
    refreshBotToken().catch((e) =>
      console.error('[TokenRefresher] Failed to refresh bot token:', e)
    );
  }, delay);
}
