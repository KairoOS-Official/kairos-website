import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  siteContentI18n,
  arcadeGames,
  faqItems,
  showcasePlugins,
  showcaseThemes,
  roadmapMilestones,
  roadmapFeatures,
  communityProposals,
  featureSuggestions,
  adminUsers
} from '../../db/schema.js';
import { eq, desc, asc, sql } from 'drizzle-orm';

export async function getAuthenticatedAdmin(request: FastifyRequest) {
  const cookieToken = request.cookies['kairo_admin_session'];
  const authHeader = request.headers.authorization?.replace('Bearer ', '').trim();
  const token = cookieToken || authHeader;
  if (!token) return null;

  return (await db.select().from(adminUsers).where(eq(adminUsers.token, token)))[0] || null;
}

const ContentUpdateSchema = z.object({
  content: z.record(z.string(), z.any()).default({}),
  lang: z.string().optional()
});

const GameSaveSchema = z.object({
  id: z.number().optional(),
  title: z.string().min(1, 'Titre requis'),
  genre: z.string().default(''),
  year: z.string().default(''),
  desc_fr: z.string().default(''),
  desc_en: z.string().default(''),
  image: z.string().default('assets/img/games/mario.png'),
  bg_image: z.string().default('assets/img/wallpapers/bg-mario.jpg'),
  sort_order: z.number().default(0)
});

const FaqSaveSchema = z.object({
  id: z.number().optional(),
  question_fr: z.string().default(''),
  question_en: z.string().default(''),
  answer_fr: z.string().default(''),
  answer_en: z.string().default(''),
  sort_order: z.number().default(0)
});

const PluginSaveSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Nom du plugin requis'),
  desc_fr: z.string().default(''),
  desc_en: z.string().default(''),
  category: z.string().default('GÉNÉRAL'),
  badge: z.string().default('OFFICIEL'),
  version: z.string().default('v1.0.0'),
  author: z.string().default('@KaïroCore'),
  installs: z.string().default('1 000 installs'),
  sort_order: z.number().default(0)
});

const ThemeSaveSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Nom du thème requis'),
  desc_fr: z.string().default(''),
  desc_en: z.string().default(''),
  badge: z.string().default('AMB'),
  rating: z.string().default('★ 5.0'),
  author: z.string().default('@designer'),
  installs: z.string().default('500 installs'),
  preview_class: z.string().default('cyber'),
  sort_order: z.number().default(0)
});

const MilestoneSaveSchema = z.object({
  id: z.number().optional(),
  version: z.string().default(''),
  title_fr: z.string().default(''),
  title_en: z.string().default(''),
  desc_fr: z.string().default(''),
  desc_en: z.string().default(''),
  date_text: z.string().default(''),
  progress_percent: z.number().default(0),
  status_badge: z.string().default('Planifié'),
  sort_order: z.number().default(0)
});

const IdSchema = z.object({
  id: z.number()
});

