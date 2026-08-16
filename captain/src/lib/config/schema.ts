import {
  COMMAND_COOLDOWNS_CONFIG,
  COMMAND_CHANCES_CONFIG,
  COMMAND_DEFINITIONS
} from '../../routes/overlay/commands/definitions';

export interface Preset {
  label: string;
  values: Record<string, unknown>;
}

export interface WidgetGroupDef {
  id: string;
  label: string;
  prefix: string;
  /** Whether X/Y refer to the widget's center (e.g. wheel) or top-left corner */
  origin: 'topLeft' | 'center';
}

export interface FieldSchema {
  key: string;
  kind:
    | 'text'
    | 'secret'
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
  dependsOn?: string;
  listObjectFields?: readonly FieldSchema[];
  objectFields?: readonly FieldSchema[];
  presets?: Preset[];
  /** Widget groups for the position editor; only used by overlayPositionsConfig */
  widgetGroups?: readonly WidgetGroupDef[];
  /** Command-backed section: gated on/off by the overlay based on its presence in config */
  commandSection?: boolean;
  /** Always materialized in FullConfig even when absent from the raw config */
  alwaysPresent?: boolean;
}

const commandSections = [
  ...new Map(
    COMMAND_DEFINITIONS.flatMap((def) =>
      'section' in def && def.section ? [[def.section.key, def.section]] : []
    )
  ).values()
];

