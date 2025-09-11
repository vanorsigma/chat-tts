import { AnimatedSprite, Assets, Sprite, Texture } from 'pixi.js';

type Emote = {
  id: string;
  name: string;
  urls: string[];
};

type EmoteSetResponse = {
  data: {
    emoteSet: {
      emotes: {
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
      }[];
    };
  };
};

const GRAPHQL_ENDPOINT = 'https://7tv.io/v3/gql';

let cached_emote_list: Emote[] = [];
async function getAllEmotesListCached(emoteSetId: string): Promise<Emote[]> {
  if (cached_emote_list.length > 0) {
    return cached_emote_list;
  }

  const query = `
    query GetEmoteSet($id: String!) {
      emoteSet(id: $id) {
        emotes {
          id
          name
          data {
            name
            host {
              url
              files {
                format
                name
              }
            }
          }
        }
      }
    }
  `;

  const variables = { id: emoteSetId };

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: EmoteSetResponse = await response.json();

    cached_emote_list = result.data.emoteSet.emotes.map((emote) => ({
      id: emote.id,
      name: emote.name,
      urls: emote.data.host.files.map((file) => `${emote.data.host.url}/${file.name}`)
    }));

    return cached_emote_list;
  } catch (error) {
    console.error('Error fetching emote set:', error);
    return [];
  }
}

export async function is7TVEmote(emoteSetId: string, word: string): Promise<Emote | null> {
  return (await getAllEmotesListCached(emoteSetId)).filter((e) => e.name === word).at(0) ?? null;
}

export async function fetchAnimatedSprite(url: string): Promise<Sprite | null> {
  const response = await fetch(url);
  const imageBlob = await (await response.blob()).arrayBuffer();

  const decoder = new ImageDecoder({
    data: imageBlob,
    type: response.headers.get('content-type') ?? 'image/webp'
  });
  await decoder.completed;

  const textures = [];
  for (let i = 0; i < decoder.tracks[0].frameCount; i++) {
    const frame = await decoder.decode({ frameIndex: i });
    const texture = Texture.from(frame.image);
    textures.push(texture);
  }

  if (textures.length === 0) {
    const texture = await Assets.load(url);
    return new Sprite(texture);
  }

  const animatedSprite = new AnimatedSprite(textures);
  animatedSprite.animationSpeed = 0.4;
  animatedSprite.loop = true;
  animatedSprite.play();

  return animatedSprite;
}
