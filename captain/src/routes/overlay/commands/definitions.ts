import type { FieldSchema } from '$lib/config/schema';

export type GateMode = 'overlay' | 'ungated' | 'passthrough';

export interface CommandCooldown {
  /** Default cooldown in ms; derives one config field per command name (keyed by name without %) */
  default: number;
  /** Config UI label; defaults to the command name */
  label?: string;
}

export interface CommandChance {
  /** Default success chance %; config field keyed by names[0] without % */
  default: number;
}

export interface CommandDefinition {
  names: readonly string[];
  section?: FieldSchema;
  gateMode: GateMode;
  requiresArgs?: boolean;
  help?: string;
  /** Wrap dispatch in callOnlyIfPastCooldown (one independent cooldown per command name) */
  cooldown?: CommandCooldown;
  /** Give this command a per-command success chance in commandChancesConfig */
  chance?: CommandChance;
  /** The handler wraps itself in callOnlyIfPastCooldown (e.g. conditional bypass) */
  manualCooldown?: boolean;
  /** Requires the bus WebSocket; dispatch is skipped with a warning when absent */
  needsBus?: boolean;
}

export function defineCommand<const D extends CommandDefinition>(def: D): D {
  return def;
}

function section<const K extends string, const F extends readonly FieldSchema[]>(
  key: K,
  label: string,
  objectFields: F
) {
  return { key, kind: 'optional-object', label, commandSection: true, objectFields } as const;
}

function alwaysSection<const K extends string, const F extends readonly FieldSchema[]>(
  key: K,
  label: string,
  objectFields: F
) {
  return {
    key,
    kind: 'optional-object',
    label,
    commandSection: true,
    alwaysPresent: true,
    objectFields
  } as const;
}

function alwaysPresentSection<const K extends string, const F extends readonly FieldSchema[]>(
  key: K,
  label: string,
  objectFields: F
) {
  return { key, kind: 'optional-object', label, alwaysPresent: true, objectFields } as const;
}

const karmaConfigSection = alwaysSection('karmaConfig', 'Karma', [
  { key: 'min', kind: 'number', label: 'Minimum', default: -5000, step: 1 },
  { key: 'max', kind: 'number', label: 'Maximum', default: 5000, step: 1 },
  {
    key: 'dingThreshold',
    kind: 'number',
    label: 'Ding threshold',
    default: 250,
    min: 0,
    step: 1
  },
  {
    key: 'decayRate',
    kind: 'number',
    label: 'Decay rate',
    default: 0.01,
    min: 0,
    max: 1,
    step: 0.01
  },
  {
    key: 'karmaMap',
    kind: 'list-of-objects',
    label: 'Karma map',
    default: [
      { command: '%rotate', karma: -100 },
      { command: '%distract', karma: -200 }
    ],
    listObjectFields: [
      { key: 'command', kind: 'text', label: 'Command', placeholder: '%command' },
      { key: 'karma', kind: 'number', label: 'Karma', default: 0, step: 1 }
    ]
  },
  {
    key: 'togglesKarma',
    kind: 'list-of-objects',
    label: 'Toggles karma',
    default: [
      { name: 'Hearts', karma: 5.0 },
      { name: 'Stars', karma: 5.0 },
      { name: 'Undress', karma: 50.0 }
    ],
    listObjectFields: [
      { key: 'name', kind: 'text', label: 'Name', placeholder: 'Hearts' },
      { key: 'karma', kind: 'number', label: 'Required karma', default: 0, step: 1 }
    ]
  }
]);

const stockMarketConfigSection = alwaysSection('stockMarketConfig', 'Stock Market', [
  {
    key: 'cycleIntervalMs',
    kind: 'number',
    label: 'Cycle interval (ms)',
    default: 15000,
    min: 1000,
    step: 1000
  },
  {
    key: 'checkinGrantPoints',
    kind: 'number',
    label: 'Check-in grant VD',
    default: 1000,
    min: 0,
    step: 10
  },
  {
    key: 'cooldownMs',
    kind: 'number',
    label: 'Cooldown (ms)',
    default: 60000,
    min: 0,
    step: 100
  },
  {
    key: 'approvedStocks',
    kind: 'list-of-text',
    label: 'Approved stocks',
    default: ['HEART']
  },
  {
    key: 'buyFailSteepness',
    kind: 'number',
    label: 'Buy fail steepness',
    default: 8,
    min: 0,
    step: 0.1
  },
  {
    key: 'overpayFactor',
    kind: 'number',
    label: 'Overpay factor',
    default: 0.1,
    min: 0,
    step: 0.01
  }
]);

