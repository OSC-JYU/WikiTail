import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Wikitail is reverse-proxied at a sub-path in production (e.g.
  // `/s/wikitail/`), stripped before the request reaches this app — so the
  // built HTML/JS only needs to know its own base path to generate correct
  // asset URLs and links. Set via VITE_BASE_PATH at build time; defaults to
  // root for local dev. Must have a leading and trailing slash.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
})
