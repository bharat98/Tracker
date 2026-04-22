import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// OPFS-SAH (Storage Access Handle pool) is used for SQLite persistence.
// It does NOT require COOP/COEP headers — keeping them off avoids conflicts
// with Google Fonts and other CDN imports.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
