import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db, rawAll } from '../../db/client.js';
import {
  bannedIps,
  chatMessages,
  banAppeals,
  pageViews,
  analyticsEvents
} from '../../db/schema.js';
import { eq, desc, and, count, sql } from 'drizzle-orm';

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return request.ip || '127.0.0.1';
}

function anonymizeIp(ip: string): string {
  if (!ip) return '0.0.0.0';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 3) return `${parts[0]}:${parts[1]}:${parts[2]}::`;
  }
  return '0.0.0.0';
}

function parseUserAgent(ua: string): { os: string; browser: string; device: string } {
  let os = 'Inconnu';
  let browser = 'Inconnu';
  let device = 'desktop';

  const u = ua.toLowerCase();
  if (u.includes('mobile') || u.includes('android') || u.includes('iphone')) {
    device = 'mobile';
  } else if (u.includes('ipad') || u.includes('tablet')) {
    device = 'tablet';
  }

  if (u.includes('windows')) os = 'Windows';
  else if (u.includes('macintosh') || u.includes('mac os')) os = 'macOS';
  else if (u.includes('linux')) os = 'Linux';
  else if (u.includes('android')) os = 'Android';
  else if (u.includes('iphone') || u.includes('ipad')) os = 'iOS';

  if (u.includes('edg/')) browser = 'Edge';
  else if (u.includes('chrome') && !u.includes('edg/')) browser = 'Chrome';
  else if (u.includes('safari') && !u.includes('chrome')) browser = 'Safari';
  else if (u.includes('firefox')) browser = 'Firefox';

  return { os, browser, device };
}

const ChatSendSchema = z.object({
  message: z.string().min(1, 'Message vide').max(2000, 'Message trop long')
});

const BanAppealSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  message: z.string().min(1, 'Veuillez rédiger un message')
});

const TrackSchema = z.object({
  event_type: z.string().default('click'),
  target: z.string().default('unknown'),
  page: z.string().default('/'),
  session_id: z.string().default('anon'),
  meta: z.record(z.string(), z.any()).optional(),
  referrer: z.string().optional()
});

