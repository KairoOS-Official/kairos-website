import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  roadmapFeatures,
  roadmapVotes,
  roadmapMilestones,
  communityProposals,
  featureSuggestions,
  bannedIps
} from '../../db/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return request.ip || '127.0.0.1';
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

export const roadmapRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Liste des fonctionnalités au vote avec statut has_voted pour l'IP
  fastify.get('/api/roadmap/features', async (request, reply) => {
    const clientIp = getClientIp(request);

    const features = await db.select().from(roadmapFeatures).orderBy(desc(roadmapFeatures.votesCount), roadmapFeatures.sortOrder);

    const featuresWithVotes = await Promise.all(features.map(async (feat: any) => {
      const featId = Number(feat.id);
      const vote = (await db
        .select()
        .from(roadmapVotes)
        .where(and(eq(roadmapVotes.featureId, featId), eq(roadmapVotes.ipAddress, clientIp))))[0];

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

  // 2. Vote 1-clic par IP
  fastify.post('/api/roadmap/vote', async (request, reply) => {
    const clientIp = getClientIp(request);
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

    // Vérification de vote existant
    const existingVote = (await db
      .select()
      .from(roadmapVotes)
      .where(and(eq(roadmapVotes.featureId, feature_id), eq(roadmapVotes.ipAddress, clientIp))))[0];

    if (existingVote) {
      return reply.status(200).send({
        status: 'already_voted',
        message: `Vous avez déjà voté pour cette fonctionnalité avec cette adresse IP (${clientIp}).`,
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
};


