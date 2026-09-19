-- ===================================================
-- Schéma PostgreSQL / Supabase pour KaïroOS Website
-- ===================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT,
  token TEXT,
  role TEXT DEFAULT 'superadmin',
  permissions TEXT DEFAULT '["all"]',
  last_login TEXT,
  last_ip TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_security_config (
  id INTEGER PRIMARY KEY,
  access_mode TEXT DEFAULT 'all',
  allowed_ips TEXT DEFAULT '127.0.0.1,::1'
);

CREATE TABLE IF NOT EXISTS admin_login_logs (
  id SERIAL PRIMARY KEY,
  ip_address TEXT,
  username_attempted TEXT,
  status TEXT,
  user_agent TEXT,
  sanction_applied INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS security_notifications (
  id SERIAL PRIMARY KEY,
  ip_address TEXT,
  type TEXT,
  title TEXT,
  message TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS banned_ips (
  id SERIAL PRIMARY KEY,
  ip_address TEXT UNIQUE NOT NULL,
  ban_type TEXT DEFAULT 'permanent',
  expires_at TIMESTAMP WITH TIME ZONE,
  block_vote INTEGER DEFAULT 1,
  block_proposal INTEGER DEFAULT 1,
  block_suggestion INTEGER DEFAULT 1,
  block_all INTEGER DEFAULT 0,
  reason TEXT DEFAULT 'Non respect des règles de la communauté',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ban_appeals (
  id SERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  email TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  admin_response TEXT,
  archived INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  sender TEXT DEFAULT 'admin' NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roadmap_features (
  id SERIAL PRIMARY KEY,
  title_fr TEXT,
  title_en TEXT,
  desc_fr TEXT,
  desc_en TEXT,
  tag TEXT,
  votes_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roadmap_milestones (
  id SERIAL PRIMARY KEY,
  version TEXT,
  title_fr TEXT,
  title_en TEXT,
  desc_fr TEXT,
  desc_en TEXT,
  date_text TEXT,
  progress_percent INTEGER DEFAULT 0,
  status_badge TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roadmap_votes (
  id SERIAL PRIMARY KEY,
  feature_id INTEGER NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_proposals (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'GÉNÉRAL',
  description TEXT NOT NULL,
  author TEXT DEFAULT 'Anonyme',
  email TEXT,
  ip_address TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feature_suggestions (
  id SERIAL PRIMARY KEY,
  feature_id INTEGER NOT NULL,
  author TEXT DEFAULT 'Anonyme',
  email TEXT,
  suggestion_text TEXT NOT NULL,
  ip_address TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS arcade_games (
  id SERIAL PRIMARY KEY,
  title TEXT,
  genre TEXT,
  year TEXT,
  desc_fr TEXT,
  desc_en TEXT,
  image TEXT,
  bg_image TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS showcase_plugins (
  id SERIAL PRIMARY KEY,
  name TEXT,
  desc_fr TEXT,
  desc_en TEXT,
  category TEXT,
  badge TEXT,
  version TEXT,
  author TEXT,
  installs TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS showcase_themes (
  id SERIAL PRIMARY KEY,
  name TEXT,
  desc_fr TEXT,
  desc_en TEXT,
  badge TEXT,
  rating TEXT,
  author TEXT,
  installs TEXT,
  preview_class TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faq_items (
  id SERIAL PRIMARY KEY,
  question_fr TEXT,
  question_en TEXT,
  answer_fr TEXT,
  answer_en TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_content (
  content_key TEXT PRIMARY KEY,
  content_value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_content_i18n (
  content_key TEXT NOT NULL,
  lang TEXT NOT NULL,
  content_value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (content_key, lang)
);

CREATE TABLE IF NOT EXISTS page_views (
  id SERIAL PRIMARY KEY,
  page TEXT,
  session_id TEXT,
  referrer TEXT,
  ip_address TEXT,
  os TEXT DEFAULT 'Inconnu',
  browser TEXT DEFAULT 'Inconnu',
  device TEXT DEFAULT 'desktop',
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT,
  target TEXT,
  page TEXT,
  session_id TEXT,
  meta_json TEXT,
  ip_address TEXT,
  os TEXT DEFAULT 'Inconnu',
  browser TEXT DEFAULT 'Inconnu',
  device TEXT DEFAULT 'desktop',
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_roadmap_votes_ip_feat ON roadmap_votes(ip_address, feature_id);
CREATE INDEX IF NOT EXISTS idx_analytics_views_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_banned_ips_ip ON banned_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_chat_messages_ip ON chat_messages(ip_address);
