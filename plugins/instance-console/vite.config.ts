import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  root: resolve(__dirname, 'src/client'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/client'),
    },
  },
  server: {
    port: 18791,
    proxy: {
      '/api': {
        target: 'http://localhost:18790',
        changeOrigin: true,
      },
    },
  },
});