export const contentRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. GET /api/content (Public, multilingue)
  fastify.get<{ Querystring: { lang?: string } }>('/api/content', async (request, reply) => {
    const lang = request.query.lang === 'en' ? 'en' : 'fr';

    const contentRows = await db.select().from(siteContentI18n).where(eq(siteContentI18n.lang, lang));
    const content: Record<string, string> = {};
    for (const row of contentRows) {
      if (row.contentKey && row.contentValue !== null) {
        content[row.contentKey] = row.contentValue;
      }
    }

    const gamesRaw = await db.select().from(arcadeGames).orderBy(asc(arcadeGames.sortOrder));
    const games = gamesRaw.map((g: any) => ({
      ...g,
      id: Number(g.id),
      title: g.title || '',
      genre: g.genre || '',
      year: g.year || '',
      desc: lang === 'en' ? (g.descEn || g.desc_en || g.descFr || g.desc_fr || '') : (g.descFr || g.desc_fr || ''),
      descFr: g.descFr || g.desc_fr || '',
      descEn: g.descEn || g.desc_en || '',
      desc_fr: g.descFr || g.desc_fr || '',
      desc_en: g.descEn || g.desc_en || '',
      image: g.image || '',
      bgImage: g.bgImage || g.bg_image || '',
      bg_image: g.bgImage || g.bg_image || '',
      sortOrder: Number(g.sortOrder ?? g.sort_order ?? 0),
      sort_order: Number(g.sortOrder ?? g.sort_order ?? 0)
    }));

    const faqRaw = await db.select().from(faqItems).orderBy(asc(faqItems.sortOrder));
    const faq = faqRaw.map((f: any) => ({
      ...f,
      id: Number(f.id),
      question: lang === 'en' ? (f.questionEn || f.question_en || f.questionFr || f.question_fr || '') : (f.questionFr || f.question_fr || ''),
      answer: lang === 'en' ? (f.answerEn || f.answer_en || f.answerFr || f.answer_fr || '') : (f.answerFr || f.answer_fr || ''),
      questionFr: f.questionFr || f.question_fr || '',
      questionEn: f.questionEn || f.question_en || '',
      answerFr: f.answerFr || f.answer_fr || '',
      answerEn: f.answerEn || f.answer_en || '',
      question_fr: f.questionFr || f.question_fr || '',
      question_en: f.questionEn || f.question_en || '',
      answer_fr: f.answerFr || f.answer_fr || '',
      answer_en: f.answerEn || f.answer_en || '',
      sortOrder: Number(f.sortOrder ?? f.sort_order ?? 0),
      sort_order: Number(f.sortOrder ?? f.sort_order ?? 0)
    }));

    const pluginsRaw = await db.select().from(showcasePlugins).orderBy(asc(showcasePlugins.sortOrder));
    const plugins = pluginsRaw.map((p: any) => ({
      ...p,
      id: Number(p.id),
      name: p.name || '',
      desc: lang === 'en' ? (p.descEn || p.desc_en || p.descFr || p.desc_fr || '') : (p.descFr || p.desc_fr || ''),
      descFr: p.descFr || p.desc_fr || '',
      descEn: p.descEn || p.desc_en || '',
      desc_fr: p.descFr || p.desc_fr || '',
      desc_en: p.descEn || p.desc_en || '',
      category: p.category || 'GÉNÉRAL',
      badge: p.badge || 'OFFICIEL',
      version: p.version || 'v1.0.0',
      author: p.author || '@KaïroCore',
      installs: p.installs || '1 000 installs',
      sortOrder: Number(p.sortOrder ?? p.sort_order ?? 0),
      sort_order: Number(p.sortOrder ?? p.sort_order ?? 0)
    }));

    const themesRaw = await db.select().from(showcaseThemes).orderBy(asc(showcaseThemes.sortOrder));
    const themes = themesRaw.map((t: any) => ({
      ...t,
      id: Number(t.id),
      name: t.name || '',
      desc: lang === 'en' ? (t.descEn || t.desc_en || t.descFr || t.desc_fr || '') : (t.descFr || t.desc_fr || ''),
      descFr: t.descFr || t.desc_fr || '',
      descEn: t.descEn || t.desc_en || '',
      desc_fr: t.descFr || t.desc_fr || '',
      desc_en: t.descEn || t.desc_en || '',
      badge: t.badge || 'AMB',
      rating: t.rating || '★ 5.0',
      author: t.author || '@designer',
      installs: t.installs || '500 installs',
      previewClass: t.previewClass || t.preview_class || 'cyber',
      preview_class: t.previewClass || t.preview_class || 'cyber',
      sortOrder: Number(t.sortOrder ?? t.sort_order ?? 0),
      sort_order: Number(t.sortOrder ?? t.sort_order ?? 0)
    }));

    const milestonesRaw = await db.select().from(roadmapMilestones).orderBy(asc(roadmapMilestones.sortOrder));
    const milestones = milestonesRaw.map((m: any) => ({
      ...m,
      id: Number(m.id),
      version: m.version || '',
      title: lang === 'en' ? (m.titleEn || m.title_en || m.titleFr || m.title_fr || '') : (m.titleFr || m.title_fr || ''),
      desc: lang === 'en' ? (m.descEn || m.desc_en || m.descFr || m.desc_fr || '') : (m.descFr || m.desc_fr || ''),
      titleFr: m.titleFr || m.title_fr || '',
      titleEn: m.titleEn || m.title_en || '',
      descFr: m.descFr || m.desc_fr || '',
      descEn: m.descEn || m.desc_en || '',
      title_fr: m.titleFr || m.title_fr || '',
      title_en: m.titleEn || m.title_en || '',
      desc_fr: m.descFr || m.desc_fr || '',
      desc_en: m.descEn || m.desc_en || '',
      dateText: m.dateText || m.date_text || '',
      date_text: m.dateText || m.date_text || '',
      progressPercent: Number(m.progressPercent ?? m.progress_percent ?? 0),
      progress_percent: Number(m.progressPercent ?? m.progress_percent ?? 0),
      statusBadge: m.statusBadge || m.status_badge || 'Planifié',
      status_badge: m.statusBadge || m.status_badge || 'Planifié',
      sortOrder: Number(m.sortOrder ?? m.sort_order ?? 0),
      sort_order: Number(m.sortOrder ?? m.sort_order ?? 0)
    }));

    return reply.status(200).send({
      status: 'ok',
      lang,
      content,
      games,
      faq,
      plugins,
      themes,
      milestones
    });
  });

  // 2. GET /api/content/all (Full catalog pour back-office admin)
  fastify.get('/api/content/all', async (_request, reply) => {
    const contentRows = await db.select().from(siteContentI18n);
    const contentI18n: Record<string, Record<string, string>> = {};
    for (const row of contentRows) {
      if (row.contentKey && row.lang) {
        if (!contentI18n[row.contentKey]) {
          contentI18n[row.contentKey] = {};
        }
        contentI18n[row.contentKey][row.lang] = row.contentValue || '';
      }
    }

    const gamesRaw = await db.select().from(arcadeGames).orderBy(asc(arcadeGames.sortOrder));
    const games = gamesRaw.map((g: any) => ({
      ...g,
      id: Number(g.id),
      title: g.title || '',
      genre: g.genre || '',
      year: g.year || '',
      descFr: g.descFr || g.desc_fr || '',
      descEn: g.descEn || g.desc_en || '',
      desc_fr: g.descFr || g.desc_fr || '',
      desc_en: g.descEn || g.desc_en || '',
      image: g.image || '',
      bgImage: g.bgImage || g.bg_image || '',
      bg_image: g.bgImage || g.bg_image || '',
      sortOrder: Number(g.sortOrder ?? g.sort_order ?? 0),
      sort_order: Number(g.sortOrder ?? g.sort_order ?? 0)
    }));

    const faqRaw = await db.select().from(faqItems).orderBy(asc(faqItems.sortOrder));
    const faq = faqRaw.map((f: any) => ({
      ...f,
      id: Number(f.id),
      questionFr: f.questionFr || f.question_fr || '',
      questionEn: f.questionEn || f.question_en || '',
      answerFr: f.answerFr || f.answer_fr || '',
      answerEn: f.answerEn || f.answer_en || '',
      question_fr: f.questionFr || f.question_fr || '',
      question_en: f.questionEn || f.question_en || '',
      answer_fr: f.answerFr || f.answer_fr || '',
      answer_en: f.answerEn || f.answer_en || '',
      sortOrder: Number(f.sortOrder ?? f.sort_order ?? 0),
      sort_order: Number(f.sortOrder ?? f.sort_order ?? 0)
    }));

    const pluginsRaw = await db.select().from(showcasePlugins).orderBy(asc(showcasePlugins.sortOrder));
    const plugins = pluginsRaw.map((p: any) => ({
      ...p,
      id: Number(p.id),
      name: p.name || '',
      descFr: p.descFr || p.desc_fr || '',
      descEn: p.descEn || p.desc_en || '',
      desc_fr: p.descFr || p.desc_fr || '',
      desc_en: p.descEn || p.desc_en || '',
      category: p.category || 'GÉNÉRAL',
      badge: p.badge || 'OFFICIEL',
      version: p.version || 'v1.0.0',
      author: p.author || '@KaïroCore',
      installs: p.installs || '1 000 installs',
      sortOrder: Number(p.sortOrder ?? p.sort_order ?? 0),
      sort_order: Number(p.sortOrder ?? p.sort_order ?? 0)
    }));

    const themesRaw = await db.select().from(showcaseThemes).orderBy(asc(showcaseThemes.sortOrder));
    const themes = themesRaw.map((t: any) => ({
      ...t,
      id: Number(t.id),
      name: t.name || '',
      descFr: t.descFr || t.desc_fr || '',
      descEn: t.descEn || t.desc_en || '',
      desc_fr: t.descFr || t.desc_fr || '',
      desc_en: t.descEn || t.desc_en || '',
      badge: t.badge || 'AMB',
      rating: t.rating || '★ 5.0',
      author: t.author || '@designer',
      installs: t.installs || '500 installs',
      previewClass: t.previewClass || t.preview_class || 'cyber',
      preview_class: t.previewClass || t.preview_class || 'cyber',
      sortOrder: Number(t.sortOrder ?? t.sort_order ?? 0),
      sort_order: Number(t.sortOrder ?? t.sort_order ?? 0)
    }));

    const milestonesRaw = await db.select().from(roadmapMilestones).orderBy(asc(roadmapMilestones.sortOrder));
    const milestones = milestonesRaw.map((m: any) => ({
      ...m,
      id: Number(m.id),
      version: m.version || '',
      titleFr: m.titleFr || m.title_fr || '',
      titleEn: m.titleEn || m.title_en || '',
      descFr: m.descFr || m.desc_fr || '',
      descEn: m.descEn || m.desc_en || '',
      title_fr: m.titleFr || m.title_fr || '',
      title_en: m.titleEn || m.title_en || '',
      desc_fr: m.descFr || m.desc_fr || '',
      desc_en: m.descEn || m.desc_en || '',
      dateText: m.dateText || m.date_text || '',
      date_text: m.dateText || m.date_text || '',
      progressPercent: Number(m.progressPercent ?? m.progress_percent ?? 0),
      progress_percent: Number(m.progressPercent ?? m.progress_percent ?? 0),
      statusBadge: m.statusBadge || m.status_badge || 'Planifié',
      status_badge: m.statusBadge || m.status_badge || 'Planifié',
      sortOrder: Number(m.sortOrder ?? m.sort_order ?? 0),
      sort_order: Number(m.sortOrder ?? m.sort_order ?? 0)
    }));

    const featuresRaw = await db.select().from(roadmapFeatures).orderBy(desc(roadmapFeatures.votesCount), asc(roadmapFeatures.sortOrder));
    const features = featuresRaw.map((feat: any) => ({
      ...feat,
      id: Number(feat.id),
      titleFr: feat.titleFr || feat.title_fr || '',
      titleEn: feat.titleEn || feat.title_en || '',
      descFr: feat.descFr || feat.desc_fr || '',
      descEn: feat.descEn || feat.desc_en || '',
      title_fr: feat.titleFr || feat.title_fr || '',
      title_en: feat.titleEn || feat.title_en || '',
      desc_fr: feat.descFr || feat.desc_fr || '',
      desc_en: feat.descEn || feat.desc_en || '',
      tag: feat.tag || 'GÉNÉRAL',
      votesCount: Number(feat.votesCount ?? feat.votes_count ?? 0),
      votes_count: Number(feat.votesCount ?? feat.votes_count ?? 0),
      sortOrder: Number(feat.sortOrder ?? feat.sort_order ?? 0),
      sort_order: Number(feat.sortOrder ?? feat.sort_order ?? 0)
    }));

    const proposals = await db.select().from(communityProposals).orderBy(desc(communityProposals.id));

    const suggestions = await db
      .select({
        id: featureSuggestions.id,
        featureId: featureSuggestions.featureId,
        author: featureSuggestions.author,
        email: featureSuggestions.email,
        suggestionText: featureSuggestions.suggestionText,
        status: featureSuggestions.status,
        ipAddress: featureSuggestions.ipAddress,
        createdAt: featureSuggestions.createdAt,
        featureTitle: roadmapFeatures.titleFr,
        featureTag: roadmapFeatures.tag
      })
      .from(featureSuggestions)
      .leftJoin(roadmapFeatures, eq(featureSuggestions.featureId, roadmapFeatures.id))
      .orderBy(desc(featureSuggestions.id));

    return reply.status(200).send({
      status: 'ok',
      content: contentI18n,
      games,
      faq,
      plugins,
      themes,
      milestones,
      features,
      proposals,
      suggestions
    });
  });

  // 3. POST /api/content/update (Mise à jour CMS des clés i18n)
  fastify.post('/api/content/update', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = ContentUpdateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: 'Format invalide' });
    }

    const { content, lang } = parse.data;

    for (const [key, val] of Object.entries(content)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const [l, text] of Object.entries(val)) {
          await db.insert(siteContentI18n)
            .values({
              contentKey: key,
              lang: l,
              contentValue: String(text),
              updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .onConflictDoUpdate({
              target: [siteContentI18n.contentKey, siteContentI18n.lang],
              set: {
                contentValue: String(text),
                updatedAt: sql`CURRENT_TIMESTAMP`
              }
            });
        }
      } else if (lang) {
        await db.insert(siteContentI18n)
          .values({
            contentKey: key,
            lang,
            contentValue: String(val),
            updatedAt: sql`CURRENT_TIMESTAMP`
          })
          .onConflictDoUpdate({
            target: [siteContentI18n.contentKey, siteContentI18n.lang],
            set: {
              contentValue: String(val),
              updatedAt: sql`CURRENT_TIMESTAMP`
            }
          });
      }
    }

    return reply.status(200).send({ status: 'ok', message: 'Contenus mis à jour' });
  });

  // 4. POST /api/games/save
  fastify.post('/api/games/save', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = GameSaveSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    const d = parse.data;
    if (d.id) {
      await db.update(arcadeGames)
        .set({
          title: d.title,
          genre: d.genre,
          year: d.year,
          descFr: d.desc_fr,
          descEn: d.desc_en,
          image: d.image,
          bgImage: d.bg_image,
          sortOrder: d.sort_order
        })
        .where(eq(arcadeGames.id, d.id));
    } else {
      await db.insert(arcadeGames)
        .values({
          title: d.title,
          genre: d.genre,
          year: d.year,
          descFr: d.desc_fr,
          descEn: d.desc_en,
          image: d.image,
          bgImage: d.bg_image,
          sortOrder: d.sort_order
        });
    }

    return reply.status(200).send({ status: 'ok', message: 'Jeu enregistré' });
  });

  // 5. POST /api/games/delete
  fastify.post('/api/games/delete', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = IdSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: 'ID requis' });
    }

    await db.delete(arcadeGames).where(eq(arcadeGames.id, parse.data.id));
    return reply.status(200).send({ status: 'ok', message: 'Jeu supprimé' });
  });

  // 6. POST /api/faq/save
  fastify.post('/api/faq/save', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = FaqSaveSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: 'Données invalides' });
    }

    const d = parse.data;
    if (d.id) {
      await db.update(faqItems)
        .set({
          questionFr: d.question_fr,
          questionEn: d.question_en,
          answerFr: d.answer_fr,
          answerEn: d.answer_en,
          sortOrder: d.sort_order
        })
        .where(eq(faqItems.id, d.id));
    } else {
      await db.insert(faqItems)
        .values({
          questionFr: d.question_fr,
          questionEn: d.question_en,
          answerFr: d.answer_fr,
          answerEn: d.answer_en,
          sortOrder: d.sort_order
        });
    }

    return reply.status(200).send({ status: 'ok', message: 'Question FAQ enregistrée' });
  });

  // 7. POST /api/faq/delete
  fastify.post('/api/faq/delete', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = IdSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: 'ID requis' });
    }

    await db.delete(faqItems).where(eq(faqItems.id, parse.data.id));
    return reply.status(200).send({ status: 'ok', message: 'Question FAQ supprimée' });
  });

  // 8. POST /api/plugins/save
  fastify.post('/api/plugins/save', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = PluginSaveSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    const d = parse.data;
    if (d.id) {
      await db.update(showcasePlugins)
        .set({
          name: d.name,
          descFr: d.desc_fr,
          descEn: d.desc_en,
          category: d.category,
          badge: d.badge,
          version: d.version,
          author: d.author,
          installs: d.installs,
          sortOrder: d.sort_order
        })
        .where(eq(showcasePlugins.id, d.id));
    } else {
      await db.insert(showcasePlugins)
        .values({
          name: d.name,
          descFr: d.desc_fr,
          descEn: d.desc_en,
          category: d.category,
          badge: d.badge,
          version: d.version,
          author: d.author,
          installs: d.installs,
          sortOrder: d.sort_order
        });
    }

    return reply.status(200).send({ status: 'ok', message: 'Plugin enregistré' });
  });

  // 9. POST /api/plugins/delete
  fastify.post('/api/plugins/delete', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = IdSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: 'ID requis' });
    }

    await db.delete(showcasePlugins).where(eq(showcasePlugins.id, parse.data.id));
    return reply.status(200).send({ status: 'ok', message: 'Plugin supprimé' });
  });

  // 10. POST /api/themes/save
  fastify.post('/api/themes/save', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = ThemeSaveSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    const d = parse.data;
    if (d.id) {
      await db.update(showcaseThemes)
        .set({
          name: d.name,
          descFr: d.desc_fr,
          descEn: d.desc_en,
          badge: d.badge,
          rating: d.rating,
          author: d.author,
          installs: d.installs,
          previewClass: d.preview_class,
          sortOrder: d.sort_order
        })
        .where(eq(showcaseThemes.id, d.id));
    } else {
      await db.insert(showcaseThemes)
        .values({
          name: d.name,
          descFr: d.desc_fr,
          descEn: d.desc_en,
          badge: d.badge,
          rating: d.rating,
          author: d.author,
          installs: d.installs,
          previewClass: d.preview_class,
          sortOrder: d.sort_order
        });
    }

    return reply.status(200).send({ status: 'ok', message: 'Thème enregistré' });
  });

  // 11. POST /api/themes/delete
  fastify.post('/api/themes/delete', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = IdSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: 'ID requis' });
    }

    await db.delete(showcaseThemes).where(eq(showcaseThemes.id, parse.data.id));
    return reply.status(200).send({ status: 'ok', message: 'Thème supprimé' });
  });

  // 12. POST /api/milestones/save
  fastify.post('/api/milestones/save', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = MilestoneSaveSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: parse.error.issues[0]?.message || 'Données invalides' });
    }

    const d = parse.data;
    if (d.id) {
      await db.update(roadmapMilestones)
        .set({
          version: d.version,
          titleFr: d.title_fr,
          titleEn: d.title_en,
          descFr: d.desc_fr,
          descEn: d.desc_en,
          dateText: d.date_text,
          progressPercent: d.progress_percent,
          statusBadge: d.status_badge,
          sortOrder: d.sort_order
        })
        .where(eq(roadmapMilestones.id, d.id));
    } else {
      await db.insert(roadmapMilestones)
        .values({
          version: d.version,
          titleFr: d.title_fr,
          titleEn: d.title_en,
          descFr: d.desc_fr,
          descEn: d.desc_en,
          dateText: d.date_text,
          progressPercent: d.progress_percent,
          statusBadge: d.status_badge,
          sortOrder: d.sort_order
        });
    }

    return reply.status(200).send({ status: 'ok', message: 'Jalon enregistré' });
  });

  // 13. POST /api/milestones/delete
  fastify.post('/api/milestones/delete', async (request, reply) => {
    if (!(await getAuthenticatedAdmin(request))) {
      return reply.status(401).send({ status: 'unauthorized', message: 'Accès refusé' });
    }

    const parse = IdSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ status: 'error', message: 'ID requis' });
    }

    await db.delete(roadmapMilestones).where(eq(roadmapMilestones.id, parse.data.id));
    return reply.status(200).send({ status: 'ok', message: 'Jalon supprimé' });
  });
};


