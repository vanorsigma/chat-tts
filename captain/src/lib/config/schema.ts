export interface FieldSchema {
  key: string;
  kind:
    | 'text'
    | 'number'
    | 'boolean'
    | 'list-of-text'
    | 'list-of-objects'
    | 'object'
    | 'optional-object';
  label: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
  required?: boolean;
  listObjectFields?: FieldSchema[];
  objectFields?: FieldSchema[];
}

export const configSchema: FieldSchema[] = [
  {
    key: 'channelName',
    kind: 'text',
    label: 'Channel name',
    placeholder: 'twitch channel name',
    required: true
  },
  {
    key: 'ignorePrefix',
    kind: 'text',
    label: 'Ignore prefix',
    default: '~',
    placeholder: '~'
  },
  {
    key: 'commandsDisabled',
    kind: 'boolean',
    label: 'Commands disabled',
    default: false
  },
  {
    key: 'voices',
    kind: 'list-of-text',
    label: 'Voices',
    placeholder: 'voice name'
  },
  {
    key: 'pitchRange',
    kind: 'object',
    label: 'Pitch range',
    objectFields: [
      {
        key: 'minimum',
        kind: 'number',
        label: 'Minimum',
        default: 0.95,
        min: 0,
        max: 3,
        step: 0.01
      },
      { key: 'maximum', kind: 'number', label: 'Maximum', default: 1.3, min: 0, max: 3, step: 0.01 }
    ]
  },
  {
    key: 'rateRange',
    kind: 'object',
    label: 'Rate range',
    objectFields: [
      { key: 'minimum', kind: 'number', label: 'Minimum', default: 0.7, min: 0, max: 5, step: 0.1 },
      { key: 'maximum', kind: 'number', label: 'Maximum', default: 2.0, min: 0, max: 5, step: 0.1 }
    ]
  },
  {
    key: 'filteredExps',
    kind: 'list-of-text',
    label: 'Filtered expressions',
    placeholder: 'regex pattern'
  },
  {
    key: 'soundEffects',
    kind: 'list-of-objects',
    label: 'Sound effects',
    listObjectFields: [
      { key: 'tag', kind: 'text', label: 'Tag', placeholder: '(metalpipes)' },
      { key: 'filePath', kind: 'text', label: 'File URL', placeholder: 'https://...' }
    ]
  },
  {
    key: 'remoteVoiceConfig',
    kind: 'optional-object',
    label: 'Remote Voice Config',
    required: true,
    objectFields: [
      {
        key: 'controlURL',
        kind: 'text',
        label: 'Control URL',
        placeholder: 'http://localhost:3123',
        required: true
      }
    ]
  },
  {
    key: 'standaloneSongConfig',
    kind: 'optional-object',
    label: 'Standalone Song Config',
    required: true,
    objectFields: []
  },
  {
    key: 'distractConfig',
    kind: 'optional-object',
    label: 'Distract Config',
    objectFields: [
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
    ]
  },
  {
    key: 'alternativePitchControl',
    kind: 'optional-object',
    label: 'Alternative Pitch Control',
    objectFields: [
      { key: 'controlURLs', kind: 'list-of-text', label: 'Control URLs', placeholder: 'http://...' }
    ]
  },
  {
    key: 'remoteChatTTS',
    kind: 'optional-object',
    label: 'Remote Chat TTS',
    objectFields: []
  },
  {
    key: 'moderationConfig',
    kind: 'optional-object',
    label: 'Moderation',
    objectFields: [
      {
        key: 'moderatorUsers',
        kind: 'list-of-text',
        label: 'Moderator users',
        placeholder: 'username'
      },
      {
        key: 'unblockableCommands',
        kind: 'list-of-text',
        label: 'Unblockable commands',
        placeholder: '%command'
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
    ]
  },
  {
    key: 'blackSilenceConfig',
    kind: 'optional-object',
    label: 'Black Silence',
    objectFields: [
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
    ]
  },
  {
    key: 'flashbangConfig',
    kind: 'optional-object',
    label: 'Flashbang',
    objectFields: [
      { key: 'cost', kind: 'number', label: 'Cost', default: 500, min: 0, step: 1 },
      { key: 'karma', kind: 'number', label: 'Karma', default: -100, step: 1 }
    ]
  },
  {
    key: 'maxwellConfig',
    kind: 'optional-object',
    label: 'Maxwell',
    objectFields: [
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
    ]
  },
  {
    key: 'mistakeConfig',
    kind: 'optional-object',
    label: 'Mistake',
    objectFields: [
      { key: 'cost', kind: 'number', label: 'Cost', default: 5000, min: 0, step: 1 },
      { key: 'user', kind: 'text', label: 'Free user', default: 'mr_auto' },
      { key: 'karma', kind: 'number', label: 'Karma', default: -1000, step: 1 }
    ]
  },
  {
    key: 'showImageConfig',
    kind: 'optional-object',
    label: 'Show Image',
    objectFields: [
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
    ]
  },
  {
    key: 'playAudioConfig',
    kind: 'optional-object',
    label: 'Play Audio',
    objectFields: [
      { key: 'cost', kind: 'number', label: 'Cost', default: 10000, min: 0, step: 1 },
      { key: 'user', kind: 'text', label: 'Free user', default: 'SpookiestSpooks' },
      { key: 'karma', kind: 'number', label: 'Karma', default: -100, step: 1 }
    ]
  },
  {
    key: 'selfThoughtConfig',
    kind: 'optional-object',
    label: 'Self Thought',
    objectFields: [
      { key: 'cost', kind: 'number', label: 'Cost', default: 5000, min: 0, step: 1 },
      { key: 'karma', kind: 'number', label: 'Karma', default: -200, step: 1 }
    ]
  },
  {
    key: 'goodNightKissConfig',
    kind: 'optional-object',
    label: 'Good Night Kiss',
    objectFields: [
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
    ]
  },
  {
    key: 'setTitleConfig',
    kind: 'optional-object',
    label: 'Set Title',
    objectFields: [
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
    ]
  },
  {
    key: 'karmaConfig',
    kind: 'optional-object',
    label: 'Karma',
    objectFields: [
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
        listObjectFields: [
          { key: 'command', kind: 'text', label: 'Command', placeholder: '%command' },
          { key: 'karma', kind: 'number', label: 'Karma', default: 0, step: 1 }
        ]
      },
      {
        key: 'togglesKarma',
        kind: 'list-of-objects',
        label: 'Toggles karma',
        listObjectFields: [
          { key: 'name', kind: 'text', label: 'Name', placeholder: 'Hearts' },
          { key: 'karma', kind: 'number', label: 'Required karma', default: 0, step: 1 }
        ]
      }
    ]
  },
  {
    key: 'modelConfig',
    kind: 'optional-object',
    label: 'Model',
    objectFields: [
      {
        key: 'initialHeartrate',
        kind: 'number',
        label: 'Initial heartrate',
        default: 50,
        min: 0,
        step: 1
      },
      {
        key: 'blushHrThreshold',
        kind: 'number',
        label: 'Blush HR threshold',
        default: 80,
        min: 0,
        step: 1
      },
      {
        key: 'despairHrThreshold',
        kind: 'number',
        label: 'Despair HR threshold',
        default: 50,
        min: 0,
        step: 1
      }
    ]
  },
  {
    key: 'captchaConfig',
    kind: 'optional-object',
    label: 'Captcha',
    objectFields: [
      { key: 'points', kind: 'number', label: 'Points reward', default: 500, min: 0, step: 1 },
      { key: 'karma', kind: 'number', label: 'Karma', default: 100, step: 1 },
      {
        key: 'durationMs',
        kind: 'number',
        label: 'Duration (ms)',
        default: 30000,
        min: 0,
        step: 100
      }
    ]
  },
  {
    key: 'checkInConfig',
    kind: 'optional-object',
    label: 'Check In',
    objectFields: [
      { key: 'points', kind: 'number', label: 'Points reward', default: 999.99, min: 0, step: 0.01 }
    ]
  },
  {
    key: 'commandCooldownsConfig',
    kind: 'optional-object',
    label: 'Command cooldowns (ms)',
    objectFields: [
      { key: 'poll', kind: 'number', label: '%poll', default: 10000, min: 0, step: 100 },
      { key: 'flashbang', kind: 'number', label: '%flashbang', default: 10000, min: 0, step: 100 },
      {
        key: 'selfthought',
        kind: 'number',
        label: '%selfthought',
        default: 10000,
        min: 0,
        step: 100
      },
      { key: 'undress', kind: 'number', label: '%undress', default: 1000, min: 0, step: 100 },
      { key: 'stars', kind: 'number', label: '%stars', default: 1000, min: 0, step: 100 },
      { key: 'hearts', kind: 'number', label: '%hearts', default: 1000, min: 0, step: 100 },
      { key: 'block', kind: 'number', label: '%block', default: 10000, min: 0, step: 100 },
      { key: 'unblock', kind: 'number', label: '%unblock', default: 10000, min: 0, step: 100 },
      { key: 'kill', kind: 'number', label: '%kill', default: 10000, min: 0, step: 100 }
    ]
  }
];
