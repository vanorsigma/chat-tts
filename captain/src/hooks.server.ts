import { installConsoleHijack } from '$lib/server/logger';
import { initializeRuntime } from '$lib/server/runtime';

installConsoleHijack();
console.log('Server starting...');
initializeRuntime();
