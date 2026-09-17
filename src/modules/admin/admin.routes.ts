import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../../db/client.js';
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
  communityProposals,
  featureSuggestions,
  pageViews,
  analyticsEvents
} from '../../db/schema.js';
import { eq, desc, asc, and, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/auth.service.js';

const UBLOAD_DIR = path.resolve(process.cwd(), 'web/assets/img/uploads');

const UPLOAD_DIR = path.resolve(process.cwd(), 'web/assets/img/uploads');

function getAuthAdmin(request: FastifyRequest) {
  const cookieToken = request.cookies['kairo_admin_session'];
  const authHeader = request.headers.authorization?.replace('Bearer ', '').trim();
  const token = cookieToken || authHeader;
  if (!token) return null;

  return db.select().from(adminUsers).where(eq(adminUsers.token, token)).get() || null;
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
  appeal_id: z.number(),
  hard: z.boolean().optional().default(false)
});

const VoteDeleteSchema = z.object({
  feature_id: z.number(),
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
    const admin = getAuthAdmin(request);
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
      )
    `;
    const distinctIps = db.all<{ ip_address: string }>(allIpsQuery).map(r => r.ip_address);

    const users = [];
    for (const ip of distinctIps) {
      const [vRow] = db.select({ c: sql<number>`count(*)` }).from(pageViews).where(eq(pageViews.ipAddress, ip)).all();
      const [eRow] = db.select({ c: sql<number>`count(*)` }).from(analyticsEvents).where(eq(analyticsEvents.ipAddress, ip)).all();
      const [voteRow] = db.select({ c: sql<number>`count(*)` }).from(roadmapVotes).where(eq(roadmapVotes.ipAddress, ip)).all();
      const [propRow] = db.select({ c: sql<number>`count(*)` }).from(communityProposals).where(eq(communityProposals.ipAddress, ip)).all();
      const [sugRow] = db.select({ c: sql<number>`count(*)` }).from(featureSuggestions).where(eq(featureSuggestions.ipAddress, ip)).all();

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
        )
      `;
      const [lastSeenRow] = db.all<{ last_seen: string | null }>(lastSeenQuery);

      const propInfo = db.select({ author: communityProposals.author, email: communityProposals.email })
        .from(communityProposals)
        .where(eq(communityProposals.ipAddress, ip))
        .orderBy(desc(communityProposals.id))
        .limit(1)
        .get();

      let nickname = propInfo?.author && propInfo.author !== 'Anonyme' ? propInfo.author : null;
      const email = propInfo?.email || null;

      if (!nickname) {
        const sugInfo = db.select({ author: featureSuggestions.author })
          .from(featureSuggestions)
          .where(eq(featureSuggestions.ipAddress, ip))
          .orderBy(desc(featureSuggestions.id))
          .limit(1)
          .get();
        if (sugInfo && sugInfo.author !== 'Anonyme') nickname = sugInfo.author;
      }

      const ban = db.select().from(bannedIps).where(eq(bannedIps.ipAddress, ip)).get() || null;

      const vCount = vRow?.c || 0;
      const eCount = eRow?.c || 0;

      users.push({
        ip_address: ip,
        total_connections: vCount + eCount,
        page_views: vCount,
        events_count: eCount,
        votes_count: voteRow?.c || 0,
        proposals_count: propRow?.c || 0,
        suggestions_count: sugRow?.c || 0,
        nickname,
        email,
        last_seen: lastSeenRow?.last_seen || null,
        ban
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
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const targetIp = (request.query.ip || '').trim();
    if (!targetIp) return reply.status(400).send({ status: 'error', message: 'IP requise' });

    const ban = db.select().from(bannedIps).where(eq(bannedIps.ipAddress, targetIp)).get() || null;

    const votes = db.select({
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
      .orderBy(desc(roadmapVotes.id))
      .all()
      .map(v => ({
        ...v,
        feature_title: v.titleFr || v.titleEn || ('Feature #' + v.featureId),
        feature_tag: v.tag
      }));

    const proposals = db.select().from(communityProposals).where(eq(communityProposals.ipAddress, targetIp)).orderBy(desc(communityProposals.id)).all();

    const suggestions = db.select({
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
      .orderBy(desc(featureSuggestions.id))
      .all()
      .map(s => ({
        ...s,
        feature_title: s.titleFr || ('Feature #' + s.featureId)
      }));

    const views = db.select().from(pageViews).where(eq(pageViews.ipAddress, targetIp)).orderBy(desc(pageViews.id)).limit(50).all();
    const events = db.select().from(analyticsEvents).where(eq(analyticsEvents.ipAddress, targetIp)).orderBy(desc(analyticsEvents.id)).limit(50).all();
    const appeals = db.select().from(banAppeals).where(eq(banAppeals.ipAddress, targetIp)).orderBy(desc(banAppeals.id)).all();
    const chat = db.select().from(chatMessages).where(eq(chatMessages.ipAddress, targetIp)).orderBy(asc(chatMessages.id)).limit(200).all();
    const loginLogs = db.select().from(adminLoginLogs).where(eq(adminLoginLogs.ipAddress, targetIp)).orderBy(desc(adminLoginLogs.id)).limit(20).all();

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
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const targetIp = (request.query.ip || '').trim();
    if (!targetIp) return reply.status(400).send({ status: 'error', message: 'IP requise' });

    const msgs = db.select().from(chatMessages).where(eq(chatMessages.ipAddress, targetIp)).orderBy(asc(chatMessages.id)).limit(200).all();

    db.update(chatMessages)
      .set({ isRead: 1 })
      .where(and(eq(chatMessages.ipAddress, targetIp), eq(chatMessages.sender, 'visitor')))
      .run();

    return reply.status(200).send({ status: 'ok', ip: targetIp, messages: msgs });
  });

  // 4. GET /api/admin/features/votes
  fastify.get<{ Querystring: { feature_id?: string } }>('/api/admin/features/votes', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const fid = Number(request.query.feature_id);
    if (!fid) return reply.status(400).send({ status: 'error', message: 'ID requis' });

    const feature = db.select().from(roadmapFeatures).where(eq(roadmapFeatures.id, fid)).get();
    if (!feature) return reply.status(404).send({ status: 'error', message: 'Fonctionnalité introuvable' });

    const votes = db.select({
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
      .orderBy(desc(roadmapVotes.id))
      .all();

    return reply.status(200).send({
      status: 'ok',
      feature,
      votes,
      total_votes: votes.length
    });
  });

  // 5. GET /api/admin/appeals
  fastify.get('/api/admin/appeals', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const appeals = db.select().from(banAppeals).orderBy(desc(banAppeals.id)).all();
    return reply.status(200).send({ status: 'ok', appeals });
  });

  // 6. GET /api/admin/security/config
  fastify.get('/api/admin/security/config', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const row = db.select().from(adminSecurityConfig).where(eq(adminSecurityConfig.id, 1)).get();
    return reply.status(200).send({
      status: 'ok',
      access_mode: row?.accessMode || 'all',
      allowed_ips: row?.allowedIps || '127.0.0.1,::1',
      client_ip: request.ip || '127.0.0.1'
    });
  });

  // 7. GET /api/admin/admins
  fastify.get('/api/admin/admins', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });
    if (!hasPermission(admin, 'settings')) return reply.status(403).send({ status: 'unauthorized' });

    const admins = db.select({
      id: adminUsers.id,
      username: adminUsers.username,
      role: adminUsers.role,
      permissions: adminUsers.permissions,
      lastLogin: adminUsers.lastLogin,
      lastIp: adminUsers.lastIp,
      createdAt: adminUsers.createdAt
    }).from(adminUsers).orderBy(asc(adminUsers.id)).all().map(a => {
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
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });
    if (!hasPermission(admin, 'settings')) return reply.status(403).send({ status: 'unauthorized' });

    const logs = db.select().from(adminLoginLogs).orderBy(desc(adminLoginLogs.id)).limit(150).all();
    return reply.status(200).send({ status: 'ok', logs });
  });

  // 9. GET /api/admin/notifications
  fastify.get('/api/admin/notifications', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const notifs = db.select().from(securityNotifications).orderBy(desc(securityNotifications.id)).limit(50).all();
    const [unread] = db.select({ c: sql<number>`count(*)` }).from(securityNotifications).where(eq(securityNotifications.isRead, 0)).all();

    return reply.status(200).send({ status: 'ok', notifications: notifs, unread_count: unread?.c || 0 });
  });

  // 10. GET /api/admin/bans
  fastify.get('/api/admin/bans', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const bans = db.select().from(bannedIps).orderBy(desc(bannedIps.id)).all();

    const knownIpsQuery = sql`
      SELECT ip_address, count(*) as count, 'vote' as origin FROM roadmap_votes WHERE ip_address IS NOT NULL GROUP BY ip_address
      UNION
      SELECT ip_address, count(*) as count, 'proposal' as origin FROM community_proposals WHERE ip_address IS NOT NULL GROUP BY ip_address
      UNION
      SELECT ip_address, count(*) as count, 'suggestion' as origin FROM feature_suggestions WHERE ip_address IS NOT NULL GROUP BY ip_address
      ORDER BY count DESC LIMIT 100
    `;
    const knownIps = db.all<{ ip_address: string; count: number; origin: string }>(knownIpsQuery);

    return reply.status(200).send({ status: 'ok', bans, known_ips: knownIps });
  });

  // 11. POST /api/admin/users/delete
  fastify.post('/api/admin/users/delete', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = UserDeleteSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Adresse IP requise' });

    const targetIp = parse.data.ip_address;

    db.delete(pageViews).where(eq(pageViews.ipAddress, targetIp)).run();
    db.delete(analyticsEvents).where(eq(analyticsEvents.ipAddress, targetIp)).run();
    db.delete(roadmapVotes).where(eq(roadmapVotes.ipAddress, targetIp)).run();
    db.delete(communityProposals).where(eq(communityProposals.ipAddress, targetIp)).run();
    db.delete(featureSuggestions).where(eq(featureSuggestions.ipAddress, targetIp)).run();
    db.delete(bannedIps).where(eq(bannedIps.ipAddress, targetIp)).run();
    db.delete(banAppeals).where(eq(banAppeals.ipAddress, targetIp)).run();
    db.delete(chatMessages).where(eq(chatMessages.ipAddress, targetIp)).run();

    const allFeatures = db.select({ id: roadmapFeatures.id }).from(roadmapFeatures).all();
    for (const f of allFeatures) {
      const [c] = db.select({ val: sql<number>`count(*)` }).from(roadmapVotes).where(eq(roadmapVotes.featureId, f.id)).all();
      db.update(roadmapFeatures).set({ votesCount: c?.val || 0 }).where(eq(roadmapFeatures.id, f.id)).run();
    }

    return reply.status(200).send({
      status: 'ok',
      message: ('Utilisateur ' + targetIp + ' supprimé définitivement.')
    });
  });

  // 12. POST /api/admin/appeals/delete
  fastify.post('/api/admin/appeals/delete', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = AppealDeleteSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID requis' });

    if (parse.data.hard) {
      db.delete(banAppeals).where(eq(banAppeals.id, parse.data.appeal_id)).run();
    } else {
      db.update(banAppeals).set({ archived: 1 }).where(eq(banAppeals.id, parse.data.appeal_id)).run();
    }

    return reply.status(200).send({ status: 'ok', message: 'Recours supprimé du panel.' });
  });

  // 13. POST /api/admin/votes/delete
  fastify.post('/api/admin/votes/delete', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = VoteDeleteSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'feature_id et ip_address requis' });

    const { feature_id, ip_address } = parse.data;
    db.delete(roadmapVotes).where(and(eq(roadmapVotes.featureId, feature_id), eq(roadmapVotes.ipAddress, ip_address))).run();

    const [c] = db.select({ val: sql<number>`count(*)` }).from(roadmapVotes).where(eq(roadmapVotes.featureId, feature_id)).all();
    db.update(roadmapFeatures).set({ votesCount: c?.val || 0 }).where(eq(roadmapFeatures.id, feature_id)).run();

    return reply.status(200).send({ status: 'ok', message: 'Vote révoqué.' });
  });

  // 14. POST /api/admin/chat/send
  fastify.post('/api/admin/chat/send', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = ChatSendAdminSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });

    db.insert(chatMessages).values({
      ipAddress: parse.data.ip_address,
      sender: 'admin',
      message: parse.data.message,
      isRead: 0
    }).run();

    return reply.status(200).send({ status: 'ok', message: 'Message envoyé au visiteur.' });
  });

  // 15. POST /api/admin/security/config
  fastify.post('/api/admin/security/config', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = SecurityConfigSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Configuration invalide' });

    db.insert(adminSecurityConfig).values({
      id: 1,
      accessMode: parse.data.access_mode,
      allowedIps: parse.data.allowed_ips
    }).onConflictDoUpdate({
      target: adminSecurityConfig.id,
      set: {
        accessMode: parse.data.access_mode,
        allowedIps: parse.data.allowed_ips
      }
    }).run();

    return reply.status(200).send({ status: 'ok', message: 'Politique de restriction d accès IP mise à jour avec succès.' });
  });

  // 16. POST /api/admin/appeals/respond
  fastify.post('/api/admin/appeals/respond', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = AppealRespondSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Données invalides' });

    const { appeal_id, action, escalate_reason } = parse.data;
    const appeal = db.select().from(banAppeals).where(eq(banAppeals.id, appeal_id)).get();
    if (!appeal || !appeal.ipAddress) return reply.status(404).send({ status: 'error', message: 'Recours introuvable' });

    const targetIp = appeal.ipAddress;

    if (action === 'escalate') {
      if (!escalate_reason) return reply.status(400).send({ status: 'error', message: 'La raison de la sur-sanction est obligatoire.' });

      db.update(banAppeals).set({ status: 'escalated', adminResponse: escalate_reason }).where(eq(banAppeals.id, appeal_id)).run();

      db.insert(bannedIps).values({
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
      }).run();

      return reply.status(200).send({
        status: 'ok',
        message: ('Recours abusif : adresse IP ' + targetIp + ' sur-sanctionnée.')
      });
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    db.update(banAppeals).set({ status: newStatus }).where(eq(banAppeals.id, appeal_id)).run();

    if (action === 'accept') {
      db.delete(bannedIps).where(eq(bannedIps.ipAddress, targetIp)).run();
      return reply.status(200).send({ status: 'ok', message: ('Recours accepté pour ' + targetIp) });
    }

    return reply.status(200).send({ status: 'ok', message: ('Recours rejeté pour ' + targetIp) });
  });

  // 17. POST /api/admin/bans/save
  fastify.post('/api/admin/bans/save', async (request, reply) => {
    const admin = getAuthAdmin(request);
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

    db.insert(bannedIps).values({
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
    }).run();

    return reply.status(200).send({ status: 'ok', message: ('Bannissement appliqué avec succès pour ' + d.ip_address) });
  });

  // 18. POST /api/admin/admins/save
  fastify.post('/api/admin/admins/save', async (request, reply) => {
    const admin = getAuthAdmin(request);
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
        db.update(adminUsers).set({
          username,
          passwordHash: pwdHash,
          role,
          permissions: permsJson
        }).where(eq(adminUsers.id, id)).run();
      } else {
        db.update(adminUsers).set({
          username,
          role,
          permissions: permsJson
        }).where(eq(adminUsers.id, id)).run();
      }
      return reply.status(200).send({ status: 'ok', message: ('Compte administrateur mis à jour: ' + username) });
    } else {
      if (!password) return reply.status(400).send({ status: 'error', message: 'Le mot de passe est obligatoire pour un nouveau compte.' });
      const pwdHash = await hashPassword(password);
      try {
        db.insert(adminUsers).values({
          username,
          passwordHash: pwdHash,
          role,
          permissions: permsJson
        }).run();
        return reply.status(200).send({ status: 'ok', message: ('Compte administrateur créé: ' + username) });
      } catch {
        return reply.status(400).send({ status: 'error', message: 'Cet identifiant est déjà utilisé.' });
      }
    }
  });

  // 19. POST /api/admin/admins/delete
  fastify.post('/api/admin/admins/delete', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin || !hasPermission(admin, 'settings')) {
      return reply.status(403).send({ status: 'error', message: 'Permission insuffisante.' });
    }

    const parse = z.object({ id: z.number() }).safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID requis' });

    if (admin.id === parse.data.id) {
      return reply.status(400).send({ status: 'error', message: 'Vous ne pouvez pas supprimer votre propre compte actif.' });
    }

    const target = db.select().from(adminUsers).where(eq(adminUsers.id, parse.data.id)).get();
    if (target?.username === 'admin') {
      return reply.status(400).send({ status: 'error', message: 'Le compte superadministrateur principal admin ne peut pas être supprimé.' });
    }

    db.delete(adminUsers).where(eq(adminUsers.id, parse.data.id)).run();
    return reply.status(200).send({ status: 'ok', message: 'Compte administrateur supprimé.' });
  });

  // 20. POST /api/admin/bans/delete
  fastify.post('/api/admin/bans/delete', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'error', message: 'Non autorisé.' });

    const parse = z.object({
      id: z.number().optional(),
      ip_address: z.string().optional()
    }).safeParse(request.body);

    if (!parse.success || (!parse.data.id && !parse.data.ip_address)) {
      return reply.status(400).send({ status: 'error', message: 'ID ou IP manquant' });
    }

    if (parse.data.id) {
      db.delete(bannedIps).where(eq(bannedIps.id, parse.data.id)).run();
    } else if (parse.data.ip_address) {
      db.delete(bannedIps).where(eq(bannedIps.ipAddress, parse.data.ip_address)).run();
    }

    return reply.status(200).send({ status: 'ok', message: 'Bannissement levé avec succès !' });
  });

  // 21. POST /api/upload
  fastify.post('/api/upload', async (request, reply) => {
    const admin = getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });

    const parse = UploadSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Fichier requis' });

    const { file_data, file_name } = parse.data;
    const cleanData = file_data.includes(',') ? file_data.split(',')[1] : file_data;
    const buffer = Buffer.from(cleanData, 'base64');

    // Security Hardening: Max 10MB per file
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({ status: 'error', message: 'Fichier trop volumineux (max 10MB)' });
    }

    // Allowed extensions check (images and audio assets)
    const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.mp3', '.wav', '.ogg'];
    const ext = path.extname(file_name).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return reply.status(400).send({ status: 'error', message: 'Type de fichier non autorisé.' });
    }

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const safeBaseName = path.basename(file_name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = (Math.floor(Date.now() / 1000) + '_' + crypto.randomBytes(4).toString('hex') + '_' + safeBaseName);
    const targetPath = path.join(UPLOAD_DIR, safeName);
    fs.writeFileSync(targetPath, buffer);

    return reply.status(200).send({
      status: 'ok',
      url: ('assets/img/uploads/' + safeName)
    });
  });
};
