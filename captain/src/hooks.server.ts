import { installConsoleHijack } from '$lib/server/logger';
import { initializeRuntime } from '$lib/server/runtime';
import { initDbIfRequired } from '$lib/server/db';
import { initializeTwitchPolls } from '$lib/server/twitchPolls';
import { initializeTwitchRedeems } from '$lib/server/twitchRedeems';

installConsoleHijack();
console.log('Server starting...');
initDbIfRequired().catch((e) => console.error('DB init failed:', e));
initializeRuntime();
initializeTwitchPolls().catch((e) => console.error('Failed to initialize twitch polls:', e));
initializeTwitchRedeems().catch((e) => console.error('Failed to initialize twitch redeems:', e));
