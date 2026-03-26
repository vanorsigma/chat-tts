/// Constants

export const MODERATOR_USERS = ['pastel8844', 'deplytha', 'asmodeus_desu'];

export const BLACK_SILENCE_USER = 'nikitakik228';
export const BLACK_SILENCE_DURATION = 10 * 1000;
export const BLACK_SILENCE_COST = 500;
export const BLACK_SILENCE_KARMA = 50;

export const FLASHBANG_COST = 500;
export const FLASHBANG_KARMA = -100;

export const MAXWELL_COST = 100;
export const MAXWELL_USER = '5kuli';
export const MAXWELL_COOLDOWN = 30 * 1000;
export const MAXWELL_LIMITS = 100;

export const MISTAKE_COST = 5000;
export const MISTAKE_USER = 'mr_auto';
export const MISTAKE_KARMA = -1000;

export const SHOW_IMAGE_COST = 10_000;
export const SHOW_IMAGE_USER = 'mayoigo_qwq';
export const SHOW_IMAGE_COOLDOWN = 60 * 1000;
export const SHOW_IMAGE_KARMA = -200;

export const PLAY_AUDIO_COST = 10_000;
export const PLAY_AUDIO_USER = 'SpookiestSpooks';
export const PLAY_AUDIO_KARMA = -100;

export const SELF_THOUGHT_COST = 5000;
export const SELF_THOUGHT_KARMA = -200;

export const GOOD_NIGHT_KISS_COST = 5000;
export const GOOD_NIGHT_KISS_USER = 'pastel8844';
export const GOOD_NIGHT_KISS_KARMA = -300;

export const BLOCK_MINIMUM_BID = 1000;

// NOTE: set title has special karma requirements
export const SET_TITLE_COST = 1000;
export const SET_TITLE_KARMA_REQUIREMENT = 100;
export const SET_TITLE_KARMA_MODIFIER = -0.3;
export const SET_TITLE_USER = 'sekatsu1';

export const CHECK_IN_POINTS = 999.99;

/// Karma mapping
export const MIN_KARMA = -5000;
export const MAX_KARMA = 5000;
export const DING_THRESHOLD = 250.0;
export const KARMA_DECAY_RATE = 0.01;

// Model Updates
export const BLUSH_HR_THRESHOLD = 80;
export const DESPAIR_HR_THRESHOLD = 50;

export const TOGGLES_KARMA = new Map([
  ['Hearts', 5.0],
  ['Stars', 5.0],
  ['Undress', 50.0],
]);

export const KARMA_MAP = new Map([
  ['%rotate', -100],
  ['%distract', -200]
]);
