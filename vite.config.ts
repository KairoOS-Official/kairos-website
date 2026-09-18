import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

// Plugin Vite pour le routage multi-pages et la vraie page 404 en mode dev
function multiPageDevRouter() {
  const pageRoutes: Record<string, string> = {
    '/': 'index.html',
    '/admin': 'admin/index.html',
    '/admin/': 'admin/index.html',
    '/roadmap': 'roadmap/index.html',
    '/roadmap/': 'roadmap/index.html',
    '/plugins': 'plugins/index.html',
    '/plugins/': 'plugins/index.html',
    '/themes': 'themes/index.html',
    '/themes/': 'themes/index.html',
    '/legal/mentions-legales': 'legal/mentions-legales.html',
    '/legal/confidentialite': 'legal/confidentialite.html',
    '/legal/cookies': 'legal/cookies.html',
    '/404': '404.html',
    '/500': '500.html'
  };

  return {
    name: 'multi-page-dev-router',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const rawUrl = req.url || '/';
        const urlWithoutQuery = rawUrl.split('?')[0];

        // Laisser passer les fichiers d'assets, scripts et api
        if (
          urlWithoutQuery.startsWith('/api') ||
          urlWithoutQuery.startsWith('/@') ||
          urlWithoutQuery.startsWith('/src') ||
          urlWithoutQuery.startsWith('/assets') ||
          /\.[a-zA-Z0-9]+$/.test(urlWithoutQuery)
        ) {
          return next();
        }

        // Support préfixe multilingue /fr/ ou /en/
        let cleanRoute = urlWithoutQuery;
        if (cleanRoute.startsWith('/fr/') || cleanRoute.startsWith('/en/')) {
          cleanRoute = cleanRoute.slice(3);
        } else if (cleanRoute === '/fr' || cleanRoute === '/en') {
          cleanRoute = '/';
        }

        const matchedPage = pageRoutes[cleanRoute];
        if (matchedPage) {
          req.url = '/' + matchedPage;
          return next();
        }

        // Route inexistante : Servir la vraie page 404.html avec le code HTTP 404
        const notFoundPath = resolve(import.meta.dirname, 'web/404.html');
        if (fs.existsSync(notFoundPath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          fs.createReadStream(notFoundPath).pipe(res);
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), multiPageDevRouter()],
  root: 'web',
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
        main: resolve(import.meta.dirname, 'web/index.html'),
        admin: resolve(import.meta.dirname, 'web/admin/index.html'),
        roadmap: resolve(import.meta.dirname, 'web/roadmap/index.html'),
        plugins: resolve(import.meta.dirname, 'web/plugins/index.html'),
        themes: resolve(import.meta.dirname, 'web/themes/index.html'),
        notfound: resolve(import.meta.dirname, 'web/404.html'),
        servererror: resolve(import.meta.dirname, 'web/500.html'),
        legalMentions: resolve(import.meta.dirname, 'web/legal/mentions-legales.html'),
        legalPrivacy: resolve(import.meta.dirname, 'web/legal/confidentialite.html'),
        legalCookies: resolve(import.meta.dirname, 'web/legal/cookies.html')
      }
    }
  }
});
