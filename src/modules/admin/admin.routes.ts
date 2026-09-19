import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { db, rawAll, currentDbDriver } from '../../db/client.js';
import {
  adminUsers,
  bannedIps,
  banAppeals,
  chatMessages,
  adminLoginLogs,
  securityNotifications,
  adminSecurityConfig,
  roadmapVotes,
  roadmapFeatures,
  roadmapMilestones,
  communityProposals,
  featureSuggestions,
  arcadeGames,
  showcasePlugins,
  showcaseThemes,
  faqItems,
  siteContent,
  siteContentI18n,
  pageViews,
  analyticsEvents
} from '../../db/schema.js';
import { eq, desc, asc, and, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/auth.service.js';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

const UPLOAD_DIR = path.resolve(process.cwd(), 'web/assets/img/uploads');

function isSafeSvg(buffer: Buffer): { safe: boolean; reason?: string } {
  const content = buffer.toString('utf-8').trim();
  if (!content.includes('<svg') || (!content.startsWith('<') && !content.startsWith('<?xml'))) {
    return { safe: false, reason: 'Format SVG non reconnu' };
  }
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /data:text\/html/i,
    /<foreignobject/i,
    /<iframe/i,
    /<embed/i,
    /<object/i,
    /onload\s*=/i,
    /onerror\s*=/i,
    /onclick\s*=/i,
    /onmouseover\s*=/i,
    /onfocus\s*=/i
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      return { safe: false, reason: 'Contenu SVG non sécurisé : balises de script ou gestionnaires d\'événements interdits' };
    }
  }
  return { safe: true };
}

async function getAuthAdmin(request: FastifyRequest) {
  const cookieToken = request.cookies['kairo_admin_session'];
  const authHeader = request.headers.authorization?.replace('Bearer ', '').trim();
  const token = cookieToken || authHeader;
  if (!token) return null;

  return (await db.select().from(adminUsers).where(eq(adminUsers.token, token)))[0] || null;
}

function hasPermission(user: typeof adminUsers.$inferSelect, perm: string): boolean {
  if (user.role === 'superadmin') return true;
  try {
    const perms = user.permissions ? JSON.parse(user.permissions) : ['all'];
    return perms.includes('all') || perms.includes(perm);
  } catch {
    return true;
  }
}

const UserDeleteSchema = z.object({
  ip_address: z.string().min(1, 'IP requise')
});

const AppealDeleteSchema = z.object({
  appeal_id: z.coerce.number(),
  hard: z.boolean().optional().default(false)
});

const VoteDeleteSchema = z.object({
  feature_id: z.coerce.number(),
  ip_address: z.string().min(1, 'IP requise')
});

const ChatSendAdminSchema = z.object({
  ip_address: z.string().min(1, 'IP requise'),
  message: z.string().min(1, 'Message requis').max(2000, 'Message trop long')
});

const SecurityConfigSchema = z.object({
  access_mode: z.enum(['all', 'local_only', 'whitelist']).default('all'),
  allowed_ips: z.string().default('127.0.0.1,::1')
});

const AppealRespondSchema = z.object({
  appeal_id: z.number(),
  action: z.enum(['accept', 'reject', 'escalate']).default('accept'),
  escalate_reason: z.string().optional()
});

const BanSaveSchema = z.object({
  ip_address: z.string().min(1, 'IP requise'),
  ban_type: z.enum(['temp', 'permanent']).default('permanent'),
  duration_hours: z.number().default(24),
  expires_at: z.string().nullable().optional(),
  block_vote: z.boolean().default(true),
  block_proposal: z.boolean().default(true),
  block_suggestion: z.boolean().default(true),
  block_all: z.boolean().default(false),
  reason: z.string().default('Non respect des règles')
});

const AdminSaveSchema = z.object({
  id: z.number().optional(),
  username: z.string().min(1, 'Identifiant requis'),
  password: z.string().optional(),
  role: z.string().default('admin'),
  permissions: z.array(z.string()).default(['all'])
});

