type Emote = {
  id: string;
  name: string;
  urls: string[];
};

type RawEmote = {
  id: string;
  name: string;
  data: {
    name: string;
    host: {
      url: string;
      files: {
        format: string;
        name: string;
      }[];
    };
  };
};

type EmoteSetResponse = {
  emotes: RawEmote[];
};

const API_ENDPOINT = 'https://7tv.io/v3/emote-sets';

const cachedEmoteLists = new Map<string, Emote[]>();

async function getEmoteListCached(emoteSetId: string): Promise<Emote[]> {
  const cached = cachedEmoteLists.get(emoteSetId);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const response = await fetch(`${API_ENDPOINT}/${emoteSetId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: EmoteSetResponse = await response.json();

    const emotes = result.emotes.map((emote) => ({
      id: emote.id,
      name: emote.name,
      urls: emote.data.host.files.map((file) => `${emote.data.host.url}/${file.name}`)
    }));

    cachedEmoteLists.set(emoteSetId, emotes);
    console.log(`Loaded ${emotes.length} 7TV emotes for set ${emoteSetId}.`);
    return emotes;
  } catch (error) {
    console.error('Error fetching emote set:', error);
    return [];
  }
}

export async function is7TVEmote(emoteSetId: string, word: string): Promise<Emote | null> {
  return (await getEmoteListCached(emoteSetId)).filter((e) => e.name === word).at(0) ?? null;
}
