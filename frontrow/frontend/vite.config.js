import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// `base: './'` is load-bearing. Home Assistant serves the add-on from
// /api/hassio_ingress/<token>/, so every absolute asset path would 404. With a
// relative base the same build works there, on the bare port for the phones in
// the house, and from a file:// preview.
export default defineConfig({
  base: './',
  plugins: [react(), tailwind()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // A Pi serving a LAN has no bandwidth problem; a phone on 4G opening the
    // Nabu Casa URL does. Split the route bundles so the first paint is small.
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/react') ? 'react' : undefined),
      },
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:8199' },
  },
});