const UploadSchema = z.object({
  file_data: z.string().min(1, 'Données de fichier requises'),
  file_name: z.string().default('image.png')
});

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. GET /api/admin/users
  fastify.get('/api/admin/users', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const allIpsQuery = sql`
      SELECT DISTINCT ip_address FROM (
        SELECT ip_address FROM page_views WHERE ip_address IS NOT NULL AND ip_address != ''
        UNION
        SELECT ip_address FROM analytics_events WHERE ip_address IS NOT NULL AND ip_address != ''
        UNION
        SELECT ip_address FROM roadmap_votes WHERE ip_address IS NOT NULL AND ip_address != ''
        UNION
        SELECT ip_address FROM community_proposals WHERE ip_address IS NOT NULL AND ip_address != ''
        UNION
        SELECT ip_address FROM feature_suggestions WHERE ip_address IS NOT NULL AND ip_address != ''
        UNION
        SELECT ip_address FROM banned_ips WHERE ip_address IS NOT NULL AND ip_address != ''
      ) AS all_ips
    `;
    const rawIps = await rawAll<{ ip_address: string }>(allIpsQuery);
    const distinctIps = Array.from(new Set(rawIps.map(r => r.ip_address).filter(Boolean)));

    const users = [];
    for (const ip of distinctIps) {
      const [vRow] = await db.select({ c: sql<number>`count(*)` }).from(pageViews).where(eq(pageViews.ipAddress, ip));
      const [eRow] = await db.select({ c: sql<number>`count(*)` }).from(analyticsEvents).where(eq(analyticsEvents.ipAddress, ip));
      const [voteRow] = await db.select({ c: sql<number>`count(*)` }).from(roadmapVotes).where(eq(roadmapVotes.ipAddress, ip));
      const [propRow] = await db.select({ c: sql<number>`count(*)` }).from(communityProposals).where(eq(communityProposals.ipAddress, ip));
      const [sugRow] = await db.select({ c: sql<number>`count(*)` }).from(featureSuggestions).where(eq(featureSuggestions.ipAddress, ip));

      const lastSeenQuery = sql`
        SELECT MAX(ts) as last_seen FROM (
          SELECT MAX(created_at) as ts FROM page_views WHERE ip_address = ${ip}
          UNION ALL
          SELECT MAX(created_at) as ts FROM analytics_events WHERE ip_address = ${ip}
          UNION ALL
          SELECT MAX(created_at) as ts FROM roadmap_votes WHERE ip_address = ${ip}
          UNION ALL
          SELECT MAX(created_at) as ts FROM community_proposals WHERE ip_address = ${ip}
          UNION ALL
          SELECT MAX(created_at) as ts FROM feature_suggestions WHERE ip_address = ${ip}
        ) AS sub
      `;
      const [lastSeenRow] = await rawAll<{ last_seen: string | null }>(lastSeenQuery);

      const propInfo = (await db.select({ author: communityProposals.author, email: communityProposals.email })
        .from(communityProposals)
        .where(eq(communityProposals.ipAddress, ip))
        .orderBy(desc(communityProposals.id))
        .limit(1))[0];

      let nickname = propInfo?.author && propInfo.author !== 'Anonyme' ? propInfo.author : null;
      const email = propInfo?.email || null;

      if (!nickname) {
        const sugInfo = (await db.select({ author: featureSuggestions.author })
          .from(featureSuggestions)
          .where(eq(featureSuggestions.ipAddress, ip))
          .orderBy(desc(featureSuggestions.id))
          .limit(1))[0];
        if (sugInfo && sugInfo.author !== 'Anonyme') nickname = sugInfo.author;
      }

      const ban = (await db.select().from(bannedIps).where(eq(bannedIps.ipAddress, ip)))[0] || null;

      const vCount = vRow?.c || 0;
      const eCount = eRow?.c || 0;

      users.push({
        ip_address: ip,
        total_connections: vCount + eCount,
        page_views: vCount,
        total_page_views: vCount,
        events_count: eCount,
        total_events: eCount,
        votes_count: voteRow?.c || 0,
        proposals_count: propRow?.c || 0,
        suggestions_count: sugRow?.c || 0,
        nickname,
        email,
        known_authors: nickname ? [nickname] : [],
        known_emails: email ? [email] : [],
        last_seen: lastSeenRow?.last_seen || null,
        is_banned: Boolean(ban),
        ban,
        ban_details: ban
      });
    }

    users.sort((a, b) => {
      const dateA = a.last_seen || '';
      const dateB = b.last_seen || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return b.total_connections - a.total_connections;
    });

    return reply.status(200).send({ status: 'ok', users, total: users.length });
  });

  // 2. GET /api/admin/users/detail
  fastify.get<{ Querystring: { ip?: string } }>('/api/admin/users/detail', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const targetIp = (request.query.ip || '').trim();
    if (!targetIp) return reply.status(400).send({ status: 'error', message: 'IP requise' });

    const ban = (await db.select().from(bannedIps).where(eq(bannedIps.ipAddress, targetIp)))[0] || null;

    const votes = (await db.select({
      id: roadmapVotes.id,
      featureId: roadmapVotes.featureId,
      createdAt: roadmapVotes.createdAt,
      userAgent: roadmapVotes.userAgent,
      titleFr: roadmapFeatures.titleFr,
      titleEn: roadmapFeatures.titleEn,
      tag: roadmapFeatures.tag
    })
      .from(roadmapVotes)
      .leftJoin(roadmapFeatures, eq(roadmapVotes.featureId, roadmapFeatures.id))
      .where(eq(roadmapVotes.ipAddress, targetIp))
      .orderBy(desc(roadmapVotes.id)))
      .map((v: any) => ({
        ...v,
        feature_title: v.titleFr || v.titleEn || ('Feature #' + v.featureId),
        feature_tag: v.tag
      }));

    const proposals = await db.select().from(communityProposals).where(eq(communityProposals.ipAddress, targetIp)).orderBy(desc(communityProposals.id));

    const suggestions = (await db.select({
      id: featureSuggestions.id,
      featureId: featureSuggestions.featureId,
      author: featureSuggestions.author,
      email: featureSuggestions.email,
      suggestionText: featureSuggestions.suggestionText,
      status: featureSuggestions.status,
      createdAt: featureSuggestions.createdAt,
      titleFr: roadmapFeatures.titleFr,
      tag: roadmapFeatures.tag
    })
      .from(featureSuggestions)
      .leftJoin(roadmapFeatures, eq(featureSuggestions.featureId, roadmapFeatures.id))
      .where(eq(featureSuggestions.ipAddress, targetIp))
      .orderBy(desc(featureSuggestions.id)))
      .map((s: any) => ({
        ...s,
        feature_title: s.titleFr || ('Feature #' + s.featureId)
      }));

    const views = await db.select().from(pageViews).where(eq(pageViews.ipAddress, targetIp)).orderBy(desc(pageViews.id)).limit(50);
    const events = await db.select().from(analyticsEvents).where(eq(analyticsEvents.ipAddress, targetIp)).orderBy(desc(analyticsEvents.id)).limit(50);
    const appeals = await db.select().from(banAppeals).where(eq(banAppeals.ipAddress, targetIp)).orderBy(desc(banAppeals.id));
    const chat = await db.select().from(chatMessages).where(eq(chatMessages.ipAddress, targetIp)).orderBy(asc(chatMessages.id)).limit(200);
    const loginLogs = await db.select().from(adminLoginLogs).where(eq(adminLoginLogs.ipAddress, targetIp)).orderBy(desc(adminLoginLogs.id)).limit(20);

    let lastSeen: string | null = null;
    for (const pool of [views, events, votes, proposals, suggestions, appeals, chat]) {
      for (const row of pool as any[]) {
        const ts = row.createdAt;
        if (ts && (!lastSeen || ts > lastSeen)) lastSeen = ts;
      }
    }

    const history: Array<{ path: string; page_title: string; viewed_at: string | null }> = [];
    for (const vw of views) {
      history.push({
        path: vw.page || '/',
        page_title: vw.referrer ? ('Réf: ' + vw.referrer) : 'Page vue',
        viewed_at: vw.createdAt
      });
    }
    for (const ev of events) {
      history.push({
        path: ev.page || '/',
        page_title: (ev.eventType + ': ' + ev.target),
        viewed_at: ev.createdAt
      });
    }
    history.sort((a, b) => (b.viewed_at || '').localeCompare(a.viewed_at || ''));

    return reply.status(200).send({
      status: 'ok',
      ip: targetIp,
      ban,
      is_banned: Boolean(ban),
      ban_details: ban,
      last_seen: lastSeen,
      votes,
      proposals,
      suggestions,
      recent_views: views,
      recent_events: events,
      history: history.slice(0, 50),
      appeals,
      chat,
      login_logs: loginLogs
    });
  });

  // 3. GET /api/admin/chat
  fastify.get<{ Querystring: { ip?: string } }>('/api/admin/chat', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const targetIp = (request.query.ip || '').trim();
    if (!targetIp) return reply.status(400).send({ status: 'error', message: 'IP requise' });

    const msgs = await db.select().from(chatMessages).where(eq(chatMessages.ipAddress, targetIp)).orderBy(asc(chatMessages.id)).limit(200);

    await db.update(chatMessages)
      .set({ isRead: 1 })
      .where(and(eq(chatMessages.ipAddress, targetIp), eq(chatMessages.sender, 'visitor')));

    return reply.status(200).send({ status: 'ok', ip: targetIp, messages: msgs });
  });

  // 4. GET /api/admin/features/votes
  fastify.get<{ Querystring: { feature_id?: string } }>('/api/admin/features/votes', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const fid = Number(request.query.feature_id);
    if (!fid) return reply.status(400).send({ status: 'error', message: 'ID requis' });

    const feature = (await db.select().from(roadmapFeatures).where(eq(roadmapFeatures.id, fid)))[0];
    if (!feature) return reply.status(404).send({ status: 'error', message: 'Fonctionnalité introuvable' });

    const votes = await db.select({
      id: roadmapVotes.id,
      featureId: roadmapVotes.featureId,
      ipAddress: roadmapVotes.ipAddress,
      userAgent: roadmapVotes.userAgent,
      createdAt: roadmapVotes.createdAt,
      banType: bannedIps.banType,
      blockVote: bannedIps.blockVote,
      expiresAt: bannedIps.expiresAt,
      banReason: bannedIps.reason
    })
      .from(roadmapVotes)
      .leftJoin(bannedIps, eq(roadmapVotes.ipAddress, bannedIps.ipAddress))
      .where(eq(roadmapVotes.featureId, fid))
      .orderBy(desc(roadmapVotes.id));

    return reply.status(200).send({
      status: 'ok',
      feature,
      votes,
      total_votes: votes.length
    });
  });

  // 5. GET /api/admin/appeals
  fastify.get('/api/admin/appeals', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const appeals = await db.select().from(banAppeals).orderBy(desc(banAppeals.id));
    return reply.status(200).send({ status: 'ok', appeals });
  });

  // 6. GET /api/admin/security/config
  fastify.get('/api/admin/security/config', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const row = (await db.select().from(adminSecurityConfig).where(eq(adminSecurityConfig.id, 1)))[0];
    return reply.status(200).send({
      status: 'ok',
      access_mode: row?.accessMode || 'all',
      allowed_ips: row?.allowedIps || '127.0.0.1,::1',
      client_ip: request.ip || '127.0.0.1'
    });
  });

  // 7. GET /api/admin/admins
  fastify.get('/api/admin/admins', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });
    if (!hasPermission(admin, 'settings')) return reply.status(403).send({ status: 'unauthorized' });

    const admins = (await db.select({
      id: adminUsers.id,
      username: adminUsers.username,
      role: adminUsers.role,
      permissions: adminUsers.permissions,
      lastLogin: adminUsers.lastLogin,
      lastIp: adminUsers.lastIp,
      createdAt: adminUsers.createdAt
    }).from(adminUsers).orderBy(asc(adminUsers.id))).map((a: any) => {
      let perms = ['all'];
      try {
        if (a.permissions) perms = JSON.parse(a.permissions);
      } catch {}
      return { ...a, permissions: perms };
    });

    return reply.status(200).send({ status: 'ok', admins });
  });

  // 8. GET /api/admin/audit-logs
  fastify.get('/api/admin/audit-logs', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });
    if (!hasPermission(admin, 'settings')) return reply.status(403).send({ status: 'unauthorized' });

    const logs = await db.select().from(adminLoginLogs).orderBy(desc(adminLoginLogs.id)).limit(150);
    return reply.status(200).send({ status: 'ok', logs });
  });

  // 9. GET /api/admin/notifications
  fastify.get('/api/admin/notifications', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const notifs = await db.select().from(securityNotifications).orderBy(desc(securityNotifications.id)).limit(50);
    const [unread] = await db.select({ c: sql<number>`count(*)` }).from(securityNotifications).where(eq(securityNotifications.isRead, 0));

    return reply.status(200).send({ status: 'ok', notifications: notifs, unread_count: unread?.c || 0 });
  });

  // 10. GET /api/admin/bans
  fastify.get('/api/admin/bans', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const bans = await db.select().from(bannedIps).orderBy(desc(bannedIps.id));

    const knownIpsQuery = sql`
      SELECT ip_address, count(*) as count, 'vote' as origin FROM roadmap_votes WHERE ip_address IS NOT NULL GROUP BY ip_address
      UNION
      SELECT ip_address, count(*) as count, 'proposal' as origin FROM community_proposals WHERE ip_address IS NOT NULL GROUP BY ip_address
      UNION
      SELECT ip_address, count(*) as count, 'suggestion' as origin FROM feature_suggestions WHERE ip_address IS NOT NULL GROUP BY ip_address
      ORDER BY count DESC LIMIT 100
    `;
    const knownIps = await rawAll<{ ip_address: string; count: number; origin: string }>(knownIpsQuery);

    return reply.status(200).send({ status: 'ok', bans, known_ips: knownIps });
  });

  // 11. POST /api/admin/users/delete
  fastify.post('/api/admin/users/delete', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = UserDeleteSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Adresse IP requise' });

    const targetIp = parse.data.ip_address;

    await db.delete(pageViews).where(eq(pageViews.ipAddress, targetIp));
    await db.delete(analyticsEvents).where(eq(analyticsEvents.ipAddress, targetIp));
    await db.delete(roadmapVotes).where(eq(roadmapVotes.ipAddress, targetIp));
    await db.delete(communityProposals).where(eq(communityProposals.ipAddress, targetIp));
    await db.delete(featureSuggestions).where(eq(featureSuggestions.ipAddress, targetIp));
    await db.delete(bannedIps).where(eq(bannedIps.ipAddress, targetIp));
    await db.delete(banAppeals).where(eq(banAppeals.ipAddress, targetIp));
    await db.delete(chatMessages).where(eq(chatMessages.ipAddress, targetIp));

    const allFeatures = await db.select({ id: roadmapFeatures.id }).from(roadmapFeatures);
    for (const f of allFeatures) {
      const [c] = await db.select({ val: sql<number>`count(*)` }).from(roadmapVotes).where(eq(roadmapVotes.featureId, f.id));
      await db.update(roadmapFeatures).set({ votesCount: c?.val || 0 }).where(eq(roadmapFeatures.id, f.id));
    }

    return reply.status(200).send({
      status: 'ok',
      message: ('Utilisateur ' + targetIp + ' supprimé définitivement.')
    });
  });

  // 12. POST /api/admin/appeals/delete
  fastify.post('/api/admin/appeals/delete', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = AppealDeleteSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID requis' });

    if (parse.data.hard) {
      await db.delete(banAppeals).where(eq(banAppeals.id, parse.data.appeal_id));
    } else {
      await db.update(banAppeals).set({ archived: 1 }).where(eq(banAppeals.id, parse.data.appeal_id));
    }

    return reply.status(200).send({ status: 'ok', message: 'Recours supprimé du panel.' });
  });

  // 13. POST /api/admin/votes/delete
  fastify.post('/api/admin/votes/delete', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = VoteDeleteSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'feature_id et ip_address requis' });

    const { feature_id, ip_address } = parse.data;
    await db.delete(roadmapVotes).where(and(eq(roadmapVotes.featureId, feature_id), eq(roadmapVotes.ipAddress, ip_address)));

    const [c] = await db.select({ val: sql<number>`count(*)` }).from(roadmapVotes).where(eq(roadmapVotes.featureId, feature_id));
    await db.update(roadmapFeatures).set({ votesCount: c?.val || 0 }).where(eq(roadmapFeatures.id, feature_id));

    return reply.status(200).send({ status: 'ok', message: 'Vote révoqué.' });
  });

  // 14. POST /api/admin/chat/send
  fastify.post('/api/admin/chat/send', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = ChatSendAdminSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });

    await db.insert(chatMessages).values({
      ipAddress: parse.data.ip_address,
      sender: 'admin',
      message: parse.data.message,
      isRead: 0
    });

    return reply.status(200).send({ status: 'ok', message: 'Message envoyé au visiteur.' });
  });

  // 15. POST /api/admin/security/config
  fastify.post('/api/admin/security/config', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = SecurityConfigSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Configuration invalide' });

    await db.insert(adminSecurityConfig).values({
      id: 1,
      accessMode: parse.data.access_mode,
      allowedIps: parse.data.allowed_ips
    }).onConflictDoUpdate({
      target: adminSecurityConfig.id,
      set: {
        accessMode: parse.data.access_mode,
        allowedIps: parse.data.allowed_ips
      }
    });

    return reply.status(200).send({ status: 'ok', message: 'Politique de restriction d accès IP mise à jour avec succès.' });
  });

  // 16. POST /api/admin/appeals/respond
  fastify.post('/api/admin/appeals/respond', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = AppealRespondSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Données invalides' });

    const { appeal_id, action, escalate_reason } = parse.data;
    const appeal = (await db.select().from(banAppeals).where(eq(banAppeals.id, appeal_id)))[0];
    if (!appeal || !appeal.ipAddress) return reply.status(404).send({ status: 'error', message: 'Recours introuvable' });

    const targetIp = appeal.ipAddress;

    if (action === 'escalate') {
      if (!escalate_reason) return reply.status(400).send({ status: 'error', message: 'La raison de la sur-sanction est obligatoire.' });

      await db.update(banAppeals).set({ status: 'escalated', adminResponse: escalate_reason }).where(eq(banAppeals.id, appeal_id));

      await db.insert(bannedIps).values({
        ipAddress: targetIp,
        banType: 'permanent',
        expiresAt: null,
        blockVote: 1,
        blockProposal: 1,
        blockSuggestion: 1,
        blockAll: 1,
        reason: ('Sur-sanction (recours abusif) : ' + escalate_reason)
      }).onConflictDoUpdate({
        target: bannedIps.ipAddress,
        set: {
          banType: 'permanent',
          expiresAt: null,
          blockVote: 1,
          blockProposal: 1,
          blockSuggestion: 1,
          blockAll: 1,
          reason: ('Sur-sanction (recours abusif) : ' + escalate_reason)
        }
      });

      return reply.status(200).send({
        status: 'ok',
        message: ('Recours abusif : adresse IP ' + targetIp + ' sur-sanctionnée.')
      });
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    await db.update(banAppeals).set({ status: newStatus }).where(eq(banAppeals.id, appeal_id));

    if (action === 'accept') {
      await db.delete(bannedIps).where(eq(bannedIps.ipAddress, targetIp));
      return reply.status(200).send({ status: 'ok', message: ('Recours accepté pour ' + targetIp) });
    }

    return reply.status(200).send({ status: 'ok', message: ('Recours rejeté pour ' + targetIp) });
  });

  // 17. POST /api/admin/bans/save
  fastify.post('/api/admin/bans/save', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = BanSaveSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });

    const d = parse.data;
    let expiresAt = d.expires_at;
    if (d.ban_type === 'temp' && !expiresAt) {
      expiresAt = new Date(Date.now() + d.duration_hours * 3600 * 1000).toISOString();
    } else if (d.ban_type === 'permanent') {
      expiresAt = null;
    }

    await db.insert(bannedIps).values({
      ipAddress: d.ip_address,
      banType: d.ban_type,
      expiresAt,
      blockVote: d.block_vote ? 1 : 0,
      blockProposal: d.block_proposal ? 1 : 0,
      blockSuggestion: d.block_suggestion ? 1 : 0,
      blockAll: d.block_all ? 1 : 0,
      reason: d.reason
    }).onConflictDoUpdate({
      target: bannedIps.ipAddress,
      set: {
        banType: d.ban_type,
        expiresAt,
        blockVote: d.block_vote ? 1 : 0,
        blockProposal: d.block_proposal ? 1 : 0,
        blockSuggestion: d.block_suggestion ? 1 : 0,
        blockAll: d.block_all ? 1 : 0,
        reason: d.reason,
        createdAt: sql`CURRENT_TIMESTAMP`
      }
    });

    return reply.status(200).send({ status: 'ok', message: ('Bannissement appliqué avec succès pour ' + d.ip_address) });
  });

  // 18. POST /api/admin/admins/save
  fastify.post('/api/admin/admins/save', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin || !hasPermission(admin, 'settings')) {
      return reply.status(403).send({ status: 'error', message: 'Permission insuffisante pour gérer les comptes administrateurs.' });
    }

    const parse = AdminSaveSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });

    const { id, username, password, role, permissions } = parse.data;
    const permsJson = JSON.stringify(permissions);

    if (id) {
      if (password) {
        const pwdHash = await hashPassword(password);
        await db.update(adminUsers).set({
          username,
          passwordHash: pwdHash,
          role,
          permissions: permsJson
        }).where(eq(adminUsers.id, id));
      } else {
        await db.update(adminUsers).set({
          username,
          role,
          permissions: permsJson
        }).where(eq(adminUsers.id, id));
      }
      return reply.status(200).send({ status: 'ok', message: ('Compte administrateur mis à jour: ' + username) });
    } else {
      if (!password) return reply.status(400).send({ status: 'error', message: 'Le mot de passe est obligatoire pour un nouveau compte.' });
      const pwdHash = await hashPassword(password);
      try {
        await db.insert(adminUsers).values({
          username,
          passwordHash: pwdHash,
          role,
          permissions: permsJson
        });
        return reply.status(200).send({ status: 'ok', message: ('Compte administrateur créé: ' + username) });
      } catch {
        return reply.status(400).send({ status: 'error', message: 'Cet identifiant est déjà utilisé.' });
      }
    }
  });

  // 19. POST /api/admin/admins/delete
  fastify.post('/api/admin/admins/delete', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin || !hasPermission(admin, 'settings')) {
      return reply.status(403).send({ status: 'error', message: 'Permission insuffisante.' });
    }

    const parse = z.object({ id: z.number() }).safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID requis' });

    if (admin.id === parse.data.id) {
      return reply.status(400).send({ status: 'error', message: 'Vous ne pouvez pas supprimer votre propre compte actif.' });
    }

    const target = (await db.select().from(adminUsers).where(eq(adminUsers.id, parse.data.id)))[0];
    if (target?.username === 'admin') {
      return reply.status(400).send({ status: 'error', message: 'Le compte superadministrateur principal admin ne peut pas être supprimé.' });
    }

    await db.delete(adminUsers).where(eq(adminUsers.id, parse.data.id));
    return reply.status(200).send({ status: 'ok', message: 'Compte administrateur supprimé.' });
  });

  // 20. POST /api/admin/bans/delete
  fastify.post('/api/admin/bans/delete', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'error', message: 'Non autorisé.' });

    const parse = z.object({
      id: z.number().optional(),
      ip_address: z.string().optional()
    }).safeParse(request.body);

    if (!parse.success || (!parse.data.id && !parse.data.ip_address)) {
      return reply.status(400).send({ status: 'error', message: 'ID ou IP manquant' });
    }

    if (parse.data.id) {
      await db.delete(bannedIps).where(eq(bannedIps.id, parse.data.id));
    } else if (parse.data.ip_address) {
      await db.delete(bannedIps).where(eq(bannedIps.ipAddress, parse.data.ip_address));
    }

    return reply.status(200).send({ status: 'ok', message: 'Bannissement levé avec succès !' });
  });

  // 21. POST /api/upload
  fastify.post('/api/upload', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });

    let buffer: Buffer;
    let originalName = 'upload.png';

    if (request.isMultipart()) {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ status: 'error', message: 'Fichier requis' });
      }
      buffer = await file.toBuffer();
      originalName = file.filename || 'upload.png';
    } else {
      const parse = UploadSchema.safeParse(request.body);
      if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Fichier requis' });

      const { file_data, file_name } = parse.data;
      const cleanData = file_data.includes(',') ? file_data.split(',')[1]! : file_data;
      buffer = Buffer.from(cleanData, 'base64');
      originalName = file_name || 'upload.png';
    }

    if (buffer.length === 0) {
      return reply.status(400).send({ status: 'error', message: 'Fichier vide' });
    }
    if (buffer.length > 15 * 1024 * 1024) {
      return reply.status(400).send({ status: 'error', message: 'Fichier trop volumineux (max 15MB)' });
    }

    const detected = await fileTypeFromBuffer(buffer);
    const ext = path.extname(originalName).toLowerCase();

    let finalMime = detected?.mime;
    let finalExt = detected ? `.${detected.ext}` : ext;
    let finalBuffer = buffer;
    let imgMeta: { width?: number; height?: number } | undefined;

    const allowedMimes = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/x-icon',
      'image/vnd.microsoft.icon',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/x-wav'
    ];

    if (ext === '.svg' || finalMime === 'image/svg+xml') {
      const svgCheck = isSafeSvg(buffer);
      if (!svgCheck.safe) {
        return reply.status(400).send({ status: 'error', message: svgCheck.reason || 'SVG non autorisé' });
      }
      finalMime = 'image/svg+xml';
      finalExt = '.svg';
    } else {
      if (!detected || !allowedMimes.includes(detected.mime)) {
        return reply.status(400).send({ status: 'error', message: 'Type de fichier non autorisé ou corrompu.' });
      }

      // Process and optimize images with Sharp
      if (detected.mime.startsWith('image/') && !detected.mime.includes('icon')) {
        try {
          const image = sharp(buffer);
          const metadata = await image.metadata();
          if (!metadata.format) {
            return reply.status(400).send({ status: 'error', message: 'Image non valide ou corrompue' });
          }

          image.rotate(); // auto-orient based on EXIF before stripping metadata
          if ((metadata.width && metadata.width > 2560) || (metadata.height && metadata.height > 2560)) {
            image.resize(2560, 2560, { fit: 'inside', withoutEnlargement: true });
          }

          finalBuffer = await image.toBuffer();
          finalExt = `.${metadata.format}`;
          imgMeta = { width: metadata.width, height: metadata.height };
        } catch {
          return reply.status(400).send({ status: 'error', message: 'Impossible de traiter l\'image (fichier corrompu)' });
        }
      }
    }

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const safeBaseName = path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'upload';
    const safeName = `${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(4).toString('hex')}_${safeBaseName}${finalExt}`;
    const targetPath = path.join(UPLOAD_DIR, safeName);
    fs.writeFileSync(targetPath, finalBuffer);

    return reply.status(200).send({
      status: 'ok',
      url: `assets/img/uploads/${safeName}`,
      file_name: safeName,
      size: finalBuffer.length,
      mime: finalMime,
      width: imgMeta?.width,
      height: imgMeta?.height
    });
  });

  // 22. POST /api/admin/pages/publish (Sauvegarde en dur dans les fichiers HTML et SQLite)
  fastify.post('/api/admin/pages/publish', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });

    const PublishSchema = z.object({
      page: z.enum(['home', 'themes', 'plugins', 'roadmap']),
      lang: z.enum(['fr', 'en']).default('fr'),
      content: z.record(z.string(), z.string()).default({}),
      html_override: z.string().optional()
    });

    const parse = PublishSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: 'Données invalides pour la publication' });
    }

    const { page, lang, content, html_override } = parse.data;

    // Fichier HTML cible
    const pageFiles: Record<string, string> = {
      home: 'web/index.html',
      themes: 'web/themes/index.html',
      plugins: 'web/plugins/index.html',
      roadmap: 'web/roadmap/index.html'
    };

    const targetRelative = pageFiles[page];
    if (!targetRelative) {
      return reply.status(400).send({ status: 'error', message: 'Page inconnue' });
    }

    const filePath = path.resolve(process.cwd(), targetRelative);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ status: 'error', message: `Fichier ${targetRelative} introuvable` });
    }

    // A. Backup de sécurité automatique dans data/backups/
    const backupDir = path.resolve(process.cwd(), 'data/backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${page}_${timestamp}.html.bak`);
    fs.copyFileSync(filePath, backupPath);

    // B. Mise à jour de la base SQLite pour synchronisation API
    for (const [k, v] of Object.entries(content)) {
      db.run(sql`
        INSERT INTO site_content_i18n (content_key, lang, content_value, updated_at)
        VALUES (${k}, ${lang}, ${v}, CURRENT_TIMESTAMP)
        ON CONFLICT(content_key, lang) DO UPDATE SET
          content_value = ${v},
          updated_at = CURRENT_TIMESTAMP
      `);
    }

    // C. Modification en dur du fichier HTML
    let fileContent = fs.readFileSync(filePath, 'utf-8');

    if (html_override && html_override.trim().length > 100) {
      // Si une version complète du HTML éditée a été transmise
      fileContent = html_override;
    } else {
      // Remplacement en dur des éléments data-content-key dans le fichier HTML
      for (const [key, val] of Object.entries(content)) {
        // Remplacement pour data-content-key="..."
        const regexWithContentKey = new RegExp(
          `(<([a-zA-Z0-9]+)[^>]*data-content-key=["']${key}["'][^>]*>)([\\s\\S]*?)(<\\/\\2>)`,
          'gi'
        );

        if (regexWithContentKey.test(fileContent)) {
          fileContent = fileContent.replace(
            regexWithContentKey,
            (_match, openTag, _tag, _oldContent, closeTag) => {
              // Mettre à jour aussi l'attribut de langue si présent (ex: data-fr="..." ou data-en="...")
              let updatedOpenTag = openTag;
              const langAttr = lang === 'en' ? 'data-en' : 'data-fr';
              const cleanVal = String(val).replace(/"/g, '&quot;');
              if (new RegExp(`${langAttr}=["'][^"']*["']`, 'i').test(updatedOpenTag)) {
                updatedOpenTag = updatedOpenTag.replace(
                  new RegExp(`${langAttr}=["'][^"']*["']`, 'i'),
                  `${langAttr}="${cleanVal}"`
                );
              }
              return `${updatedOpenTag}${val}${closeTag}`;
            }
          );
        }
      }
    }

    // Sauvegarde en dur sur le disque
    fs.writeFileSync(filePath, fileContent, 'utf-8');

    return reply.status(200).send({
      status: 'ok',
      message: `Page ${page} sauvegardée et publiée en dur avec succès !`,
      backup: path.basename(backupPath)
    });
  });

  // =========================================================================
  // GESTION DES DONNÉES & EXPIRATION RGPD (Art. 5.1.e & ePrivacy)
  // =========================================================================

  // Helper pour vérifier l'expiration
  function isRecordExpired(dateStr: string | null | undefined, cutoffIso: string): boolean {
    if (!dateStr) return false;
    const t = new Date(dateStr.replace(' ', 'T')).getTime();
    return !isNaN(t) && t < new Date(cutoffIso).getTime();
  }

  // 1. GET /api/admin/data/retention : État de conservation et calendrier d'expiration
  fastify.get('/api/admin/data/retention', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const [pvRow] = await rawAll<{ c: string | number; min_date: string | null }>(sql`
      SELECT COUNT(*) as c, MIN(created_at) as min_date FROM page_views
    `);
    const [aeRow] = await rawAll<{ c: string | number; min_date: string | null }>(sql`
      SELECT COUNT(*) as c, MIN(created_at) as min_date FROM analytics_events
    `);
    const analyticsCount = Number(pvRow?.c || 0) + Number(aeRow?.c || 0);
    const oldestAnalytics = [pvRow?.min_date, aeRow?.min_date].filter(Boolean).sort()[0] || null;

    const [allRow] = await rawAll<{ c: string | number; min_date: string | null }>(sql`
      SELECT COUNT(*) as c, MIN(created_at) as min_date FROM admin_login_logs
    `);
    const [snRow] = await rawAll<{ c: string | number; min_date: string | null }>(sql`
      SELECT COUNT(*) as c, MIN(created_at) as min_date FROM security_notifications
    `);
    const logsCount = Number(allRow?.c || 0) + Number(snRow?.c || 0);
    const oldestLogs = [allRow?.min_date, snRow?.min_date].filter(Boolean).sort()[0] || null;

    const [baRow] = await rawAll<{ c: string | number; min_date: string | null }>(sql`
      SELECT COUNT(*) as c, MIN(created_at) as min_date FROM ban_appeals
    `);
    const [cmRow] = await rawAll<{ c: string | number; min_date: string | null }>(sql`
      SELECT COUNT(*) as c, MIN(created_at) as min_date FROM chat_messages
    `);
    const appealsCount = Number(baRow?.c || 0) + Number(cmRow?.c || 0);
    const oldestAppeals = [baRow?.min_date, cmRow?.min_date].filter(Boolean).sort()[0] || null;

    const [rvRow] = await rawAll<{ c: string | number; min_date: string | null }>(sql`
      SELECT COUNT(*) as c, MIN(created_at) as min_date FROM roadmap_votes
    `);
    const [fsRow] = await rawAll<{ c: string | number; min_date: string | null }>(sql`
      SELECT COUNT(*) as c, MIN(created_at) as min_date FROM feature_suggestions
    `);
    const [cpRow] = await rawAll<{ c: string | number; min_date: string | null }>(sql`
      SELECT COUNT(*) as c, MIN(created_at) as min_date FROM community_proposals
    `);
    const communityCount = Number(rvRow?.c || 0) + Number(fsRow?.c || 0) + Number(cpRow?.c || 0);
    const oldestCommunity = [rvRow?.min_date, fsRow?.min_date, cpRow?.min_date].filter(Boolean).sort()[0] || null;

    function computeStats(count: number, oldest: string | null, days: number) {
      if (!oldest || count === 0) {
        return { total_records: count, oldest_record: null, next_expiration: null, days_remaining: null };
      }
      const t = new Date(oldest.replace(' ', 'T')).getTime();
      if (isNaN(t)) {
        return { total_records: count, oldest_record: oldest, next_expiration: null, days_remaining: null };
      }
      const exp = t + days * 86400 * 1000;
      const remaining = Math.max(0, Math.ceil((exp - Date.now()) / (86400 * 1000)));
      return {
        total_records: count,
        oldest_record: oldest,
        next_expiration: new Date(exp).toISOString().replace('T', ' ').substring(0, 19),
        days_remaining: remaining
      };
    }

    return reply.send({
      status: 'ok',
      retention: [
        {
          key: 'analytics',
          label: 'Audience & Pages Vues',
          category: 'Statistiques',
          legal_basis: 'Art. 5.1.e RGPD & ePrivacy (13 mois max)',
          stated_duration: '13 mois légal',
          effective_days: 395,
          ...computeStats(analyticsCount, oldestAnalytics, 395)
        },
        {
          key: 'logs',
          label: 'Journaux de Connexion Admin',
          category: 'Sécurité',
          legal_basis: 'Art. 6.1.f RGPD (Intérêt Légitime)',
          stated_duration: '6 mois légal',
          effective_days: 180,
          ...computeStats(logsCount, oldestLogs, 180)
        },
        {
          key: 'appeals',
          label: 'Recours & Messages Sanctions',
          category: 'Modération',
          legal_basis: "Droit d'opposition RGPD Art. 21",
          stated_duration: '18 mois max',
          effective_days: 540,
          ...computeStats(appealsCount, oldestAppeals, 540)
        },
        {
          key: 'community',
          label: 'Votes & Suggestions Roadmap',
          category: 'Communauté',
          legal_basis: 'Consentement & Participation active',
          stated_duration: '12 mois',
          effective_days: 365,
          ...computeStats(communityCount, oldestCommunity, 365)
        }
      ]
    });
  });

  // 2. GET /api/admin/data/backup : Téléchargement archive JSON filtrée RGPD (sans données périmées)
  fastify.get('/api/admin/data/backup', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });
    if (!hasPermission(admin, 'settings')) return reply.status(403).send({ status: 'forbidden' });

    const now = Date.now();
    const cutoffs = {
      analytics: new Date(now - 395 * 86400 * 1000).toISOString(),
      logs: new Date(now - 180 * 86400 * 1000).toISOString(),
      appeals: new Date(now - 540 * 86400 * 1000).toISOString(),
      community: new Date(now - 365 * 86400 * 1000).toISOString()
    };

    const [
      allPageViews,
      allAnalyticsEvents,
      allLoginLogs,
      allSecNotifs,
      allAppeals,
      allChat,
      allVotes,
      allSuggestions,
      allProposals,
      allBans,
      allFeatures,
      allMilestones,
      allArcade,
      allPlugins,
      allThemes,
      allFaq,
      allSiteContent,
      allSiteContentI18n,
      allSecConfig,
      allAdmins
    ] = await Promise.all([
      db.select().from(pageViews),
      db.select().from(analyticsEvents),
      db.select().from(adminLoginLogs),
      db.select().from(securityNotifications),
      db.select().from(banAppeals),
      db.select().from(chatMessages),
      db.select().from(roadmapVotes),
      db.select().from(featureSuggestions),
      db.select().from(communityProposals),
      db.select().from(bannedIps),
      db.select().from(roadmapFeatures),
      db.select().from(roadmapMilestones),
      db.select().from(arcadeGames),
      db.select().from(showcasePlugins),
      db.select().from(showcaseThemes),
      db.select().from(faqItems),
      db.select().from(siteContent),
      db.select().from(siteContentI18n),
      db.select().from(adminSecurityConfig),
      db.select({
        id: adminUsers.id,
        username: adminUsers.username,
        role: adminUsers.role,
        permissions: adminUsers.permissions,
        createdAt: adminUsers.createdAt
      }).from(adminUsers)
    ]);

    // Filtrage strict : Ne JAMAIS inclure les données antérieures au délai légal RGPD
    const backupPayload = {
      metadata: {
        system: 'KaïroOS Platform',
        version: '1.0',
        exported_at: new Date().toISOString(),
        rgpd_filter_applied: true,
        retention_rules: {
          analytics_days: 395,
          logs_days: 180,
          appeals_days: 540,
          community_days: 365
        }
      },
      tables: {
        site_content: allSiteContent,
        site_content_i18n: allSiteContentI18n,
        roadmap_features: allFeatures,
        roadmap_milestones: allMilestones,
        arcade_games: allArcade,
        showcase_plugins: allPlugins,
        showcase_themes: allThemes,
        faq_items: allFaq,
        admin_security_config: allSecConfig,
        admin_users: allAdmins,
        banned_ips: allBans,
        roadmap_votes: allVotes.filter((r: any) => !isRecordExpired(r.createdAt, cutoffs.community)),
        feature_suggestions: allSuggestions.filter((r: any) => !isRecordExpired(r.createdAt, cutoffs.community)),
        community_proposals: allProposals.filter((r: any) => !isRecordExpired(r.createdAt, cutoffs.community)),
        page_views: allPageViews.filter((r: any) => !isRecordExpired(r.createdAt, cutoffs.analytics)),
        analytics_events: allAnalyticsEvents.filter((r: any) => !isRecordExpired(r.createdAt, cutoffs.analytics)),
        admin_login_logs: allLoginLogs.filter((r: any) => !isRecordExpired(r.createdAt, cutoffs.logs)),
        security_notifications: allSecNotifs.filter((r: any) => !isRecordExpired(r.createdAt, cutoffs.logs)),
        ban_appeals: allAppeals.filter((r: any) => !isRecordExpired(r.createdAt, cutoffs.appeals)),
        chat_messages: allChat.filter((r: any) => !isRecordExpired(r.createdAt, cutoffs.appeals))
      }
    };

    const dateSlug = new Date().toISOString().slice(0, 10);
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="kairo-backup-${dateSlug}.json"`);
    return reply.send(backupPayload);
  });

  // 3. POST /api/admin/data/restore : Restauration archive JSON avec purge automatique des expirés
  fastify.post('/api/admin/data/restore', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });
    if (!hasPermission(admin, 'settings')) return reply.status(403).send({ status: 'forbidden' });

    let body = request.body as any;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return reply.status(400).send({ status: 'error', message: 'Fichier JSON invalide.' }); }
    }
    const tables = body?.tables || body;
    if (!tables || typeof tables !== 'object') {
      return reply.status(400).send({ status: 'error', message: 'Format d archive JSON invalide : objet tables introuvable.' });
    }

    const now = Date.now();
    const cutoffsIso = {
      analytics: new Date(now - 395 * 86400 * 1000).toISOString(),
      logs: new Date(now - 180 * 86400 * 1000).toISOString(),
      appeals: new Date(now - 540 * 86400 * 1000).toISOString(),
      community: new Date(now - 365 * 86400 * 1000).toISOString()
    };
    const cutoffsSql = {
      analytics: cutoffsIso.analytics.replace('T', ' ').substring(0, 19),
      logs: cutoffsIso.logs.replace('T', ' ').substring(0, 19),
      appeals: cutoffsIso.appeals.replace('T', ' ').substring(0, 19),
      community: cutoffsIso.community.replace('T', ' ').substring(0, 19)
    };

    // A. Nettoyage préventif immédiat de la base active de tout élément périmé
    await Promise.all([
      rawAll(sql`DELETE FROM page_views WHERE substr(created_at, 1, 19) < ${cutoffsSql.analytics}`),
      rawAll(sql`DELETE FROM analytics_events WHERE substr(created_at, 1, 19) < ${cutoffsSql.analytics}`),
      rawAll(sql`DELETE FROM admin_login_logs WHERE substr(created_at, 1, 19) < ${cutoffsSql.logs}`),
      rawAll(sql`DELETE FROM security_notifications WHERE substr(created_at, 1, 19) < ${cutoffsSql.logs}`),
      rawAll(sql`DELETE FROM ban_appeals WHERE substr(created_at, 1, 19) < ${cutoffsSql.appeals}`),
      rawAll(sql`DELETE FROM chat_messages WHERE substr(created_at, 1, 19) < ${cutoffsSql.appeals}`),
      rawAll(sql`DELETE FROM roadmap_votes WHERE substr(created_at, 1, 19) < ${cutoffsSql.community}`),
      rawAll(sql`DELETE FROM feature_suggestions WHERE substr(created_at, 1, 19) < ${cutoffsSql.community}`),
      rawAll(sql`DELETE FROM community_proposals WHERE substr(created_at, 1, 19) < ${cutoffsSql.community}`)
    ]);

    let expiredSkipped = 0;
    const restoredCounts: Record<string, number> = {};

    // B. Importation sécurisée en ignorant tout élément du fichier qui aurait dépassé la durée légale
    if (Array.isArray(tables.page_views)) {
      const valid = tables.page_views.filter((r: any) => {
        const d = r.createdAt || r.created_at;
        if (isRecordExpired(d, cutoffsIso.analytics)) { expiredSkipped++; return false; }
        return true;
      });
      for (const row of valid) {
        await db.insert(pageViews).values({
          page: row.page,
          sessionId: row.sessionId || row.session_id,
          referrer: row.referrer,
          ipAddress: row.ipAddress || row.ip_address,
          os: row.os,
          browser: row.browser,
          device: row.device,
          durationSeconds: row.durationSeconds || row.duration_seconds || 0,
          createdAt: row.createdAt || row.created_at
        }).catch(() => {});
      }
      restoredCounts.page_views = valid.length;
    }

    if (Array.isArray(tables.analytics_events)) {
      const valid = tables.analytics_events.filter((r: any) => {
        const d = r.createdAt || r.created_at;
        if (isRecordExpired(d, cutoffsIso.analytics)) { expiredSkipped++; return false; }
        return true;
      });
      for (const row of valid) {
        await db.insert(analyticsEvents).values({
          eventType: row.eventType || row.event_type,
          target: row.target,
          page: row.page,
          sessionId: row.sessionId || row.session_id,
          metaJson: typeof row.metaJson === 'object' ? JSON.stringify(row.metaJson) : (row.metaJson || row.meta_json),
          ipAddress: row.ipAddress || row.ip_address,
          os: row.os,
          browser: row.browser,
          device: row.device,
          durationSeconds: row.durationSeconds || row.duration_seconds || 0,
          createdAt: row.createdAt || row.created_at
        }).catch(() => {});
      }
      restoredCounts.analytics_events = valid.length;
    }

    if (Array.isArray(tables.banned_ips)) {
      for (const row of tables.banned_ips) {
        await db.insert(bannedIps).values({
          ipAddress: row.ipAddress || row.ip_address,
          banType: row.banType || row.ban_type || 'permanent',
          expiresAt: row.expiresAt || row.expires_at,
          blockVote: row.blockVote ?? row.block_vote ?? 1,
          blockProposal: row.blockProposal ?? row.block_proposal ?? 1,
          blockSuggestion: row.blockSuggestion ?? row.block_suggestion ?? 1,
          blockAll: row.blockAll ?? row.block_all ?? 0,
          reason: row.reason || 'Import sauvegarde',
          createdAt: row.createdAt || row.created_at
        }).onConflictDoNothing().catch(() => {});
      }
      restoredCounts.banned_ips = tables.banned_ips.length;
    }

    if (Array.isArray(tables.roadmap_votes)) {
      const valid = tables.roadmap_votes.filter((r: any) => {
        const d = r.createdAt || r.created_at;
        if (isRecordExpired(d, cutoffsIso.community)) { expiredSkipped++; return false; }
        return true;
      });
      for (const row of valid) {
        await db.insert(roadmapVotes).values({
          featureId: row.featureId || row.feature_id,
          ipAddress: row.ipAddress || row.ip_address,
          userAgent: row.userAgent || row.user_agent,
          createdAt: row.createdAt || row.created_at
        }).catch(() => {});
      }
      restoredCounts.roadmap_votes = valid.length;
    }

    if (Array.isArray(tables.feature_suggestions)) {
      const valid = tables.feature_suggestions.filter((r: any) => {
        const d = r.createdAt || r.created_at;
        if (isRecordExpired(d, cutoffsIso.community)) { expiredSkipped++; return false; }
        return true;
      });
      for (const row of valid) {
        await db.insert(featureSuggestions).values({
          featureId: row.featureId || row.feature_id,
          author: row.author || 'Anonyme',
          email: row.email,
          suggestionText: row.suggestionText || row.suggestion_text || '',
          ipAddress: row.ipAddress || row.ip_address,
          status: row.status || 'pending',
          createdAt: row.createdAt || row.created_at
        }).catch(() => {});
      }
      restoredCounts.feature_suggestions = valid.length;
    }

    if (Array.isArray(tables.community_proposals)) {
      const valid = tables.community_proposals.filter((r: any) => {
        const d = r.createdAt || r.created_at;
        if (isRecordExpired(d, cutoffsIso.community)) { expiredSkipped++; return false; }
        return true;
      });
      for (const row of valid) {
        await db.insert(communityProposals).values({
          title: row.title,
          category: row.category || 'GÉNÉRAL',
          description: row.description,
          author: row.author || 'Anonyme',
          email: row.email,
          ipAddress: row.ipAddress || row.ip_address,
          status: row.status || 'pending',
          createdAt: row.createdAt || row.created_at
        }).catch(() => {});
      }
      restoredCounts.community_proposals = valid.length;
    }

    if (Array.isArray(tables.chat_messages)) {
      const valid = tables.chat_messages.filter((r: any) => {
        const d = r.createdAt || r.created_at;
        if (isRecordExpired(d, cutoffsIso.appeals)) { expiredSkipped++; return false; }
        return true;
      });
      for (const row of valid) {
        await db.insert(chatMessages).values({
          ipAddress: row.ipAddress || row.ip_address,
          sender: row.sender || 'admin',
          message: row.message,
          isRead: row.isRead ?? row.is_read ?? 0,
          createdAt: row.createdAt || row.created_at
        }).catch(() => {});
      }
      restoredCounts.chat_messages = valid.length;
    }

    if (Array.isArray(tables.ban_appeals)) {
      const valid = tables.ban_appeals.filter((r: any) => {
        const d = r.createdAt || r.created_at;
        if (isRecordExpired(d, cutoffsIso.appeals)) { expiredSkipped++; return false; }
        return true;
      });
      for (const row of valid) {
        await db.insert(banAppeals).values({
          ipAddress: row.ipAddress || row.ip_address,
          email: row.email,
          message: row.message,
          status: row.status || 'pending',
          adminResponse: row.adminResponse || row.admin_response,
          archived: row.archived ?? 0,
          createdAt: row.createdAt || row.created_at
        }).catch(() => {});
      }
      restoredCounts.ban_appeals = valid.length;
    }

    // Recalcul du total des votes par feature
    await rawAll(sql`
      UPDATE roadmap_features SET votes_count = (
        SELECT COUNT(*) FROM roadmap_votes WHERE roadmap_votes.feature_id = roadmap_features.id
      )
    `);

    return reply.status(200).send({
      status: 'ok',
      message: `Sauvegarde restaurée avec succès ! ${expiredSkipped} élément(s) périmé(s) ont été éliminés conformément aux règles RGPD.`,
      restored_counts: restoredCounts,
      expired_skipped: expiredSkipped
    });
  });

  // 4. POST /api/admin/data/purge : Purge sélective ou réinitialisation ciblée
  const PurgeSchema = z.object({
    scope: z.enum(['expired', 'analytics', 'votes', 'community', 'appeals', 'logs', 'bans', 'all']).optional(),
    scopes: z.array(z.enum(['expired', 'analytics', 'votes', 'community', 'appeals', 'logs', 'bans', 'all'])).optional()
  });

  fastify.post('/api/admin/data/purge', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });
    if (!hasPermission(admin, 'settings')) return reply.status(403).send({ status: 'forbidden' });

    const parse = PurgeSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Périmètre de purge invalide.' });

    const requestedScopes: string[] = parse.data.scopes && parse.data.scopes.length > 0
      ? parse.data.scopes
      : (parse.data.scope ? [parse.data.scope] : []);

    if (requestedScopes.length === 0) {
      return reply.status(400).send({ status: 'error', message: 'Aucun périmètre de purge spécifié.' });
    }

    const now = Date.now();
    const cutoffsSql = {
      analytics: new Date(now - 395 * 86400 * 1000).toISOString().replace('T', ' ').substring(0, 19),
      logs: new Date(now - 180 * 86400 * 1000).toISOString().replace('T', ' ').substring(0, 19),
      appeals: new Date(now - 540 * 86400 * 1000).toISOString().replace('T', ' ').substring(0, 19),
      community: new Date(now - 365 * 86400 * 1000).toISOString().replace('T', ' ').substring(0, 19)
    };

    const isAll = requestedScopes.includes('all');
    const hasScope = (s: string) => isAll || requestedScopes.includes(s);

    const executedActions: string[] = [];

    if (requestedScopes.includes('expired')) {
      await Promise.all([
        rawAll(sql`DELETE FROM page_views WHERE substr(created_at, 1, 19) < ${cutoffsSql.analytics}`),
        rawAll(sql`DELETE FROM analytics_events WHERE substr(created_at, 1, 19) < ${cutoffsSql.analytics}`),
        rawAll(sql`DELETE FROM admin_login_logs WHERE substr(created_at, 1, 19) < ${cutoffsSql.logs}`),
        rawAll(sql`DELETE FROM security_notifications WHERE substr(created_at, 1, 19) < ${cutoffsSql.logs}`),
        rawAll(sql`DELETE FROM ban_appeals WHERE substr(created_at, 1, 19) < ${cutoffsSql.appeals}`),
        rawAll(sql`DELETE FROM chat_messages WHERE substr(created_at, 1, 19) < ${cutoffsSql.appeals}`),
        rawAll(sql`DELETE FROM roadmap_votes WHERE substr(created_at, 1, 19) < ${cutoffsSql.community}`),
        rawAll(sql`DELETE FROM feature_suggestions WHERE substr(created_at, 1, 19) < ${cutoffsSql.community}`),
        rawAll(sql`DELETE FROM community_proposals WHERE substr(created_at, 1, 19) < ${cutoffsSql.community}`)
      ]);
      executedActions.push('Données expirées RGPD purgées');
    }

    if (hasScope('analytics')) {
      await db.delete(pageViews);
      await db.delete(analyticsEvents);
      executedActions.push('Statistiques de fréquentation réinitialisées');
    }

    if (hasScope('votes')) {
      await db.delete(roadmapVotes);
      await rawAll(sql`UPDATE roadmap_features SET votes_count = 0`);
      executedActions.push('Votes roadmap réinitialisés à 0 (fonctionnalités conservées)');
    }

    if (hasScope('community')) {
      await db.delete(communityProposals);
      await db.delete(featureSuggestions);
      executedActions.push('Boîte à idées et compléments communautaires réinitialisés');
    }

    if (hasScope('appeals')) {
      await db.delete(banAppeals);
      await db.delete(chatMessages);
      executedActions.push('Recours et fils de messagerie réinitialisés');
    }

    if (hasScope('logs')) {
      await db.delete(adminLoginLogs);
      await db.delete(securityNotifications);
      executedActions.push('Journaux d audit et notifications de sécurité effacés');
    }

    if (hasScope('bans')) {
      await db.delete(bannedIps);
      executedActions.push('Liste des adresses IP sanctionnées réinitialisée');
    }

    // PROTECTION ABSOLUE DU CONTENU VISIBLE DU SITE :
    // roadmapFeatures, roadmapMilestones, faqItems, arcadeGames, showcasePlugins,
    // showcaseThemes, siteContent, siteContentI18n, adminUsers NE SONT JAMAIS SUPPRIMÉS.

    return reply.send({
      status: 'ok',
      message: `Purge effectuée avec succès : ${executedActions.join(', ')}. Le contenu du site et vos accès administrateurs sont intégralement préservés.`,
      scopes_executed: executedActions
    });
  });

  // 26. GET /api/admin/system/health : Métriques système, RAM, Disque, DB & Uptime
  fastify.get('/api/admin/system/health', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });

    const startTime = performance.now();
    let dbStatus = 'healthy';
    let dbLatencyMs = 0;
    try {
      await rawAll(sql`SELECT 1`);
      dbLatencyMs = Math.round((performance.now() - startTime) * 100) / 100;
    } catch {
      dbStatus = 'degraded';
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Disk usage
    let diskStats = { totalGb: 0, freeGb: 0, usedGb: 0, usedPercent: 0 };
    try {
      const statfs = fs.statfsSync(process.cwd());
      const totalBytes = statfs.blocks * statfs.bsize;
      const freeBytes = statfs.bfree * statfs.bsize;
      const usedBytes = totalBytes - freeBytes;
      diskStats = {
        totalGb: Math.round((totalBytes / (1024 ** 3)) * 100) / 100,
        freeGb: Math.round((freeBytes / (1024 ** 3)) * 100) / 100,
        usedGb: Math.round((usedBytes / (1024 ** 3)) * 100) / 100,
        usedPercent: totalBytes > 0 ? Math.round(((usedBytes / totalBytes) * 100) * 10) / 10 : 0
      };
    } catch {}

    // SQLite DB file size
    let dbFileSizeBytes = 0;
    let dbFileSizeFormatted = 'N/A (PostgreSQL / Supabase)';
    const dbPath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'data/kairoos.db');
    if (fs.existsSync(dbPath)) {
      try {
        const dbStat = fs.statSync(dbPath);
        dbFileSizeBytes = dbStat.size;
        if (dbFileSizeBytes < 1024 * 1024) {
          dbFileSizeFormatted = `${Math.round(dbFileSizeBytes / 1024)} Ko`;
        } else {
          dbFileSizeFormatted = `${(dbFileSizeBytes / (1024 * 1024)).toFixed(2)} Mo`;
        }
      } catch {}
    }

    // Uploads folder stats
    let uploadsCount = 0;
    let uploadsSizeBytes = 0;
    if (fs.existsSync(UPLOAD_DIR)) {
      try {
        const files = fs.readdirSync(UPLOAD_DIR);
        uploadsCount = files.length;
        for (const file of files) {
          const filePath = path.join(UPLOAD_DIR, file);
          const s = fs.statSync(filePath);
          uploadsSizeBytes += s.size;
        }
      } catch {}
    }
    const uploadsSizeFormatted = uploadsSizeBytes < 1024 * 1024
      ? `${Math.round(uploadsSizeBytes / 1024)} Ko`
      : `${(uploadsSizeBytes / (1024 * 1024)).toFixed(2)} Mo`;

    // System uptime
    const uptimeSec = Math.floor(process.uptime());
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;
    const uptimeFormatted = `${days > 0 ? days + 'j ' : ''}${hours}h ${minutes}m ${seconds}s`;

    // Counts from database
    let totalAdmins = 0;
    let totalBans = 0;
    let totalVotes = 0;
    try {
      const [admCount] = await rawAll<{ count: number }>(sql`SELECT count(*) as count FROM admin_users`);
      totalAdmins = Number(admCount?.count || 0);
      const [banCount] = await rawAll<{ count: number }>(sql`SELECT count(*) as count FROM banned_ips`);
      totalBans = Number(banCount?.count || 0);
      const [voteCount] = await rawAll<{ count: number }>(sql`SELECT count(*) as count FROM roadmap_votes`);
      totalVotes = Number(voteCount?.count || 0);
    } catch {}

    const cpus = os.cpus();

    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: uptimeSec,
        formatted: uptimeFormatted
      },
      cpu: {
        model: cpus[0]?.model || 'Processeur Standard',
        cores: cpus.length,
        loadAvg: os.loadavg()
      },
      memory: {
        processRssMb: Math.round((memUsage.rss / (1024 * 1024)) * 10) / 10,
        processHeapUsedMb: Math.round((memUsage.heapUsed / (1024 * 1024)) * 10) / 10,
        processHeapTotalMb: Math.round((memUsage.heapTotal / (1024 * 1024)) * 10) / 10,
        systemTotalMb: Math.round(totalMem / (1024 * 1024)),
        systemFreeMb: Math.round(freeMem / (1024 * 1024)),
        systemUsedPercent: Math.round(((usedMem / totalMem) * 100) * 10) / 10
      },
      disk: diskStats,
      database: {
        status: dbStatus,
        driver: currentDbDriver || 'sqlite',
        latencyMs: dbLatencyMs,
        fileSize: dbFileSizeFormatted,
        fileSizeBytes: dbFileSizeBytes
      },
      storage: {
        uploadsCount,
        uploadsSizeFormatted,
        uploadsSizeBytes
      },
      stats: {
        totalAdmins,
        totalBans,
        totalVotes
      },
      environment: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        trustProxy: true,
        rateLimit: '300 req/min'
      }
    });
  });
};


