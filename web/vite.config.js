import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: '.',
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8788', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
