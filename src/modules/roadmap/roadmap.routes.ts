import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createHash } from 'crypto';
import { db } from '../../db/client.js';
import {
  roadmapFeatures,
  roadmapVotes,
  roadmapMilestones,
  communityProposals,
  featureSuggestions,
  bannedIps,
  adminUsers
} from '../../db/schema.js';
import { eq, desc, and, or, sql } from 'drizzle-orm';

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return request.ip || '127.0.0.1';
}

export function getAnonVoteToken(ip: string): string {
  if (!ip) return 'anon_vote_unknown';
  return `anon_${createHash('sha256').update(ip + '_KAIRO_VOTE_PEPPER_2026').digest('hex').substring(0, 12)}`;
}

async function getAuthAdmin(request: FastifyRequest) {
  const cookieToken = (request as any).cookies?.['kairo_admin_session'];
  const authHeader = request.headers.authorization?.replace('Bearer ', '').trim();
  const token = cookieToken || authHeader;
  if (!token) return null;

  return (await db.select().from(adminUsers).where(eq(adminUsers.token, token)))[0] || null;
}

const VoteSchema = z.object({
  feature_id: z.coerce.number().int().positive('ID de fonctionnalité invalide')
});

const ProposalSchema = z.object({
  title: z.string().min(1, 'Titre obligatoire'),
  category: z.string().default('GÉNÉRAL'),
  description: z.string().min(1, 'Description détaillée obligatoire'),
  author: z.string().default('Anonyme'),
  email: z.string().email('Email invalide').optional().or(z.literal(''))
});

const SuggestionSchema = z.object({
  feature_id: z.coerce.number().int().positive('ID de fonctionnalité invalide'),
  suggestion_text: z.string().min(1, 'Texte de suggestion requis'),
  author: z.string().default('Anonyme'),
  email: z.string().email('Email invalide').optional().or(z.literal(''))
});

const FeatureSaveSchema = z.object({
  id: z.coerce.number().optional().nullable(),
  tag: z.string().default('GÉNÉRAL'),
  sort_order: z.coerce.number().default(0),
  votes_count: z.coerce.number().default(0),
  title_fr: z.string().min(1, 'Titre français obligatoire'),
  title_en: z.string().min(1, 'Titre anglais obligatoire'),
  desc_fr: z.string().default(''),
  desc_en: z.string().default('')
});

