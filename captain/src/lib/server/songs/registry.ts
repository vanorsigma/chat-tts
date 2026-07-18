import type { SongProvider } from '$lib/songs/types';
import { FilesystemSongProvider } from '$lib/songs/filesystemProvider';
import { YouTubeSongProvider } from '$lib/songs/youtubeProvider';
import { NeuroKaraokeSongProvider } from '$lib/songs/neuroKaraokeProvider';
import { env } from '$env/dynamic/private';

const providers: SongProvider[] = [
  new FilesystemSongProvider(),
  new YouTubeSongProvider({ id: 'yt', label: 'YouTube', mode: 'individual' }),
  new NeuroKaraokeSongProvider(),
];

const playlistUrl = env.YOUTUBE_PLAYLIST_URL;
if (playlistUrl) {
  providers.push(new YouTubeSongProvider({ id: 'ytpl', label: 'YouTube Playlist', mode: 'playlist', playlistUrl }));
}

export function getSongProviders(): SongProvider[] {
  return providers;
}

export function getSongProvider(id: string): SongProvider | undefined {
  return providers.find((p) => p.id === id);
}