export const configSchema = [
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
    key: 'makiConfig',
    kind: 'optional-object',
    label: 'Maki',
    required: true,
    alwaysPresent: true,
    objectFields: [
      {
        key: 'twitchClientId',
        kind: 'secret',
        label: 'Twitch Client ID',
        placeholder: 'your twitch app client id'
      },
      {
        key: 'twitchClientSecret',
        kind: 'secret',
        label: 'Twitch Client Secret',
        placeholder: 'your twitch app secret'
      },
      { key: 'broadcasterName', kind: 'text', label: 'Broadcaster Name', default: 'vanorsigma' },
      {
        key: 'openrouterApiKey',
        kind: 'secret',
        label: 'OpenRouter API Key',
        placeholder: 'sk-or-v1-...'
      },
      {
        key: 'makiModel',
        kind: 'text',
        label: 'Maki Model',
        default: 'google/gemini-2.5-flash-lite'
      },
      {
        key: 'evaluatorModel',
        kind: 'text',
        label: 'Evaluator Model',
        default: 'qwen/qwen3-coder-30b-a3b-instruct'
      },
      {
        key: 'deepReasoningModel',
        kind: 'text',
        label: 'Deep Reasoning Model',
        default: 'google/gemini-3.6-flash'
      },
      {
        key: 'deepReasoningMaxTokens',
        kind: 'number',
        label: 'Deep Reasoning Max Tokens',
        default: 4096,
        min: 1,
        step: 1
      },
      { key: 'maxTokens', kind: 'number', label: 'Max Tokens', default: 1024, min: 1, step: 1 },
      {
        key: 'communicationBusUrl',
        kind: 'text',
        label: 'Communication Bus URL',
        default: 'ws://localhost:3001/senders'
      },
      {
        key: 'screenshotDisplay',
        kind: 'number',
        label: 'Screenshot Display',
        default: 1,
        min: 0,
        step: 1
      },
      {
        key: 'textSpeed',
        kind: 'number',
        label: 'Text Speed (chars/sec)',
        default: 30,
        min: 1,
        step: 1
      }
    ]
  },
  {
    key: 'commandsDisabled',
    kind: 'boolean',
    label: 'Commands disabled',
    default: false,
    required: true
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
    key: 'delegateVoiceToOverlay',
    kind: 'optional-object',
    label: 'Delegate voice command to Overlay',
    dependsOn: 'remoteChatTTS',
    objectFields: []
  },
  {
    key: 'modelConfig',
    kind: 'optional-object',
    label: 'Model',
    commandSection: true,
    alwaysPresent: true,
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
    commandSection: true,
    alwaysPresent: true,
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
    key: 'watchStreakConfig',
    kind: 'optional-object',
    label: 'Watch Streak',
    commandSection: true,
    alwaysPresent: true,
    objectFields: [
      {
        key: 'streakInterval',
        kind: 'number',
        label: 'Streak Interval',
        default: 5,
        min: 1,
        step: 1
      }
    ]
  },
  {
    key: 'newChatterConfig',
    kind: 'optional-object',
    label: 'New Chatter Greeting',
    alwaysPresent: true,
    objectFields: [
      {
        key: 'greeting',
        kind: 'text',
        label: 'Greeting',
        placeholder: 'Welcome {user}!'
      }
    ]
  },
  ...commandSections,
  COMMAND_COOLDOWNS_CONFIG,
  COMMAND_CHANCES_CONFIG,
  {
    key: 'overlayPositionsConfig',
    kind: 'optional-object',
    label: 'Overlay widget positions',
    alwaysPresent: true,
    presets: [
      {
        label: 'Wheel: center',
        values: { wheelX: 960, wheelY: 540, wheelWidth: 648, wheelHeight: 648 }
      },
      {
        label: 'Wheel: small bottom-right',
        values: { wheelX: 1720, wheelY: 900, wheelWidth: 280, wheelHeight: 280 }
      }
    ],
    widgetGroups: [
      { id: 'artist', label: 'Artist widget', prefix: 'artistWidget', origin: 'topLeft' },
      { id: 'rightPanel', label: 'Right panel', prefix: 'rightPanel', origin: 'topLeft' },
      { id: 'pin', label: 'Pinned message', prefix: 'pin', origin: 'topLeft' },
      { id: 'wheel', label: 'Gamba wheel', prefix: 'wheel', origin: 'center' }
    ],
    objectFields: [
      {
        key: 'artistWidgetX',
        kind: 'number',
        label: 'Artist widget X',
        default: 20,
        min: 0,
        max: 1920,
        step: 1
      },
      {
        key: 'artistWidgetY',
        kind: 'number',
        label: 'Artist widget Y',
        default: 20,
        min: 0,
        max: 1080,
        step: 1
      },
      {
        key: 'artistWidgetWidth',
        kind: 'number',
        label: 'Artist widget width',
        default: 360,
        min: 0,
        max: 1920,
        step: 1
      },
      {
        key: 'artistWidgetHeight',
        kind: 'number',
        label: 'Artist widget height',
        default: 90,
        min: 0,
        max: 1080,
        step: 1
      },
      {
        key: 'rightPanelX',
        kind: 'number',
        label: 'Right panel X',
        default: 1520,
        min: 0,
        max: 1920,
        step: 1
      },
      {
        key: 'rightPanelY',
        kind: 'number',
        label: 'Right panel Y',
        default: 0,
        min: 0,
        max: 1080,
        step: 1
      },
      {
        key: 'rightPanelWidth',
        kind: 'number',
        label: 'Right panel width',
        default: 400,
        min: 0,
        max: 1920,
        step: 1
      },
      {
        key: 'rightPanelHeight',
        kind: 'number',
        label: 'Right panel height',
        default: 1080,
        min: 0,
        max: 1080,
        step: 1
      },
      {
        key: 'pinX',
        kind: 'number',
        label: 'Pinned message X',
        default: 760,
        min: 0,
        max: 1920,
        step: 1
      },
      {
        key: 'pinY',
        kind: 'number',
        label: 'Pinned message Y',
        default: 40,
        min: 0,
        max: 1080,
        step: 1
      },
      {
        key: 'pinWidth',
        kind: 'number',
        label: 'Pinned message width',
        default: 400,
        min: 0,
        max: 1920,
        step: 1
      },
      {
        key: 'pinHeight',
        kind: 'number',
        label: 'Pinned message height',
        default: 120,
        min: 0,
        max: 1080,
        step: 1
      },
      {
        key: 'wheelX',
        kind: 'number',
        label: 'Wheel X (center)',
        default: 960,
        min: 0,
        max: 1920,
        step: 1
      },
      {
        key: 'wheelY',
        kind: 'number',
        label: 'Wheel Y (center)',
        default: 540,
        min: 0,
        max: 1080,
        step: 1
      },
      {
        key: 'wheelWidth',
        kind: 'number',
        label: 'Wheel width',
        default: 648,
        min: 0,
        max: 1920,
        step: 1
      },
      {
        key: 'wheelHeight',
        kind: 'number',
        label: 'Wheel height',
        default: 648,
        min: 0,
        max: 1080,
        step: 1
      }
    ]
  },
  {
    key: 'startingSoonConfig',
    kind: 'optional-object',
    label: 'Starting Soon images',
    alwaysPresent: true,
    objectFields: [
      {
        key: 'images',
        kind: 'list-of-objects',
        label: 'Image artwork entries',
        listObjectFields: [
          { key: 'file', kind: 'text', label: 'Image filename' },
          { key: 'artist', kind: 'text', label: 'Artist attribution' }
        ]
      }
    ]
  },
  {
    key: 'redeemConfig',
    kind: 'optional-object',
    label: 'Channel Point Redeems',
    alwaysPresent: true,
    objectFields: [
      {
        key: 'redeems',
        kind: 'list-of-objects',
        label: 'Redeem entries',
        listObjectFields: [
          { key: 'id', kind: 'text', label: 'Reward ID', placeholder: 'twitch reward id' },
          {
            key: 'kind',
            kind: 'text',
            label: 'Handler kind',
            placeholder: 'addPoints | addKarma'
          },
          { key: 'amount', kind: 'number', label: 'Amount', default: 0, min: 0, step: 1 }
        ]
      }
    ]
  }
] as const satisfies readonly FieldSchema[];