const ConsentStatSchema = z.object({
  choice: z.string().default('consent_accepted'),
  transition: z.string().optional().default('initial'),
  page: z.string().optional().default('/')
});

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Statut de sanction de l'IP appelante
  fastify.get('/api/user/ban-status', async (request, reply) => {
    const clientIp = getClientIp(request);
    const ban = (await db.select().from(bannedIps).where(eq(bannedIps.ipAddress, clientIp)))[0];

    if (!ban) {
      return reply.status(200).send({ is_banned: false, ip: clientIp });
    }

    if (ban.banType === 'temp' && ban.expiresAt) {
      const expDate = new Date(ban.expiresAt);
      if (Date.now() >= expDate.getTime()) {
        return reply.status(200).send({ is_banned: false, ip: clientIp });
      }
    }

    return reply.status(200).send({
      is_banned: true,
      ip: clientIp,
      ban_type: ban.banType,
      expires_at: ban.expiresAt,
      reason: ban.reason,
      block_all: Boolean(ban.blockAll),
      block_vote: Boolean(ban.blockVote),
      block_proposal: Boolean(ban.blockProposal),
      block_suggestion: Boolean(ban.blockSuggestion)
    });
  });

  // 2. Fil de discussion visiteur <-> admin
  fastify.get('/api/user/chat', async (request, reply) => {
    const clientIp = getClientIp(request);
    const msgs = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.ipAddress, clientIp))
      .orderBy(chatMessages.id)
      .limit(100);

    // Marquer les messages envoyés par l'admin comme lus par le visiteur
    await db.update(chatMessages)
      .set({ isRead: 1 })
      .where(and(eq(chatMessages.ipAddress, clientIp), eq(chatMessages.sender, 'admin')));

    return reply.status(200).send({
      status: 'ok',
      ip: clientIp,
      has_thread: msgs.length > 0,
      messages: msgs
    });
  });

  // 3. Envoi d'un message visiteur
  fastify.post('/api/user/chat/send', async (request, reply) => {
    const clientIp = getClientIp(request);
    const parse = ChatSendSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    await db.insert(chatMessages)
      .values({
        ipAddress: clientIp,
        sender: 'visitor',
        message: parse.data.message,
        isRead: 0
      });

    return reply.status(200).send({ status: 'ok', message: 'Message transmis aux administrateurs' });
  });

  // 4. Dépôt de recours de débannissement
  fastify.post('/api/ban/appeal', async (request, reply) => {
    const clientIp = getClientIp(request);
    const parse = BanAppealSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    await db.insert(banAppeals)
      .values({
        ipAddress: clientIp,
        email: parse.data.email,
        message: parse.data.message,
        status: 'pending'
      });

    return reply.status(200).send({
      status: 'ok',
      message: 'Votre recours a bien été transmis aux administrateurs. Il sera examiné prochainement.'
    });
  });

  // 5. Télémétrie éthique (Page Views, clics, durées)
  fastify.post('/api/track', async (request, reply) => {
    const clientIp = getClientIp(request);
    const userAgent = request.headers['user-agent'] || '';
    const { os, browser, device } = parseUserAgent(userAgent);
    const anonIp = anonymizeIp(clientIp);

    const parse = TrackSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error' });
    }

    const { event_type, target, page, session_id, meta, referrer } = parse.data;
    const durationSeconds = Number(meta?.duration_seconds || 0) || 0;

    if (event_type === 'page_view') {
      await db.insert(pageViews)
        .values({
          page,
          sessionId: session_id,
          referrer: referrer ? referrer.split('?')[0].slice(0, 250) : '',
          ipAddress: anonIp,
          os,
          browser,
          device,
          durationSeconds: 0
        });
    } else if (event_type === 'page_duration') {
      if (durationSeconds > 0 && session_id && session_id !== 'anon') {
        // Mettre à jour la durée de la vue de page correspondante
        try {
          await db.update(pageViews)
            .set({ durationSeconds })
            .where(and(
              eq(pageViews.sessionId, session_id),
              eq(pageViews.page, page)
            ));
        } catch {
          // Ignorer en cas de concurrence
        }
      }
      await db.insert(analyticsEvents)
        .values({
          eventType: event_type,
          target,
          page,
          sessionId: session_id,
          metaJson: meta ? JSON.stringify(meta) : null,
          ipAddress: anonIp,
          os,
          browser,
          device,
          durationSeconds
        });
    } else {
      await db.insert(analyticsEvents)
        .values({
          eventType: event_type,
          target,
          page,
          sessionId: session_id,
          metaJson: meta ? JSON.stringify(meta) : null,
          ipAddress: anonIp,
          os,
          browser,
          device,
          durationSeconds: durationSeconds > 0 ? durationSeconds : 0
        });
    }

    return reply.status(200).send({ status: 'tracked' });
  });

  // 6. Enregistrement du consentement cookies RGPD
  const recordConsentChoice = async (body: unknown, reply: any) => {
    const parse = ConsentStatSchema.safeParse(body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error' });
    }

    const { choice, transition, page } = parse.data;

    await db.insert(analyticsEvents)
      .values({
        eventType: 'consent',
        target: choice,
        page: page || '/',
        sessionId: 'anon',
        metaJson: JSON.stringify({ transition }),
        ipAddress: 'ANON'
      });

    return reply.status(200).send({ status: 'consent_stat_recorded' });
  };

  fastify.post('/api/consent', async (request, reply) => {
    return recordConsentChoice(request.body, reply);
  });

  fastify.post('/api/track/consent-stat', async (request, reply) => {
    return recordConsentChoice(request.body, reply);
  });

  // 7. Résumé analytique public / admin complet
  fastify.get('/api/analytics/summary', async (_request, reply) => {
    // 1. Totaux généraux
    const [viewsCount] = await db.select({ val: count() }).from(pageViews);
    const [eventsCount] = await db.select({ val: count() }).from(analyticsEvents);

    const totalViews = Number(viewsCount?.val || 0);
    const totalEvents = Number(eventsCount?.val || 0);

    // 2. Visiteurs uniques réels (déduplication par visitor_id permanent ou IP)
    const rawSessionsAndIps = await rawAll<{ session_id: string | null; ip_address: string | null }>(sql`
      SELECT session_id, ip_address FROM page_views WHERE session_id IS NOT NULL AND session_id != ''
    `);
    const uniqueVisitorKeys = new Set<string>();
    for (const r of rawSessionsAndIps) {
      const s = r.session_id || '';
      const ip = r.ip_address || '';
      if (s.startsWith('v_') && s.includes('.')) {
        uniqueVisitorKeys.add(s.split('.')[0]);
      } else if (ip && ip !== '0.0.0.0' && ip !== 'ANON') {
        uniqueVisitorKeys.add(ip);
      } else if (s && s !== 'anon') {
        uniqueVisitorKeys.add(s);
      }
    }
    const uniqueVisitors = uniqueVisitorKeys.size > 0 ? uniqueVisitorKeys.size : (totalViews > 0 ? 1 : 0);

    // 3. Téléchargements
    const [dlClicksRow] = await rawAll<{ c: string | number }>(sql`
      SELECT COUNT(*) as c FROM analytics_events 
      WHERE event_type = 'download' OR target = 'download_button' OR target LIKE '%download%' OR target LIKE '%télécharger%'
    `);
    const [dlSessionsRow] = await rawAll<{ c: string | number }>(sql`
      SELECT COUNT(DISTINCT session_id) as c FROM analytics_events 
      WHERE (event_type = 'download' OR target = 'download_button' OR target LIKE '%download%' OR target LIKE '%télécharger%')
        AND session_id IS NOT NULL AND session_id != '' AND session_id != 'anon'
    `);
    const downloadClicks = Number(dlClicksRow?.c || 0);
    const downloadUniqueSessions = Number(dlSessionsRow?.c || 0);
    const avgDownloadsPerSession = downloadUniqueSessions > 0
      ? (downloadClicks / downloadUniqueSessions).toFixed(1)
      : (downloadClicks > 0 ? downloadClicks.toFixed(1) : '0.0');

    // 4. Durées de visite moyennes (session & page)
    const [avgSessionRow] = await rawAll<{ avg_d: string | number | null }>(sql`
      SELECT AVG(total_duration) as avg_d FROM (
        SELECT session_id, SUM(duration_seconds) as total_duration 
        FROM page_views 
        WHERE duration_seconds > 0 AND session_id IS NOT NULL AND session_id != '' AND session_id != 'anon'
        GROUP BY session_id
      ) AS sess_dur
    `);
    const [avgPageRow] = await rawAll<{ avg_d: string | number | null }>(sql`
      SELECT AVG(duration_seconds) as avg_d FROM page_views 
      WHERE duration_seconds > 0
    `);
    const avgSessionDuration = Math.round(Number(avgSessionRow?.avg_d || 0));
    const avgPageDuration = Math.round(Number(avgPageRow?.avg_d || 0));

    // 5. Consentement ePrivacy
    const [consentAccRow] = await rawAll<{ c: string | number }>(sql`
      SELECT COUNT(*) as c FROM analytics_events 
      WHERE event_type = 'consent' AND (target = 'consent_accepted' OR target = 'accepted')
    `);
    const [consentRefRow] = await rawAll<{ c: string | number }>(sql`
      SELECT COUNT(*) as c FROM analytics_events 
      WHERE event_type = 'consent' AND (target = 'consent_refused' OR target = 'refused')
    `);
    const [consentRevokedRow] = await rawAll<{ c: string | number }>(sql`
      SELECT COUNT(*) as c FROM analytics_events 
      WHERE event_type = 'consent' AND meta_json LIKE '%accepted_to_refused%'
    `);
    const [consentGrantedRow] = await rawAll<{ c: string | number }>(sql`
      SELECT COUNT(*) as c FROM analytics_events 
      WHERE event_type = 'consent' AND meta_json LIKE '%refused_to_accepted%'
    `);
    const consentAccepted = Number(consentAccRow?.c || 0);
    const consentRefused = Number(consentRefRow?.c || 0);
    const totalConsentDecisions = consentAccepted + consentRefused;
    const consentRate = totalConsentDecisions > 0
      ? Math.round((consentAccepted / totalConsentDecisions) * 1000) / 10
      : 100.0;
    const consentRevoked = Number(consentRevokedRow?.c || 0);
    const consentGrantedAfter = Number(consentGrantedRow?.c || 0);

    // 6. Répartition par page
    const pagesBreakdownRaw = await rawAll<{
      page: string;
      views_count: string | number;
      visitors_count: string | number;
      avg_duration: string | number | null;
    }>(sql`
      SELECT 
        page, 
        COUNT(*) as views_count, 
        COUNT(DISTINCT session_id) as visitors_count, 
        COALESCE(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE NULL END), 0) as avg_duration
      FROM page_views
      WHERE page IS NOT NULL AND page != ''
      GROUP BY page
      ORDER BY views_count DESC
      LIMIT 20
    `);
    const pagesBreakdown = pagesBreakdownRaw.map(p => ({
      page: p.page,
      views_count: Number(p.views_count || 0),
      visitors_count: Number(p.visitors_count || 0),
      avg_duration: Math.round(Number(p.avg_duration || 0))
    }));

    // 7. Statistiques Systèmes d'exploitation
    const osStatsRaw = await rawAll<{ os: string; count: string | number }>(sql`
      SELECT os, COUNT(*) as count 
      FROM page_views 
      WHERE os IS NOT NULL AND os != '' AND os != 'Inconnu'
      GROUP BY os 
      ORDER BY count DESC 
      LIMIT 10
    `);
    const osStats = osStatsRaw.map(o => ({ os: o.os, count: Number(o.count || 0) }));

    // 8. Statistiques Navigateurs
    const browserStatsRaw = await rawAll<{ browser: string; count: string | number }>(sql`
      SELECT browser, COUNT(*) as count 
      FROM page_views 
      WHERE browser IS NOT NULL AND browser != '' AND browser != 'Inconnu'
      GROUP BY browser 
      ORDER BY count DESC 
      LIMIT 10
    `);
    const browserStats = browserStatsRaw.map(b => ({ browser: b.browser, count: Number(b.count || 0) }));

    // 9. Statistiques Appareils
    const deviceStatsRaw = await rawAll<{ device: string; count: string | number }>(sql`
      SELECT device, COUNT(*) as count 
      FROM page_views 
      WHERE device IS NOT NULL AND device != ''
      GROUP BY device 
      ORDER BY count DESC 
      LIMIT 10
    `);
    const deviceStats = deviceStatsRaw.map(d => ({ device: d.device, count: Number(d.count || 0) }));

    // 10. Top clics & événements
    const topClicksRaw = await rawAll<{ target: string; count: string | number }>(sql`
      SELECT target, COUNT(*) as count 
      FROM analytics_events 
      WHERE event_type = 'click' AND target IS NOT NULL AND target != ''
      GROUP BY target 
      ORDER BY count DESC 
      LIMIT 10
    `);
    const topClicks = topClicksRaw.map(t => ({ target: t.target, count: Number(t.count || 0) }));

    // 11. Événements récents
    const recentEventsRaw = await rawAll<{
      event_type: string;
      target: string;
      page: string;
      created_at: string;
    }>(sql`
      SELECT event_type, target, page, created_at 
      FROM analytics_events 
      ORDER BY id DESC 
      LIMIT 20
    `);

    return reply.status(200).send({
      status: 'ok',
      total_views: totalViews,
      total_events: totalEvents,
      unique_visitors: uniqueVisitors,
      download_clicks: downloadClicks,
      download_unique_sessions: downloadUniqueSessions,
      avg_downloads_per_session: avgDownloadsPerSession,
      avg_session_duration: avgSessionDuration,
      avg_page_duration: avgPageDuration,
      consent_accepted: consentAccepted,
      consent_refused: consentRefused,
      consent_rate: consentRate,
      consent_revoked: consentRevoked,
      consent_granted_after: consentGrantedAfter,
      pages_breakdown: pagesBreakdown,
      os_stats: osStats,
      browser_stats: browserStats,
      device_stats: deviceStats,
      top_clicks: topClicks,
      recent_events: recentEventsRaw,
      timestamp: new Date().toISOString()
    });
  });
};