const economyConfigSection = section('economyConfig', 'Economy', [
  {
    key: 'cooldownMs',
    kind: 'number',
    label: 'Cooldown (ms)',
    default: 60000,
    min: 0,
    step: 100
  }
]);

const moderationConfigSection = alwaysSection('moderationConfig', 'Moderation', [
  {
    key: 'moderatorUsers',
    kind: 'list-of-text',
    label: 'Moderator users',
    placeholder: 'username',
    default: ['pastel8844', 'deplytha', 'asmodeus_desu']
  },
  {
    key: 'unblockableCommands',
    kind: 'list-of-text',
    label: 'Unblockable commands',
    placeholder: '%command',
    default: [
      '%restart',
      '%block',
      '%unblock',
      '%endstream',
      '%refreshVoice',
      '%rotate',
      '%distract'
    ]
  },
  {
    key: 'blockMinimumBid',
    kind: 'number',
    label: 'Block minimum bid',
    default: 1000,
    min: 0,
    step: 1
  },
  { key: 'killCost', kind: 'number', label: 'Kill cost', default: 2000, min: 0, step: 1 }
]);

export const COMMAND_DEFINITIONS = [
  defineCommand({
    names: ['%poll'],
    section: section('pollConfig', 'Poll', []),
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%poll <title>;<durationSec>;<option1>;[option2;[option3;[option4;[option5]]]]',
    cooldown: { default: 10000 }
  }),
  defineCommand({
    names: ['%endpoll'],
    section: section('pollConfig', 'Poll', []),
    gateMode: 'overlay'
  }),
  defineCommand({
    names: ['%prediction'],
    section: section('predictionConfig', 'Prediction', []),
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%prediction <title>;<durationSec>;<option1>;<option2>',
    cooldown: { default: 10000 }
  }),
  defineCommand({
    names: ['%endprediction'],
    section: section('predictionConfig', 'Prediction', []),
    gateMode: 'overlay'
  }),
  defineCommand({
    names: ['%chicken', '%checkin'],
    section: section('checkInConfig', 'Check In', [
      { key: 'points', kind: 'number', label: 'Points reward', default: 999.99, min: 0, step: 0.01 }
    ]),
    gateMode: 'overlay'
  }),
  defineCommand({
    names: ['%flashbang'],
    section: section('flashbangConfig', 'Flashbang', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 500, min: 0, step: 1 },
      { key: 'karma', kind: 'number', label: 'Karma', default: -100, step: 1 }
    ]),
    gateMode: 'overlay',
    chance: { default: 40 },
    cooldown: { default: 10000 }
  }),
  defineCommand({
    names: ['%blacksilence'],
    section: alwaysSection('blackSilenceConfig', 'Black Silence', [
      { key: 'user', kind: 'text', label: 'Free user', default: 'nikitakik228' },
      {
        key: 'durationMs',
        kind: 'number',
        label: 'Duration (ms)',
        default: 10000,
        min: 0,
        step: 100
      },
      { key: 'cost', kind: 'number', label: 'Cost', default: 500, min: 0, step: 1 },
      { key: 'karma', kind: 'number', label: 'Karma', default: 50, step: 1 }
    ]),
    gateMode: 'overlay',
    needsBus: true
  }),
  defineCommand({
    names: ['%points'],
    section: economyConfigSection,
    gateMode: 'overlay'
  }),
  defineCommand({
    names: ['%givepoints'],
    section: economyConfigSection,
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%givepoints <username> <amount>'
  }),
  defineCommand({
    names: ['%transfer'],
    section: economyConfigSection,
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%transfer <username> <amount>'
  }),
  defineCommand({
    names: ['%median'],
    section: economyConfigSection,
    gateMode: 'ungated',
    help: '%median'
  }),
  defineCommand({
    names: ['%maxwell'],
    section: alwaysSection('maxwellConfig', 'Maxwell', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 100, min: 0, step: 1 },
      { key: 'user', kind: 'text', label: 'Free user', default: '5kuli' },
      {
        key: 'cooldownMs',
        kind: 'number',
        label: 'Cooldown (ms)',
        default: 30000,
        min: 0,
        step: 100
      },
      { key: 'limit', kind: 'number', label: 'Max count', default: 100, min: 0, step: 1 }
    ]),
    gateMode: 'overlay'
  }),
  defineCommand({
    names: ['%mistake'],
    section: section('mistakeConfig', 'Mistake', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 5000, min: 0, step: 1 },
      { key: 'user', kind: 'text', label: 'Free user', default: 'mr_auto' },
      { key: 'karma', kind: 'number', label: 'Karma', default: -1000, step: 1 }
    ]),
    gateMode: 'overlay'
  }),
  defineCommand({
    names: ['%si', '%showimage'],
    section: alwaysSection('showImageConfig', 'Show Image', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 10000, min: 0, step: 1 },
      { key: 'user', kind: 'text', label: 'Free user', default: 'mayoigo_qwq' },
      {
        key: 'cooldownMs',
        kind: 'number',
        label: 'Cooldown (ms)',
        default: 60000,
        min: 0,
        step: 100
      },
      { key: 'karma', kind: 'number', label: 'Karma', default: -200, step: 1 }
    ]),
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%si <imageUrl>'
  }),
  defineCommand({
    names: ['%pa', '%playsound', '%playaudio'],
    section: section('playAudioConfig', 'Play Audio', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 10000, min: 0, step: 1 },
      { key: 'user', kind: 'text', label: 'Free user', default: 'SpookiestSpooks' },
      { key: 'karma', kind: 'number', label: 'Karma', default: -100, step: 1 }
    ]),
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%pa <audioUrl>'
  }),
  defineCommand({
    names: ['%buy'],
    section: stockMarketConfigSection,
    gateMode: 'ungated',
    requiresArgs: true,
    help: '%buy <symbol> <points> [overpay]'
  }),
  defineCommand({
    names: ['%sell'],
    section: stockMarketConfigSection,
    gateMode: 'ungated',
    requiresArgs: true,
    help: '%sell <symbol> <shares>'
  }),
  defineCommand({
    names: ['%stocks'],
    section: stockMarketConfigSection,
    gateMode: 'ungated'
  }),
  defineCommand({
    names: ['%gamba'],
    section: stockMarketConfigSection,
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%gamba <amount>'
  }),
  defineCommand({
    names: ['%lottery'],
    section: economyConfigSection,
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%lottery <amount> | %lottery payout | %lottery'
  }),
  defineCommand({
    names: ['%endstream'],
    section: section('endstreamConfig', 'End Stream', []),
    gateMode: 'overlay'
  }),
  defineCommand({
    names: ['%selfthought'],
    section: section('selfThoughtConfig', 'Self Thought', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 5000, min: 0, step: 1 },
      { key: 'karma', kind: 'number', label: 'Karma', default: -200, step: 1 }
    ]),
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%selfthought <message>',
    cooldown: { default: 10000 }
  }),
  defineCommand({
    names: ['%goodnightkiss'],
    section: section('goodNightKissConfig', 'Good Night Kiss', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 5000, min: 0, step: 1 },
      { key: 'user', kind: 'text', label: 'Free user', default: 'pastel8844' },
      { key: 'karma', kind: 'number', label: 'Karma', default: -300, step: 1 },
      {
        key: 'timeoutDurationSec',
        kind: 'number',
        label: 'Timeout duration (s)',
        default: 1800,
        min: 0,
        step: 1
      }
    ]),
    gateMode: 'overlay'
  }),
  defineCommand({
    names: ['%settitle'],
    section: section('setTitleConfig', 'Set Title', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 1000, min: 0, step: 1 },
      {
        key: 'karmaRequirement',
        kind: 'number',
        label: 'Karma requirement',
        default: 100,
        min: 0,
        step: 1
      },
      { key: 'karmaModifier', kind: 'number', label: 'Karma modifier', default: -0.3, step: 0.1 },
      { key: 'user', kind: 'text', label: 'Free user', default: 'sekatsu1' }
    ]),
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%settitle <newTitle>'
  }),
  defineCommand({
    names: ['%givekarma'],
    section: karmaConfigSection,
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%givekarma <amount>'
  }),
  defineCommand({
    names: ['%undress', '%stars', '%hearts'],
    section: karmaConfigSection,
    gateMode: 'overlay',
    cooldown: { default: 1000 }
  }),
  defineCommand({
    names: ['%restart'],
    section: section('restartConfig', 'Restart', []),
    gateMode: 'overlay'
  }),
  defineCommand({
    names: ['%bid', '%endbid'],
    section: section('bidConfig', 'Bid', []),
    gateMode: 'passthrough'
  }),
  defineCommand({
    names: ['%block'],
    section: moderationConfigSection,
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%block <%command>',
    cooldown: { default: 10000 }
  }),
  defineCommand({
    names: ['%unblock'],
    section: moderationConfigSection,
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%unblock <%command>',
    cooldown: { default: 10000 }
  }),
  defineCommand({
    names: ['%kill'],
    section: moderationConfigSection,
    gateMode: 'overlay',
    requiresArgs: true,
    help: '%kill <username>',
    cooldown: { default: 10000 }
  }),
  defineCommand({
    names: ['%rotate', '%distract'],
    section: section('distractConfig', 'Distract', [
      { key: 'enabled', kind: 'boolean', label: 'Enabled', default: false },
      {
        key: 'distractCooldown',
        kind: 'number',
        label: 'Distract cooldown (s)',
        default: 900,
        min: 0,
        step: 1
      },
      {
        key: 'rotateCooldown',
        kind: 'number',
        label: 'Rotate cooldown (s)',
        default: 300,
        min: 0,
        step: 1
      },
      {
        key: 'distractChance',
        kind: 'number',
        label: 'Distract chance',
        default: 0.001,
        min: 0,
        max: 1,
        step: 0.001
      },
      {
        key: 'rotateChance',
        kind: 'number',
        label: 'Rotate chance',
        default: 0.01,
        min: 0,
        max: 1,
        step: 0.001
      }
    ]),
    gateMode: 'passthrough'
  }),
  defineCommand({
    names: ['%refreshVoice'],
    section: section('voiceConfig', 'Voice', []),
    gateMode: 'passthrough'
  }),
  defineCommand({
    names: ['%grayscale'],
    section: section('grayscaleConfig', 'Grayscale', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 1000, min: 0, step: 1 },
      { key: 'karma', kind: 'number', label: 'Karma', default: -100, step: 1 },
      { key: 'shader', kind: 'text', label: 'Shader name', default: '00-grayscale' },
      {
        key: 'durationMs',
        kind: 'number',
        label: 'Duration (ms)',
        default: 120000,
        min: 0,
        step: 100
      }
    ]),
    gateMode: 'overlay',
    cooldown: { default: 10000 },
    chance: { default: 40 },
    needsBus: true
  }),
  defineCommand({
    names: ['%cut'],
    section: alwaysSection('cutConfig', 'Cut', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 1000, min: 0, step: 1 },
      { key: 'user', kind: 'text', label: 'VIP user', default: 'owobred' },
      { key: 'karma', kind: 'number', label: 'Karma', default: -100, step: 1 },
      { key: 'shader', kind: 'text', label: 'Shader name', default: '01-cut' },
      {
        key: 'durationMs',
        kind: 'number',
        label: 'Duration (ms)',
        default: 91962,
        min: 0,
        step: 100
      },
      {
        key: 'momentDelayMs',
        kind: 'number',
        label: 'Moment delay (ms)',
        default: 8150,
        min: 0,
        step: 10
      }
    ]),
    gateMode: 'overlay',
    manualCooldown: true,
    cooldown: { default: 60000 },
    chance: { default: 30 },
    needsBus: true
  }),
  defineCommand({
    names: ['%resetcooldown'],
    section: alwaysPresentSection('resetCooldownConfig', 'Reset Cooldown', [
      { key: 'cost', kind: 'number', label: 'Cost', default: 20000, min: 0, step: 1 }
    ]),
    gateMode: 'overlay',
    help: '%resetcooldown [username|all]'
  }),
  defineCommand({
    names: ['%important'],
    gateMode: 'ungated',
    requiresArgs: true,
    help: '%important <duration> (5m, 30s, 1h, 1m30s)'
  }),
  defineCommand({
    names: ['%unimportant'],
    gateMode: 'ungated',
    help: '%unimportant'
  }),
  defineCommand({
    names: ['%check'],
    gateMode: 'ungated',
    requiresArgs: true,
    help: '%check <%command> [args...]'
  })
] as const satisfies readonly CommandDefinition[];

