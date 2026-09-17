import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 1. Admin Users & Permissions (RBAC)
export const adminUsers = sqliteTable('admin_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').unique(),
  passwordHash: text('password_hash'),
  token: text('token'),
  role: text('role').default('superadmin'),
  permissions: text('permissions').default('["all"]'),
  lastLogin: text('last_login'),
  lastIp: text('last_ip'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 2. Admin Security Config (IP Restriction)
export const adminSecurityConfig = sqliteTable('admin_security_config', {
  id: integer('id').primaryKey(),
  accessMode: text('access_mode').default('all'),
  allowedIps: text('allowed_ips').default('127.0.0.1,::1')
});

// 3. Admin Login Logs (Audit Security)
export const adminLoginLogs = sqliteTable('admin_login_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ipAddress: text('ip_address'),
  usernameAttempted: text('username_attempted'),
  status: text('status'),
  userAgent: text('user_agent'),
  sanctionApplied: integer('sanction_applied').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 4. Security Notifications
export const securityNotifications = sqliteTable('security_notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ipAddress: text('ip_address'),
  type: text('type'),
  title: text('title'),
  message: text('message'),
  isRead: integer('is_read').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 5. Banned IPs (Granular Security Actions)
export const bannedIps = sqliteTable('banned_ips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ipAddress: text('ip_address').unique().notNull(),
  banType: text('ban_type').default('permanent'),
  expiresAt: text('expires_at'),
  blockVote: integer('block_vote').default(1),
  blockProposal: integer('block_proposal').default(1),
  blockSuggestion: integer('block_suggestion').default(1),
  blockAll: integer('block_all').default(0),
  reason: text('reason').default('Non respect des règles de la communauté'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 6. Ban Appeals (Opposition to sanctions)
export const banAppeals = sqliteTable('ban_appeals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ipAddress: text('ip_address').notNull(),
  email: text('email'),
  message: text('message').notNull(),
  status: text('status').default('pending'),
  adminResponse: text('admin_response'),
  archived: integer('archived').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 7. Visitor <-> Admin Chat Messages
export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ipAddress: text('ip_address').notNull(),
  sender: text('sender').default('admin').notNull(),
  message: text('message').notNull(),
  isRead: integer('is_read').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 8. Roadmap Features
export const roadmapFeatures = sqliteTable('roadmap_features', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  titleFr: text('title_fr'),
  titleEn: text('title_en'),
  descFr: text('desc_fr'),
  descEn: text('desc_en'),
  tag: text('tag'),
  votesCount: integer('votes_count').default(0),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 9. Roadmap Milestones
export const roadmapMilestones = sqliteTable('roadmap_milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  version: text('version'),
  titleFr: text('title_fr'),
  titleEn: text('title_en'),
  descFr: text('desc_fr'),
  descEn: text('desc_en'),
  dateText: text('date_text'),
  progressPercent: integer('progress_percent').default(0),
  statusBadge: text('status_badge'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 10. Roadmap Votes (1 unique vote per IP / feature)
export const roadmapVotes = sqliteTable('roadmap_votes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  featureId: integer('feature_id').notNull(),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 11. Community Proposals (Idea box)
export const communityProposals = sqliteTable('community_proposals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  category: text('category').default('GÉNÉRAL'),
  description: text('description').notNull(),
  author: text('author').default('Anonyme'),
  email: text('email'),
  ipAddress: text('ip_address'),
  status: text('status').default('pending'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 12. Feature Suggestions (Complement to feature)
export const featureSuggestions = sqliteTable('feature_suggestions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  featureId: integer('feature_id').notNull(),
  author: text('author').default('Anonyme'),
  email: text('email'),
  suggestionText: text('suggestion_text').notNull(),
  ipAddress: text('ip_address'),
  status: text('status').default('pending'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 13. Arcade Games (Showcase Demo)
export const arcadeGames = sqliteTable('arcade_games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title'),
  genre: text('genre'),
  year: text('year'),
  descFr: text('desc_fr'),
  descEn: text('desc_en'),
  image: text('image'),
  bgImage: text('bg_image'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 14. Showcase Plugins
export const showcasePlugins = sqliteTable('showcase_plugins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  descFr: text('desc_fr'),
  descEn: text('desc_en'),
  category: text('category'),
  badge: text('badge'),
  version: text('version'),
  author: text('author'),
  installs: text('installs'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 15. Showcase Themes
export const showcaseThemes = sqliteTable('showcase_themes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  descFr: text('desc_fr'),
  descEn: text('desc_en'),
  badge: text('badge'),
  rating: text('rating'),
  author: text('author'),
  installs: text('installs'),
  previewClass: text('preview_class'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 16. FAQ Items
export const faqItems = sqliteTable('faq_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionFr: text('question_fr'),
  questionEn: text('question_en'),
  answerFr: text('answer_fr'),
  answerEn: text('answer_en'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 17. Site Content Legacy
export const siteContent = sqliteTable('site_content', {
  contentKey: text('content_key').primaryKey(),
  contentValue: text('content_value'),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// 18. Site Content i18n
export const siteContentI18n = sqliteTable('site_content_i18n', {
  contentKey: text('content_key').notNull(),
  lang: text('lang').notNull(),
  contentValue: text('content_value'),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => [
  primaryKey({ columns: [table.contentKey, table.lang] })
]);

// 19. Page Views Analytics
export const pageViews = sqliteTable('page_views', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  page: text('page'),
  sessionId: text('session_id'),
  referrer: text('referrer'),
  ipAddress: text('ip_address'),
  os: text('os').default('Inconnu'),
  browser: text('browser').default('Inconnu'),
  device: text('device').default('desktop'),
  durationSeconds: integer('duration_seconds').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// 20. Analytics Events (Clicks, downloads, consent)
export const analyticsEvents = sqliteTable('analytics_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventType: text('event_type'),
  target: text('target'),
  page: text('page'),
  sessionId: text('session_id'),
  metaJson: text('meta_json'),
  ipAddress: text('ip_address'),
  os: text('os').default('Inconnu'),
  browser: text('browser').default('Inconnu'),
  device: text('device').default('desktop'),
  durationSeconds: integer('duration_seconds').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});
