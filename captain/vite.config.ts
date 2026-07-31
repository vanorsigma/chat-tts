import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    watch: {
      ignored: ['**/.venv/**']
    },
    // NOTE: lots of things rely on the server being this port, i'm too lazy to change them
    port: 4173,
    strictPort: true,
  }
});
