import { describe, it, expect } from 'vitest';
import { db } from './client.js';
import { adminUsers, siteContentI18n, arcadeGames, roadmapFeatures } from './schema.js';
import { count } from 'drizzle-orm';

describe('Drizzle SQLite Integration', () => {
  it('reads existing admin_users table without alteration', async () => {
    const [adminRow] = await db.select().from(adminUsers).limit(1);
    expect(adminRow).toBeDefined();
    expect(adminRow.username).toBe('admin');
  });

  it('reads existing site_content_i18n entries', async () => {
    const [total] = await db.select({ value: count() }).from(siteContentI18n);
    expect(total.value).toBeGreaterThanOrEqual(70);
  });

  it('reads existing arcade_games entries', async () => {
    const games = await db.select().from(arcadeGames).limit(5);
    expect(games.length).toBeGreaterThan(0);
    expect(games[0]).toHaveProperty('title');
  });

  it('reads existing roadmap_features and vote counts', async () => {
    const features = await db.select().from(roadmapFeatures).limit(5);
    expect(features.length).toBeGreaterThan(0);
    expect(features[0]).toHaveProperty('votesCount');
  });
});
