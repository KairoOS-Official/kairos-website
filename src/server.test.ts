import { describe, it, expect } from 'vitest';
import { buildServer } from './server.js';

describe('Fastify Endpoints Integration Tests', () => {
  const server = buildServer();

  it('server initializes plugins properly', async () => {
    await server.ready();
    expect(server).toBeDefined();
  });

  it('GET /api/health returns 200 with status ok', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.database).toBe('connected');
  });

  it('GET /api/user/ban-status returns 200 with ban status', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/user/ban-status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('is_banned');
    expect(body).toHaveProperty('ip');
  });

  it('GET /api/content?lang=fr returns catalog and site contents', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/content?lang=fr' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.lang).toBe('fr');
    expect(body).toHaveProperty('content');
    expect(body).toHaveProperty('games');
    expect(body).toHaveProperty('faq');
    expect(body).toHaveProperty('plugins');
    expect(body).toHaveProperty('themes');
    expect(body).toHaveProperty('milestones');
  });

  it('GET /api/content/all returns complete i18n data and collections', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/content/all' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('content');
    expect(body).toHaveProperty('features');
  });

  it('GET /api/roadmap/features returns feature list with vote statuses', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/roadmap/features' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(Array.isArray(body.features)).toBe(true);
  });

  it('POST /api/track successfully records page view', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/track',
      payload: {
        event_type: 'page_view',
        page: '/test',
        session_id: 'test_session_123',
        referrer: 'https://google.com'
      }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('tracked');
  });

  it('GET /api/admin/users rejects unauthorized requests', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/health includes security headers and content-type', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers).toHaveProperty('vary');
  });

  it('POST /api/upload rejects non-admin requests', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/upload',
      payload: { file_name: 'exploit.sh', file_data: 'dGVzdA==' }
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET / serves index.html with 200', async () => {
    const res = await server.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('GET /fr/roadmap serves roadmap page with 200', async () => {
    const res = await server.inject({ method: 'GET', url: '/fr/roadmap' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('GET /en/themes serves themes page with 200', async () => {
    const res = await server.inject({ method: 'GET', url: '/en/themes' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('GET /non-existent-page returns 404 with custom 404 HTML', async () => {
    const res = await server.inject({ method: 'GET', url: '/non-existent-page' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('text/html');
  });

  // Parcours obligatoires du Prompt 10 :
  it('Journey: Submit community proposal', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/roadmap/propose',
      payload: {
        title: 'Support DualSense Haptic Shaders',
        category: 'GAMEPLAY',
        description: 'Ajouter les vibrations haptiques et gâchettes adaptatives',
        author: 'RetroGamer',
        email: 'retrogamer@kairoos.local'
      }
    });
    expect([200, 201]).toContain(res.statusCode);
  });

  it('Journey: Cast roadmap vote', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/roadmap/vote',
      payload: { feature_id: 1 }
    });
    expect([200, 400, 403]).toContain(res.statusCode);
  });

  it('Journey: Check visitor chat endpoint', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/user/chat' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it('GET /api/analytics/summary returns complete metrics for admin dashboard', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/analytics/summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('total_views');
    expect(body).toHaveProperty('unique_visitors');
    expect(body).toHaveProperty('avg_session_duration');
    expect(body).toHaveProperty('avg_page_duration');
    expect(body).toHaveProperty('pages_breakdown');
    expect(body).toHaveProperty('download_clicks');
    expect(body).toHaveProperty('download_unique_sessions');
    expect(body).toHaveProperty('consent_accepted');
    expect(body).toHaveProperty('consent_refused');
    expect(body).toHaveProperty('consent_rate');
    expect(Array.isArray(body.pages_breakdown)).toBe(true);
  });

  it('POST /api/track/consent-stat records consent choices', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/track/consent-stat',
      payload: {
        choice: 'consent_accepted',
        transition: 'initial',
        page: '/'
      }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('consent_stat_recorded');
  });

  it('POST /api/track updates page duration', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/track',
      payload: {
        event_type: 'page_duration',
        page: '/test-dur',
        session_id: 'test_sess_dur',
        meta: { duration_seconds: 45 }
      }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('tracked');
  });

  it('POST /api/roadmap/vote accepts string number feature_id without validation error', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/roadmap/vote',
      payload: { feature_id: '1' }
    });
    expect([200, 400, 403]).toContain(res.statusCode);
    const body = JSON.parse(res.payload);
    if (res.statusCode === 400) {
      expect(body.message).not.toContain('expected number, received string');
    }
  });

  it('GET /api/roadmap/features provides both snake_case and camelCase fields', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/roadmap/features' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    if (body.features.length > 0) {
      const feat = body.features[0];
      expect(typeof feat.id).toBe('number');
      expect(feat).toHaveProperty('title_fr');
      expect(feat).toHaveProperty('desc_fr');
      expect(feat).toHaveProperty('votes_count');
      expect(feat).toHaveProperty('titleFr');
      expect(feat).toHaveProperty('descFr');
      expect(feat).toHaveProperty('votesCount');
    }
  });
});

