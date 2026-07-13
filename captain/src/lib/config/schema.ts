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
    objectFields: [
      {
        key: 'wsUrl',
        kind: 'text',
        label: 'WebSocket URL',
        placeholder: 'ws://localhost:3001/senders',
        required: true
      }
    ]
  },
  {
    key: 'distractConfig',
    kind: 'optional-object',
    label: 'Distract Config',
    objectFields: [
      { key: 'enabled', kind: 'boolean', label: 'Enabled', default: false },
      { key: 'wsUrl', kind: 'text', label: 'WebSocket URL', placeholder: 'ws://...' },
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
    key: 'obsSettings',
    kind: 'optional-object',
    label: 'OBS Settings',
    objectFields: [
      { key: 'obsURL', kind: 'text', label: 'OBS URL', placeholder: 'ws://localhost:4455' },
      { key: 'password', kind: 'text', label: 'Password', placeholder: 'obs websocket password' },
      { key: 'sourceName', kind: 'text', label: 'Source name', placeholder: 'Chat' },
      {
        key: 'rotationNames',
        kind: 'list-of-text',
        label: 'Rotation names',
        placeholder: 'source name'
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
    objectFields: [{ key: 'busURL', kind: 'text', label: 'Bus URL', placeholder: 'ws://...' }]
  }
];
