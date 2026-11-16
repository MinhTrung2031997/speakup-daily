import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from the domain root (Vercel). Client routes like /phrases are handled by the
// SPA rewrite in vercel.json.
export default defineConfig({
  base: '/',
  plugins: [react()],
});
