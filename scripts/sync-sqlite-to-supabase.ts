import Database from 'better-sqlite3';
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const databaseUrl = process.argv[2] || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ Erreur: Aucune DATABASE_URL fournie !');
    console.error('Usage: npx tsx scripts/sync-sqlite-to-supabase.ts "<DATABASE_URL>"');
    process.exit(1);
  }

  const dbPath = path.resolve(process.cwd(), 'data/kairoos.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Fichier SQLite introuvable: ${dbPath}`);
    process.exit(1);
  }

  console.log('🔄 Connexion à PostgreSQL / Supabase...');
  const sql = postgres(databaseUrl, { ssl: 'require', max: 5 });

  try {
    // 1. Exécution du schéma
    const schemaFile = path.resolve(process.cwd(), 'scripts/supabase-schema.sql');
    const schemaSql = fs.readFileSync(schemaFile, 'utf-8');
    console.log('📦 Application du schéma SQL...');
    await sql.unsafe(schemaSql);
    console.log('✅ Tables créées avec succès dans Supabase.');

    // 2. Migration des données depuis SQLite
    const sqlite = new Database(dbPath, { readonly: true });

    const tablesToMigrate = [
      'admin_security_config',
      'admin_users',
      'showcase_plugins',
      'showcase_themes',
      'arcade_games',
      'roadmap_milestones',
      'roadmap_features',
      'faq_items',
      'site_content',
      'site_content_i18n',
      'community_proposals',
      'roadmap_votes'
    ];

    for (const table of tablesToMigrate) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, any>[];
      if (rows.length === 0) continue;

      console.log(`📤 Migration de ${table} (${rows.length} lignes)...`);

      for (const row of rows) {
        const keys = Object.keys(row);
        const values = Object.values(row);

        // Convert SQLite camelCase/snake_case mapping if necessary
        // In this schema, columns match exactly the DB table definition
        await sql`
          INSERT INTO ${sql(table)} ${sql(row)}
          ON CONFLICT DO NOTHING
        `;
      }

      // Reset auto-increment sequence if table has serial 'id'
      try {
        await sql.unsafe(`
          SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true);
        `);
      } catch {
        // Table does not have serial id or has composite key
      }
    }

    console.log('🎉 Migration et synchronisation terminées avec succès !');
  } catch (err) {
    console.error('❌ Erreur lors de la migration:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
