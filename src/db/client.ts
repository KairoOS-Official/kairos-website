import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import path from 'node:path';

const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

let dbInstance: any;
let sqliteInstance: DatabaseType | null = null;

if (driver === 'supabase' || driver === 'postgres' || driver === 'postgresql') {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
  if (!connectionString) {
    console.warn('⚠️ [DATABASE] Mode Supabase activé mais DATABASE_URL est manquant ! Repli automatique sur SQLite local.');
    const dbPath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'data/kairoos.db');
    sqliteInstance = new Database(dbPath);
    sqliteInstance.pragma('journal_mode = WAL');
    dbInstance = drizzleSqlite(sqliteInstance, { schema });
  } else {
    const client = postgres(connectionString, { prepare: false });
    dbInstance = drizzlePg(client, { schema });
    console.log('⚡ [DATABASE] Connecté avec succès à Supabase (PostgreSQL)');
  }
} else {
  // Mode SQLite Local par défaut
  const dbPath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'data/kairoos.db');
  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma('journal_mode = WAL');
  sqliteInstance.pragma('synchronous = NORMAL');
  sqliteInstance.pragma('cache_size = -64000'); // 64MB cache
  sqliteInstance.pragma('temp_store = MEMORY');
  sqliteInstance.pragma('foreign_keys = ON');

  // Create indexes for high-frequency queries
  sqliteInstance.exec(`
    CREATE INDEX IF NOT EXISTS idx_roadmap_votes_ip_feat ON roadmap_votes(ip_address, feature_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_views_created ON page_views(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_banned_ips_ip ON banned_ips(ip_address);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_ip ON chat_messages(ip_address);
  `);

  dbInstance = drizzleSqlite(sqliteInstance, { schema });
}

export const sqlite: DatabaseType | null = sqliteInstance;
// The application uses a shared query API; PostgreSQL resolves it asynchronously.
export const db: any = dbInstance;
export const currentDbDriver: string = driver;

export async function rawAll<T>(query: unknown): Promise<T[]> {
  if (sqliteInstance) return dbInstance.all(query) as T[];
  return (await dbInstance.execute(query)) as T[];
}
