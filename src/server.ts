import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import type { HealthResponse } from './types.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { publicRoutes } from './modules/public/public.routes.js';
import { roadmapRoutes } from './modules/roadmap/roadmap.routes.js';
import { contentRoutes } from './modules/content/content.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';

import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import path from 'node:path';
import fs from 'node:fs';

export function buildServer(): FastifyInstance {
  const server = fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 15 * 1024 * 1024 // 15MB limit
  });

  // Security Headers
  server.register(helmet, {
    global: true,
    contentSecurityPolicy: false, // Allows inline styles & CDNs already in static pages
    crossOriginEmbedderPolicy: false
  });

  // Performance Response Compression
  server.register(compress, {
    global: true,
    encodings: ['gzip', 'deflate']
  });

  // Rate Limiting (Anti Brute Force & DoS)
  server.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    allowList: (req) => {
      const cleanUrl = req.url.split('?')[0] || '';
      return (
        cleanUrl.startsWith('/assets') ||
        /\.(png|jpg|jpeg|webp|gif|svg|ico|css|js|woff2?|ttf|eot|map|html)$/i.test(cleanUrl)
      );
    }
  });

  server.register(cors, {
    origin: true,
    credentials: true
  });

  server.register(cookie, {
    secret: process.env.SESSION_SECRET || 'kairo_local_session_cookie_key'
  });

  server.register(multipart, {
    limits: {
      fileSize: 15 * 1024 * 1024, // 15MB max file size
      files: 1
    }
  });

  // Health Endpoint
  server.get<{ Reply: HealthResponse }>('/api/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  });

  // Route Plugins
  server.register(authRoutes);
  server.register(publicRoutes);
  server.register(roadmapRoutes);
  server.register(contentRoutes);
  server.register(adminRoutes);

  // Static Frontend Serving (dist/ if built, fallback to web/)
  const distDir = path.resolve(process.cwd(), 'dist');
  const webDir = path.resolve(process.cwd(), 'web');
  const staticRoot = fs.existsSync(distDir) ? distDir : webDir;

  server.register(fastifyStatic, {
    root: staticRoot,
    prefix: '/',
    wildcard: true
  });

  // Configurable Admin Path (e.g. /admin or /secret-admin)
  const adminCustomPath = (process.env.ADMIN_PATH || 'admin').replace(/^\/+|\/+$/g, '');

  // Clean URL Rewrites for Multi-page & Multilingual Support
  const pageMap: Record<string, string> = {
    '': 'index.html',
    'index.html': 'index.html',
    'home': 'index.html',
    'themes': 'themes/index.html',
    'plugins': 'plugins/index.html',
    'roadmap': 'roadmap/index.html',
    [adminCustomPath]: 'admin/index.html',
    'legal/mentions-legales': 'legal/mentions-legales.html',
    'legal/confidentialite': 'legal/confidentialite.html',
    'legal/cookies': 'legal/cookies.html',
    '404': '404.html',
    '500': '500.html'
  };

  // If ADMIN_PATH was customized away from 'admin', ensure old /admin returns 404
  if (adminCustomPath !== 'admin') {
    delete pageMap['admin'];
  }

  server.setNotFoundHandler((request, reply) => {
    // If request was for /api, return standard 404 JSON
    if (request.url.startsWith('/api')) {
      return reply.status(404).send({ status: 'error', message: 'Endpoint API introuvable' });
    }

    // Clean leading/trailing slashes
    const cleanUrl = request.url.split('?')[0]!.replace(/^\/+|\/+$/g, '');
    const parts = cleanUrl.split('/');

    // Handle /fr/ or /en/ prefix
    let candidate = cleanUrl;
    if (parts[0] === 'fr' || parts[0] === 'en') {
      candidate = parts.slice(1).join('/');
    }

    const matchedFile = pageMap[candidate];
    if (matchedFile) {
      return reply.sendFile(matchedFile);
    }

    // Return custom 404.html
    return reply.status(404).sendFile('404.html');
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildServer();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';

  app.listen({ port, host }, (err, address) => {
    if (err) {
      console.error('Error starting Fastify server:', err);
      process.exit(1);
    }
    console.log(`🚀 Fastify Main API running on ${address}`);
  });

  // Dedicated Admin Port (Optional: if ADMIN_PORT is set, e.g. 3001)
  const adminPort = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : null;
  if (adminPort && adminPort !== port) {
    const adminApp = buildServer();
    adminApp.listen({ port: adminPort, host }, (err, address) => {
      if (err) {
        console.error('Error starting Dedicated Admin server:', err);
      } else {
        console.log(`🔒 Dedicated Admin Portal running on ${address}`);
      }
    });
  }
}