export function definitionFor(command: string): CommandDefinition | undefined {
  return (COMMAND_DEFINITIONS as readonly CommandDefinition[]).find((def) =>
    def.names.includes(command)
  );
}

type GatedName<D extends CommandDefinition> = D extends { gateMode: 'passthrough' }
  ? never
  : D['names'][number];

export type GatedCommand = GatedName<(typeof COMMAND_DEFINITIONS)[number]>;

type _Expect<T extends true> = T;

// Cooldown/chance schema keys derive from command names; duplicate names would
// silently collide in the config schema. Fail the build if any two names match.
type _AllCommandNames<Ds extends readonly CommandDefinition[]> = Ds extends readonly [
  infer D extends CommandDefinition,
  ...infer Rest extends readonly CommandDefinition[]
]
  ? [...D['names'], ..._AllCommandNames<Rest>]
  : [];

type _AllUnique<
  T extends readonly string[],
  Seen extends readonly string[] = []
> = T extends readonly [infer H extends string, ...infer R extends string[]]
  ? H extends Seen[number]
    ? false
    : _AllUnique<R, readonly [...Seen, H]>
  : true;

type _UniqueCommandNames = _Expect<_AllUnique<_AllCommandNames<typeof COMMAND_DEFINITIONS>>>;

type NoPercent<N extends string> = N extends `%${infer R extends string}` ? R : N;

