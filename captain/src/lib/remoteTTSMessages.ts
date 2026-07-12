export interface CancelTTS {
  type: 'tts',
  command: {
    type: 'cancel'
  }
}

export interface DisableTTS {
  type: 'tts',
  command: {
    type: 'disable',
    duration: number,  // in seconds
  }
}

export type RemoteTTSMessages = CancelTTS | DisableTTS;

export function isRemoteTTSMessage(obj: object): obj is RemoteTTSMessages {
  return Object.keys(obj).includes('type') && (obj as RemoteTTSMessages).type === 'tts'
}
