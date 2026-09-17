import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'web',
  publicDir: 'assets',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'web/index.html'),
        admin: resolve(__dirname, 'web/admin/index.html'),
        roadmap: resolve(__dirname, 'web/roadmap/index.html'),
        plugins: resolve(__dirname, 'web/plugins/index.html'),
        themes: resolve(__dirname, 'web/themes/index.html'),
        notfound: resolve(__dirname, 'web/404.html'),
        servererror: resolve(__dirname, 'web/500.html'),
        legalMentions: resolve(__dirname, 'web/legal/mentions-legales.html'),
        legalPrivacy: resolve(__dirname, 'web/legal/confidentialite.html'),
        legalCookies: resolve(__dirname, 'web/legal/cookies.html')
      }
    }
  }
});
