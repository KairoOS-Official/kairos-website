import type { FastifyPluginAsync } from 'fastify';
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

const VoteSchema = z.object({
  feature_id: z.number()
});

const ProposalSchema = z.object({
  title: z.string().min(1, 'Titre obligatoire'),
  category: z.string().default('GÉNÉRAL'),
  description: z.string().min(1, 'Description détaillée obligatoire'),
  author: z.string().default('Anonyme'),
  email: z.string().email('Email invalide').optional().or(z.literal(''))
});

const SuggestionSchema = z.object({
  feature_id: z.number(),
  suggestion_text: z.string().min(1, 'Texte de suggestion requis'),
  author: z.string().default('Anonyme'),
  email: z.string().email('Email invalide').optional().or(z.literal(''))
});

export const roadmapRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Liste des fonctionnalités au vote avec statut has_voted pour l'IP
  fastify.get('/api/roadmap/features', async (request, reply) => {
    const clientIp = request.ip || '127.0.0.1';

    const features = db.select().from(roadmapFeatures).orderBy(desc(roadmapFeatures.votesCount), roadmapFeatures.sortOrder).all();

    const featuresWithVotes = features.map((feat) => {
      const vote = db
        .select()
        .from(roadmapVotes)
        .where(and(eq(roadmapVotes.featureId, feat.id), eq(roadmapVotes.ipAddress, clientIp)))
        .get();

      const suggestions = db
        .select()
        .from(featureSuggestions)
        .where(and(eq(featureSuggestions.featureId, feat.id), sql`status != 'rejected'`))
        .orderBy(desc(featureSuggestions.id))
        .all();

      return {
        ...feat,
        has_voted: Boolean(vote),
        suggestions
      };
    });

    return reply.status(200).send({
      status: 'ok',
      client_ip: clientIp,
      features: featuresWithVotes
    });
  });

  // 2. Vote 1-clic par IP
  fastify.post('/api/roadmap/vote', async (request, reply) => {
    const clientIp = request.ip || '127.0.0.1';
    const userAgent = request.headers['user-agent'] || 'Unknown';

    // Vérifier si l'IP est bannie du vote
    const ban = db.select().from(bannedIps).where(eq(bannedIps.ipAddress, clientIp)).get();
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

    const feature = db.select().from(roadmapFeatures).where(eq(roadmapFeatures.id, feature_id)).get();
    if (!feature) {
      return reply.status(404).send({ status: 'error', message: 'Fonctionnalité introuvable' });
    }

    // Vérification de vote existant
    const existingVote = db
      .select()
      .from(roadmapVotes)
      .where(and(eq(roadmapVotes.featureId, feature_id), eq(roadmapVotes.ipAddress, clientIp)))
      .get();

    if (existingVote) {
      return reply.status(200).send({
        status: 'already_voted',
        message: `Vous avez déjà voté pour cette fonctionnalité avec cette adresse IP (${clientIp}).`,
        feature_id,
        votes_count: feature.votesCount
      });
    }

    // Enregistrement du vote
    db.insert(roadmapVotes)
      .values({
        featureId: feature_id,
        ipAddress: clientIp,
        userAgent
      })
      .run();

    // Recalcul incrémental
    const [voteCount] = db
      .select({ count: sql<number>`count(*)` })
      .from(roadmapVotes)
      .where(eq(roadmapVotes.featureId, feature_id))
      .all();

    const newCount = voteCount?.count || 1;

    db.update(roadmapFeatures)
      .set({ votesCount: newCount })
      .where(eq(roadmapFeatures.id, feature_id))
      .run();

    return reply.status(200).send({
      status: 'ok',
      message: 'Votre vote a été pris en compte avec succès !',
      feature_id,
      votes_count: newCount
    });
  });

  // 3. Soumission d'une proposition communautaire (Boîte à idées)
  fastify.post('/api/roadmap/propose', async (request, reply) => {
    const clientIp = request.ip || '127.0.0.1';

    const ban = db.select().from(bannedIps).where(eq(bannedIps.ipAddress, clientIp)).get();
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

    db.insert(communityProposals)
      .values({
        title,
        category,
        description,
        author: author || 'Anonyme',
        email: email || null,
        ipAddress: clientIp,
        status: 'pending'
      })
      .run();

    return reply.status(200).send({
      status: 'ok',
      message: 'Votre idée a bien été soumise à l\'équipe ! Elle sera examinée très prochainement.'
    });
  });

  // 4. Soumission d'un complément d'idée sur une fonctionnalité existante
  fastify.post('/api/roadmap/features/suggest', async (request, reply) => {
    const clientIp = request.ip || '127.0.0.1';

    const ban = db.select().from(bannedIps).where(eq(bannedIps.ipAddress, clientIp)).get();
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

    const feature = db.select().from(roadmapFeatures).where(eq(roadmapFeatures.id, feature_id)).get();
    if (!feature) {
      return reply.status(404).send({ status: 'error', message: 'Fonctionnalité introuvable' });
    }

    db.insert(featureSuggestions)
      .values({
        featureId: feature_id,
        suggestionText: suggestion_text,
        author: author || 'Anonyme',
        email: email || null,
        ipAddress: clientIp,
        status: 'pending'
      })
      .run();

    return reply.status(200).send({
      status: 'ok',
      message: 'Votre suggestion ou idée complémentaire a été transmise à l\'équipe !'
    });
  });
};
