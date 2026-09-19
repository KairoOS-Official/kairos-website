import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  bannedIps,
  chatMessages,
  banAppeals,
  pageViews,
  analyticsEvents
} from '../../db/schema.js';
import { eq, desc, and, count, sql } from 'drizzle-orm';

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

const ConsentSchema = z.object({
  choice: z.enum(['consent_accepted', 'consent_refused']),
  page: z.string().default('/')
});

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Statut de sanction de l'IP appelante
  fastify.get('/api/user/ban-status', async (request, reply) => {
    const clientIp = request.ip || '127.0.0.1';
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
    const clientIp = request.ip || '127.0.0.1';
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
    const clientIp = request.ip || '127.0.0.1';
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
    const clientIp = request.ip || '127.0.0.1';
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
    const clientIp = request.ip || '127.0.0.1';
    const userAgent = request.headers['user-agent'] || '';
    const { os, browser, device } = parseUserAgent(userAgent);
    const anonIp = anonymizeIp(clientIp);

    const parse = TrackSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error' });
    }

    const { event_type, target, page, session_id, meta, referrer } = parse.data;

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
          device
        });
    }

    return reply.status(200).send({ status: 'tracked' });
  });

  // 6. Enregistrement du consentement cookies RGPD
  fastify.post('/api/consent', async (request, reply) => {
    const parse = ConsentSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error' });
    }

    await db.insert(analyticsEvents)
      .values({
        eventType: 'consent',
        target: parse.data.choice,
        page: parse.data.page,
        sessionId: 'anon',
        ipAddress: 'ANON'
      });

    return reply.status(200).send({ status: 'consent_stat_recorded' });
  });

  // 7. Résumé analytique public / admin
  fastify.get('/api/analytics/summary', async (_request, reply) => {
    const [viewsCount] = await db.select({ val: count() }).from(pageViews);
    const [eventsCount] = await db.select({ val: count() }).from(analyticsEvents);

    return reply.status(200).send({
      total_views: viewsCount?.val || 0,
      total_events: eventsCount?.val || 0,
      timestamp: new Date().toISOString()
    });
  });
};
