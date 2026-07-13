import { installConsoleHijack } from '$lib/server/logger';
import { initializeRuntime } from '$lib/server/runtime';

installConsoleHijack();
initializeRuntime();