export const roadmapRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Liste des fonctionnalités au vote avec statut has_voted pour l'IP (avec anonymisation préservée)
  fastify.get('/api/roadmap/features', async (request, reply) => {
    const clientIp = getClientIp(request);
    const anonToken = getAnonVoteToken(clientIp);

    const features = await db.select().from(roadmapFeatures).orderBy(desc(roadmapFeatures.votesCount), roadmapFeatures.sortOrder);

    const featuresWithVotes = await Promise.all(features.map(async (feat: any) => {
      const featId = Number(feat.id);
      const vote = (await db
        .select()
        .from(roadmapVotes)
        .where(
          and(
            eq(roadmapVotes.featureId, featId),
            or(eq(roadmapVotes.ipAddress, clientIp), eq(roadmapVotes.ipAddress, anonToken))
          )
        ))[0];

      const suggestions = await db
        .select()
        .from(featureSuggestions)
        .where(and(eq(featureSuggestions.featureId, featId), sql`status != 'rejected'`))
        .orderBy(desc(featureSuggestions.id));

      const vCount = Number(feat.votesCount ?? feat.votes_count ?? 0);
      const sOrder = Number(feat.sortOrder ?? feat.sort_order ?? 0);

      return {
        ...feat,
        id: featId,
        titleFr: feat.titleFr,
        titleEn: feat.titleEn,
        descFr: feat.descFr,
        descEn: feat.descEn,
        title_fr: feat.titleFr || feat.title_fr,
        title_en: feat.titleEn || feat.title_en,
        desc_fr: feat.descFr || feat.desc_fr,
        desc_en: feat.descEn || feat.desc_en,
        tag: feat.tag,
        votesCount: vCount,
        votes_count: vCount,
        sortOrder: sOrder,
        sort_order: sOrder,
        has_voted: Boolean(vote),
        suggestions
      };
    }));

    return reply.status(200).send({
      status: 'ok',
      client_ip: clientIp,
      features: featuresWithVotes
    });
  });

  // 2. Vote 1-clic par IP (reconnait aussi les IP anonymisées)
  fastify.post('/api/roadmap/vote', async (request, reply) => {
    const clientIp = getClientIp(request);
    const anonToken = getAnonVoteToken(clientIp);
    const userAgent = request.headers['user-agent'] || 'Unknown';

    // Vérifier si l'IP est bannie du vote
    const ban = (await db.select().from(bannedIps).where(eq(bannedIps.ipAddress, clientIp)))[0];
    if (ban && (ban.blockVote || ban.blockAll)) {
      return reply.status(403).send({
        status: 'banned',
        message: `Votre adresse IP (${clientIp}) est bannie des votes. Motif : ${ban.reason || 'Non respect des règles'}`
      });
    }

    const parse = VoteSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    const { feature_id } = parse.data;

    const feature = (await db.select().from(roadmapFeatures).where(eq(roadmapFeatures.id, feature_id)))[0];
    if (!feature) {
      return reply.status(404).send({ status: 'error', message: 'Fonctionnalité introuvable' });
    }

    // Vérification de vote existant (soit IP en clair, soit token anonymisé)
    const existingVote = (await db
      .select()
      .from(roadmapVotes)
      .where(
        and(
          eq(roadmapVotes.featureId, feature_id),
          or(eq(roadmapVotes.ipAddress, clientIp), eq(roadmapVotes.ipAddress, anonToken))
        )
      ))[0];

    if (existingVote) {
      return reply.status(200).send({
        status: 'already_voted',
        message: `Vous avez déjà voté pour cette fonctionnalité.`,
        feature_id,
        votes_count: feature.votesCount
      });
    }

    // Enregistrement du vote
    await db.insert(roadmapVotes)
      .values({
        featureId: feature_id,
        ipAddress: clientIp,
        userAgent
      });

    // Recalcul incrémental
    const [voteCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(roadmapVotes)
      .where(eq(roadmapVotes.featureId, feature_id));

    const newCount = voteCount?.count || 1;

    await db.update(roadmapFeatures)
      .set({ votesCount: newCount })
      .where(eq(roadmapFeatures.id, feature_id));

    return reply.status(200).send({
      status: 'ok',
      message: 'Votre vote a été pris en compte avec succès !',
      feature_id,
      votes_count: newCount
    });
  });

  // 3. Soumission d'une proposition communautaire (Boîte à idées)
  fastify.post('/api/roadmap/propose', async (request, reply) => {
    const clientIp = getClientIp(request);

    const ban = (await db.select().from(bannedIps).where(eq(bannedIps.ipAddress, clientIp)))[0];
    if (ban && (ban.blockProposal || ban.blockAll)) {
      return reply.status(403).send({
        status: 'banned',
        message: `Votre adresse IP (${clientIp}) est bannie des propositions d'idées.`
      });
    }

    const parse = ProposalSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    const { title, category, description, author, email } = parse.data;

    await db.insert(communityProposals)
      .values({
        title,
        category,
        description,
        author: author || 'Anonyme',
        email: email || null,
        ipAddress: clientIp,
        status: 'pending'
      });

    return reply.status(200).send({
      status: 'ok',
      message: 'Votre idée a bien été soumise à l\'équipe ! Elle sera examinée très prochainement.'
    });
  });

  // 4. Soumission d'un complément d'idée sur une fonctionnalité existante
  fastify.post('/api/roadmap/features/suggest', async (request, reply) => {
    const clientIp = getClientIp(request);

    const ban = (await db.select().from(bannedIps).where(eq(bannedIps.ipAddress, clientIp)))[0];
    if (ban && (ban.blockSuggestion || ban.blockAll)) {
      return reply.status(403).send({
        status: 'banned',
        message: `Votre adresse IP (${clientIp}) est bannie de l'envoi de compléments.`
      });
    }

    const parse = SuggestionSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    const { feature_id, suggestion_text, author, email } = parse.data;

    const feature = (await db.select().from(roadmapFeatures).where(eq(roadmapFeatures.id, feature_id)))[0];
    if (!feature) {
      return reply.status(404).send({ status: 'error', message: 'Fonctionnalité introuvable' });
    }

    await db.insert(featureSuggestions)
      .values({
        featureId: feature_id,
        suggestionText: suggestion_text,
        author: author || 'Anonyme',
        email: email || null,
        ipAddress: clientIp,
        status: 'pending'
      });

    return reply.status(200).send({
      status: 'ok',
      message: 'Votre suggestion ou idée complémentaire a été transmise à l\'équipe !'
    });
  });

  // -------------------------------------------------------------
  // ENDPOINTS D'ADMINISTRATION ROADMAP & GESTION DES VOTES
  // -------------------------------------------------------------

  // 5. POST /api/roadmap/features/save : Créer ou mettre à jour une fonctionnalité
  fastify.post('/api/roadmap/features/save', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized', message: 'Session invalide' });

    const parse = FeatureSaveSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    const data = parse.data;
    if (data.id) {
      await db.update(roadmapFeatures)
        .set({
          titleFr: data.title_fr,
          titleEn: data.title_en,
          descFr: data.desc_fr,
          descEn: data.desc_en,
          tag: data.tag,
          sortOrder: data.sort_order,
          votesCount: data.votes_count
        })
        .where(eq(roadmapFeatures.id, data.id));
    } else {
      await db.insert(roadmapFeatures)
        .values({
          titleFr: data.title_fr,
          titleEn: data.title_en,
          descFr: data.desc_fr,
          descEn: data.desc_en,
          tag: data.tag,
          sortOrder: data.sort_order,
          votesCount: data.votes_count
        });
    }

    return reply.send({ status: 'ok', message: 'Fonctionnalité enregistrée avec succès' });
  });

  // 6. POST /api/roadmap/features/delete : Supprimer une fonctionnalité
  fastify.post('/api/roadmap/features/delete', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID invalide' });

    const featId = parse.data.id;
    await db.delete(roadmapVotes).where(eq(roadmapVotes.featureId, featId));
    await db.delete(featureSuggestions).where(eq(featureSuggestions.featureId, featId));
    await db.delete(roadmapFeatures).where(eq(roadmapFeatures.id, featId));

    return reply.send({ status: 'ok', message: 'Fonctionnalité supprimée' });
  });

  // 7. POST /api/roadmap/features/reset-votes : Remise à 0 des votes d'une fonctionnalité
  fastify.post('/api/roadmap/features/reset-votes', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID invalide' });

    const featId = parse.data.id;
    await db.delete(roadmapVotes).where(eq(roadmapVotes.featureId, featId));
    await db.update(roadmapFeatures).set({ votesCount: 0 }).where(eq(roadmapFeatures.id, featId));

    return reply.send({ status: 'ok', message: 'Votes réinitialisés pour cette fonctionnalité' });
  });

  // 8. GET /api/roadmap/votes : Journal d'audit des votes individuels
  fastify.get('/api/roadmap/votes', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const votes = await db.select().from(roadmapVotes).orderBy(desc(roadmapVotes.id)).limit(500);
    const features = await db.select().from(roadmapFeatures);
    const featMap = new Map<number, any>(features.map((f: any) => [Number(f.id), f]));

    const mappedVotes = votes.map((v: any) => {
      const feat = featMap.get(Number(v.featureId));
      return {
        id: v.id,
        feature_id: v.featureId,
        ip_address: v.ipAddress,
        user_agent: v.userAgent,
        created_at: v.createdAt,
        title_fr: feat?.titleFr || `Fonctionnalité #${v.featureId}`,
        tag: feat?.tag || 'GÉNÉRAL'
      };
    });

    return reply.send({ status: 'ok', votes: mappedVotes });
  });

  // 9. POST /api/roadmap/votes/delete : Supprimer un vote individuel
  fastify.post('/api/roadmap/votes/delete', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID de vote invalide' });

    const vote = (await db.select().from(roadmapVotes).where(eq(roadmapVotes.id, parse.data.id)))[0];
    if (vote) {
      const featId = vote.featureId;
      await db.delete(roadmapVotes).where(eq(roadmapVotes.id, parse.data.id));

      const [voteCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(roadmapVotes)
        .where(eq(roadmapVotes.featureId, featId));

      await db.update(roadmapFeatures)
        .set({ votesCount: voteCount?.count || 0 })
        .where(eq(roadmapFeatures.id, featId));
    }

    return reply.send({ status: 'ok', message: 'Vote supprimé et compteur mis à jour' });
  });

  // 10. POST /api/roadmap/votes/recalculate : Recalcul global des compteurs de votes
  fastify.post('/api/roadmap/votes/recalculate', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const features = await db.select().from(roadmapFeatures);
    for (const f of features) {
      const [voteCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(roadmapVotes)
        .where(eq(roadmapVotes.featureId, f.id));
      await db.update(roadmapFeatures)
        .set({ votesCount: voteCount?.count || 0 })
        .where(eq(roadmapFeatures.id, f.id));
    }

    return reply.send({ status: 'ok', message: 'Tous les compteurs de votes ont été recalculés' });
  });

  // 11. POST /api/roadmap/votes/delete-all : Réinitialiser tous les votes à 0
  fastify.post('/api/roadmap/votes/delete-all', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    await db.delete(roadmapVotes);
    await db.update(roadmapFeatures).set({ votesCount: 0 });

    return reply.send({ status: 'ok', message: 'Tous les votes ont été réinitialisés à 0' });
  });

  // 12. GET /api/roadmap/proposals : Liste des propositions communautaires
  fastify.get('/api/roadmap/proposals', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const proposals = await db.select().from(communityProposals).orderBy(desc(communityProposals.id));
    return reply.send({
      status: 'ok',
      proposals: proposals.map((p: any) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        description: p.description,
        author: p.author,
        email: p.email,
        ip_address: p.ipAddress,
        status: p.status,
        created_at: p.createdAt
      }))
    });
  });

  // 13. POST /api/roadmap/proposals/moderate : Modération d'une proposition
  fastify.post('/api/roadmap/proposals/moderate', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = z.object({
      id: z.coerce.number().int().positive(),
      action: z.enum(['approve', 'reject', 'delete', 'edit']),
      title: z.string().optional(),
      category: z.string().optional(),
      description: z.string().optional()
    }).safeParse(request.body);

    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Action invalide' });

    const { id, action, title, category, description } = parse.data;
    const proposal = (await db.select().from(communityProposals).where(eq(communityProposals.id, id)))[0];
    if (!proposal) return reply.status(404).send({ status: 'error', message: 'Proposition introuvable' });

    if (action === 'approve') {
      await db.update(communityProposals).set({ status: 'approved' }).where(eq(communityProposals.id, id));
      // Création automatique de la fonctionnalité au vote
      await db.insert(roadmapFeatures).values({
        titleFr: proposal.title,
        titleEn: proposal.title,
        descFr: proposal.description,
        descEn: proposal.description,
        tag: proposal.category || 'COMMUNAUTÉ',
        votesCount: 1,
        sortOrder: 50
      });
      return reply.send({ status: 'ok', message: 'Idée approuvée et publiée au vote public !' });
    }

    if (action === 'reject') {
      await db.update(communityProposals).set({ status: 'rejected' }).where(eq(communityProposals.id, id));
      return reply.send({ status: 'ok', message: 'Idée rejetée' });
    }

    if (action === 'delete') {
      await db.delete(communityProposals).where(eq(communityProposals.id, id));
      return reply.send({ status: 'ok', message: 'Idée supprimée' });
    }

    if (action === 'edit') {
      await db.update(communityProposals).set({
        title: title || proposal.title,
        category: category || proposal.category,
        description: description || proposal.description
      }).where(eq(communityProposals.id, id));
      return reply.send({ status: 'ok', message: 'Idée mise à jour' });
    }

    return reply.send({ status: 'ok' });
  });

  // 14. POST /api/roadmap/proposals/delete
  fastify.post('/api/roadmap/proposals/delete', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID invalide' });

    await db.delete(communityProposals).where(eq(communityProposals.id, parse.data.id));
    return reply.send({ status: 'ok', message: 'Proposition supprimée' });
  });

  // 15. GET /api/roadmap/suggestions : Liste des compléments suggérés
  fastify.get('/api/roadmap/suggestions', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const sugs = await db.select().from(featureSuggestions).orderBy(desc(featureSuggestions.id));
    const features = await db.select().from(roadmapFeatures);
    const featMap = new Map<number, any>(features.map((f: any) => [Number(f.id), f]));

    const mapped = sugs.map((s: any) => {
      const feat = featMap.get(Number(s.featureId));
      return {
        id: s.id,
        feature_id: s.featureId,
        feature_title: feat?.titleFr || `Fonctionnalité #${s.featureId}`,
        feature_tag: feat?.tag || 'GÉNÉRAL',
        author: s.author,
        email: s.email,
        suggestion_text: s.suggestionText,
        ip_address: s.ipAddress,
        status: s.status,
        created_at: s.createdAt
      };
    });

    return reply.send({ status: 'ok', suggestions: mapped });
  });

  // 16. POST /api/roadmap/suggestions/moderate : Modération / fusion d'un complément
  fastify.post('/api/roadmap/suggestions/moderate', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = z.object({
      id: z.coerce.number().int().positive(),
      action: z.enum(['append', 'approve', 'reject', 'delete'])
    }).safeParse(request.body);

    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'Action invalide' });

    const { id, action } = parse.data;
    const sug = (await db.select().from(featureSuggestions).where(eq(featureSuggestions.id, id)))[0];
    if (!sug) return reply.status(404).send({ status: 'error', message: 'Suggestion introuvable' });

    if (action === 'append') {
      const feat = (await db.select().from(roadmapFeatures).where(eq(roadmapFeatures.id, sug.featureId)))[0];
      if (feat) {
        const addition = `\n\n[Idée communauté]: ${sug.suggestionText}`;
        await db.update(roadmapFeatures).set({
          descFr: (feat.descFr || '') + addition,
          descEn: (feat.descEn || '') + addition
        }).where(eq(roadmapFeatures.id, sug.featureId));
      }
      await db.update(featureSuggestions).set({ status: 'approved' }).where(eq(featureSuggestions.id, id));
      return reply.send({ status: 'ok', message: 'Suggestion fusionnée dans la description de la fonctionnalité !' });
    }

    if (action === 'approve') {
      await db.update(featureSuggestions).set({ status: 'approved' }).where(eq(featureSuggestions.id, id));
      return reply.send({ status: 'ok', message: 'Suggestion approuvée' });
    }

    if (action === 'reject') {
      await db.update(featureSuggestions).set({ status: 'rejected' }).where(eq(featureSuggestions.id, id));
      return reply.send({ status: 'ok', message: 'Suggestion rejetée' });
    }

    if (action === 'delete') {
      await db.delete(featureSuggestions).where(eq(featureSuggestions.id, id));
      return reply.send({ status: 'ok', message: 'Suggestion supprimée' });
    }

    return reply.send({ status: 'ok' });
  });

  // 17. POST /api/roadmap/suggestions/append
  fastify.post('/api/roadmap/suggestions/append', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID invalide' });

    const sug = (await db.select().from(featureSuggestions).where(eq(featureSuggestions.id, parse.data.id)))[0];
    if (!sug) return reply.status(404).send({ status: 'error', message: 'Suggestion introuvable' });

    const feat = (await db.select().from(roadmapFeatures).where(eq(roadmapFeatures.id, sug.featureId)))[0];
    if (feat) {
      const addition = `\n\n[Idée communauté]: ${sug.suggestionText}`;
      await db.update(roadmapFeatures).set({
        descFr: (feat.descFr || '') + addition,
        descEn: (feat.descEn || '') + addition
      }).where(eq(roadmapFeatures.id, sug.featureId));
    }
    await db.update(featureSuggestions).set({ status: 'approved' }).where(eq(featureSuggestions.id, parse.data.id));

    return reply.send({ status: 'ok', message: 'Suggestion fusionnée avec succès' });
  });

  // 18. POST /api/roadmap/suggestions/delete
  fastify.post('/api/roadmap/suggestions/delete', async (request, reply) => {
    const admin = await getAuthAdmin(request);
    if (!admin) return reply.status(401).send({ status: 'unauthorized' });

    const parse = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ status: 'error', message: 'ID invalide' });

    await db.delete(featureSuggestions).where(eq(featureSuggestions.id, parse.data.id));
    return reply.send({ status: 'ok', message: 'Suggestion supprimée' });
  });

  // 19. GET /api/roadmap/github-spec : Spécification GitHub Roadmap au format Markdown
  fastify.get('/api/roadmap/github-spec', async (_request, reply) => {
    const milestones = await db.select().from(roadmapMilestones).orderBy(roadmapMilestones.sortOrder);
    const features = await db.select().from(roadmapFeatures).orderBy(desc(roadmapFeatures.votesCount));

    let md = '# KaïroOS Roadmap & Community Specifications\n\n';
    md += '## Jalons de Développement\n\n';
    for (const m of milestones) {
      md += `### ${m.version} — ${m.titleFr} (${m.statusBadge} - ${m.progressPercent}%)\n`;
      md += `> Échéance : ${m.dateText}\n\n`;
      md += `${m.descFr}\n\n`;
    }

    md += '## Fonctionnalités au Vote Communautaire\n\n';
    for (const f of features) {
      md += `### [${f.tag || 'PROJET'}] ${f.titleFr} — ${f.votesCount || 0} votes\n`;
      md += `${f.descFr}\n\n`;
    }

    return reply.type('text/markdown; charset=utf-8').send(md);
  });
};
