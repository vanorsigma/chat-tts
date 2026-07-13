const _overlayConfig = {
  moderation: {
    moderatorUsers: ['pastel8844', 'deplytha', 'asmodeus_desu'],
    unblockableCommands: [
      '%restart',
      '%block',
      '%unblock',
      '%closemarket',
      '%refreshVoice',
      '%rotate',
      '%distract'
    ],
    blockMinimumBid: 1000,
    killCost: 2000
  },
  blackSilence: { user: 'nikitakik228', durationMs: 10000, cost: 500, karma: 50 },
  flashbang: { cost: 500, karma: -100 },
  maxwell: { cost: 100, user: '5kuli', cooldownMs: 30000, limit: 100 },
  mistake: { cost: 5000, user: 'mr_auto', karma: -1000 },
  showImage: { cost: 10000, user: 'mayoigo_qwq', cooldownMs: 60000, karma: -200 },
  playAudio: { cost: 10000, user: 'SpookiestSpooks', karma: -100 },
  selfThought: { cost: 5000, karma: -200 },
  goodNightKiss: { cost: 5000, user: 'pastel8844', karma: -300, timeoutDurationSec: 1800 },
  setTitle: { cost: 1000, karmaRequirement: 100, karmaModifier: -0.3, user: 'sekatsu1' },
  checkIn: { points: 999.99 },
  karma: {
    min: -5000,
    max: 5000,
    dingThreshold: 250,
    decayRate: 0.01,
    map: new Map<string, number>([
      ['%rotate', -100],
      ['%distract', -200]
    ]),
    toggles: new Map<string, number>([
      ['Hearts', 5.0],
      ['Stars', 5.0],
      ['Undress', 50.0]
    ])
  },
  model: { initialHeartrate: 50, blushHrThreshold: 80, despairHrThreshold: 50 },
  captcha: { points: 500, karma: 100, durationMs: 30000 },
  commandCooldowns: {
    poll: 10000,
    flashbang: 10000,
    selfthought: 10000,
    undress: 1000,
    stars: 1000,
    hearts: 1000,
    block: 10000,
    unblock: 10000,
    kill: 10000
  }
};

export function getOverlayConfig() {
  return _overlayConfig;
}

interface ApiKarmaEntry {
  command: string;
  karma: number;
}
interface ApiToggleEntry {
  name: string;
  karma: number;
}

export function applyOverlayConfig(raw?: Record<string, unknown>): void {
  if (!raw) return;

  const sectionMap: Record<string, keyof typeof _overlayConfig> = {
    moderationConfig: 'moderation',
    blackSilenceConfig: 'blackSilence',
    flashbangConfig: 'flashbang',
    maxwellConfig: 'maxwell',
    mistakeConfig: 'mistake',
    showImageConfig: 'showImage',
    playAudioConfig: 'playAudio',
    selfThoughtConfig: 'selfThought',
    goodNightKissConfig: 'goodNightKiss',
    setTitleConfig: 'setTitle',
    checkInConfig: 'checkIn',
    karmaConfig: 'karma',
    modelConfig: 'model',
    captchaConfig: 'captcha',
    commandCooldownsConfig: 'commandCooldowns'
  };

  for (const [apiKey, internalKey] of Object.entries(sectionMap)) {
    const section = raw[apiKey] as Record<string, unknown> | undefined;
    if (section) {
      Object.assign(_overlayConfig[internalKey] as Record<string, unknown>, section);
    }
  }

  const karmaRaw = raw.karmaConfig as Record<string, unknown> | undefined;
  if (karmaRaw?.karmaMap) {
    _overlayConfig.karma.map = new Map(
      (karmaRaw.karmaMap as ApiKarmaEntry[]).map((e) => [e.command, e.karma])
    );
  }
  if (karmaRaw?.togglesKarma) {
    _overlayConfig.karma.toggles = new Map(
      (karmaRaw.togglesKarma as ApiToggleEntry[]).map((e) => [e.name, e.karma])
    );
  }
}
