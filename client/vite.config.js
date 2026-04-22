import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, Vite runs on :5173 and proxies /api to the Express backend on :3000.
// In prod, the client is built to static files and served by Express directly,
// so /api resolves on the same origin — no proxy needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