type CooldownFieldOf<N extends string> = N extends string
  ? {
      key: NoPercent<N>;
      kind: 'number';
      label: string;
      default: number;
      min: 0;
      step: 100;
    }
  : never;

function cooldownField<const N extends string, const C extends CommandCooldown>(
  name: N,
  cooldown: C
): CooldownFieldOf<NoPercent<N>> {
  return {
    key: name.slice(1) as NoPercent<N>,
    kind: 'number',
    label: cooldown.label ?? name,
    default: cooldown.default,
    min: 0,
    step: 100
  } as CooldownFieldOf<NoPercent<N>>;
}

const cooldownFields = COMMAND_DEFINITIONS.flatMap((def) =>
  'cooldown' in def ? def.names.map((name) => cooldownField(name, def.cooldown)) : []
);

export const COMMAND_COOLDOWNS_CONFIG = {
  key: 'commandCooldownsConfig',
  kind: 'optional-object',
  label: 'Command cooldowns (ms)',
  alwaysPresent: true,
  objectFields: cooldownFields
} as const satisfies FieldSchema;

type ChanceFieldOf<N extends string> = N extends string
  ? {
      key: NoPercent<N>;
      kind: 'number';
      label: string;
      default: number;
      min: 0;
      max: 100;
      step: 1;
    }
  : never;

function chanceField<const N extends string>(
  name: N,
  defaultChance: number
): ChanceFieldOf<NoPercent<N>> {
  return {
    key: name.slice(1) as NoPercent<N>,
    kind: 'number',
    label: name as string,
    default: defaultChance,
    min: 0,
    max: 100,
    step: 1
  } as ChanceFieldOf<NoPercent<N>>;
}

const chanceFields = COMMAND_DEFINITIONS.flatMap((def) =>
  'chance' in def ? [chanceField(def.names[0], def.chance.default)] : []
);

export const COMMAND_CHANCES_CONFIG = {
  key: 'commandChancesConfig',
  kind: 'optional-object',
  label: 'Command chances (%)',
  alwaysPresent: true,
  objectFields: [
    { key: 'default', kind: 'number', label: 'Default', default: 90, min: 0, max: 100, step: 1 },
    ...chanceFields
  ]
} as const satisfies FieldSchema;
