import argon2 from 'argon2';
import crypto from 'node:crypto';
import { currentDbDriver, db } from '../../db/client.js';
import { adminUsers, adminLoginLogs, bannedIps, securityNotifications } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import type { AdminUserPublic } from '../../types.js';

// Legacy password hash fallback (SHA-256 with static salt from Python auth.py)
export function legacyHashPassword(password: string, salt = 'kairo_salt_2026'): string {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1
  });
}

export async function verifyPassword(hashOrLegacy: string, passwordAttempt: string): Promise<boolean> {
  if (hashOrLegacy.startsWith('$argon2')) {
    try {
      return await argon2.verify(hashOrLegacy, passwordAttempt);
    } catch {
      return false;
    }
  }
  // Fallback transparent pour migrer les comptes créés sous Python
  return legacyHashPassword(passwordAttempt) === hashOrLegacy;
}

// In-memory brute force tracker (IP -> { count, lockedUntil })
interface BruteForceRecord {
  count: number;
  lockedUntil: number;
}

const failedLogins = new Map<string, BruteForceRecord>();
const threeDayExpiry = ['supabase', 'postgres', 'postgresql'].includes(currentDbDriver)
  ? sql`CURRENT_TIMESTAMP + INTERVAL '3 days'`
  : sql`datetime('now', '+3 days')`;

export function checkBruteForceLock(ip: string): { locked: boolean; remainingSeconds: number } {
  const now = Math.floor(Date.now() / 1000);
  const record = failedLogins.get(ip);
  if (record && record.lockedUntil > now) {
    return {
      locked: true,
      remainingSeconds: record.lockedUntil - now
    };
  }
  return { locked: false, remainingSeconds: 0 };
}

export async function recordFailedLogin(ip: string, usernameAttempted: string, userAgent = 'Unknown'): Promise<{ lockedNow: boolean; remainingAttempts: number }> {
  const now = Math.floor(Date.now() / 1000);
  const record = failedLogins.get(ip) || { count: 0, lockedUntil: 0 };
  record.count += 1;

  if (record.count >= 3) {
    record.lockedUntil = now + 3600; // 1h de blocage
    failedLogins.set(ip, record);

    const banReason = `Sanction automatique de sécurité : 3 tentatives de connexion non autorisées à l'espace d'administration (compte visé : '${usernameAttempted || 'inconnu'}').`;

    // Sanctionne automatiquement l'IP en base de données (révoque les votes et la boîte à idées pendant 3 jours)
    const existingBan = (await db.select().from(bannedIps).where(eq(bannedIps.ipAddress, ip)))[0];
    if (existingBan) {
      await db.update(bannedIps)
        .set({
          blockVote: 1,
          blockProposal: 1,
          blockSuggestion: 1,
          reason: banReason,
          banType: 'temp',
          expiresAt: threeDayExpiry
        })
        .where(eq(bannedIps.ipAddress, ip));
    } else {
      await db.insert(bannedIps)
        .values({
          ipAddress: ip,
          banType: 'temp',
          expiresAt: threeDayExpiry,
          blockVote: 1,
          blockProposal: 1,
          blockSuggestion: 1,
          blockAll: 0,
          reason: banReason
        });
    }

    // Alerte notification de sécurité
    await db.insert(securityNotifications)
      .values({
        ipAddress: ip,
        type: 'failed_logins_sanction',
        title: `🚨 Sanction automatique appliquée à ${ip}`,
        message: `L'adresse IP ${ip} a échoué 3 tentatives consécutives de connexion admin (identifiant tenté : '${usernameAttempted}'). La Boîte à Idées et les votes de la Roadmap lui ont été révoqués pour 3 jours.`
      });

    // Log d'audit
    await db.insert(adminLoginLogs)
      .values({
        ipAddress: ip,
        usernameAttempted,
        status: 'failed_credentials',
        userAgent,
        sanctionApplied: 1
      });

    return { lockedNow: true, remainingAttempts: 0 };
  }

  failedLogins.set(ip, record);

  await db.insert(adminLoginLogs)
    .values({
      ipAddress: ip,
      usernameAttempted,
      status: 'failed_credentials',
      userAgent,
      sanctionApplied: 0
    });

  return { lockedNow: false, remainingAttempts: Math.max(0, 3 - record.count) };
}

export function clearFailedLogin(ip: string): void {
  failedLogins.delete(ip);
}

export function toPublicUser(user: typeof adminUsers.$inferSelect): AdminUserPublic {
  let permissions: string[] = ['all'];
  if (user.permissions) {
    try {
      permissions = JSON.parse(user.permissions);
    } catch {
      permissions = ['all'];
    }
  }
  return {
    id: user.id,
    username: user.username || '',
    role: user.role || 'admin',
    permissions,
    lastLogin: user.lastLogin,
    lastIp: user.lastIp,
    createdAt: user.createdAt
  };
}
