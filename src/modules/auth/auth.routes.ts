import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { adminUsers, adminLoginLogs } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  verifyPassword,
  hashPassword,
  checkBruteForceLock,
  recordFailedLogin,
  clearFailedLogin,
  toPublicUser
} from './auth.service.js';

const LoginSchema = z.object({
  username: z.string().min(1, 'Identifiant requis'),
  password: z.string().min(1, 'Mot de passe requis')
});

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Check Session / Token Validity
  fastify.get('/api/auth/check', async (request, reply) => {
    // Check either HttpOnly cookie or Authorization Bearer header
    const cookieToken = request.cookies['kairo_admin_session'];
    const authHeader = request.headers.authorization?.replace('Bearer ', '').trim();
    const token = cookieToken || authHeader;

    if (!token) {
      return reply.status(200).send({ authenticated: false });
    }

    const user = (await db.select().from(adminUsers).where(eq(adminUsers.token, token)))[0];
    if (!user) {
      return reply.status(200).send({ authenticated: false });
    }

    return reply.status(200).send({
      authenticated: true,
      user: toPublicUser(user)
    });
  });

  // 2. Admin Login
  fastify.post('/api/auth/login', async (request, reply) => {
    const clientIp = request.ip || '127.0.0.1';
    const userAgent = request.headers['user-agent'] || 'Unknown';

    // A. Check Brute-force block
    const { locked, remainingSeconds } = checkBruteForceLock(clientIp);
    if (locked) {
      const remainingMin = Math.max(1, Math.ceil(remainingSeconds / 60));
      return reply.status(429).send({
        status: 'error',
        sanction_active: true,
        locked_until_seconds: remainingSeconds,
        message: `Tentatives de connexion bloquées pendant 1 heure suite à des échecs consécutifs. Réessayez dans ${remainingMin} minute(s).`
      });
    }

    // B. Validate payload with Zod
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        status: 'error',
        message: parseResult.error.issues[0]?.message || 'Données invalides'
      });
    }

    const { username, password } = parseResult.data;

    // C. Find User
    const user = (await db.select().from(adminUsers).where(eq(adminUsers.username, username)))[0];
    if (!user || !user.passwordHash) {
      const { remainingAttempts } = await recordFailedLogin(clientIp, username, userAgent);
      return reply.status(401).send({
        status: 'error',
        message: `Identifiants incorrects. Attention : il vous reste ${remainingAttempts} tentative(s) avant sanction automatique.`
      });
    }

    // D. Verify Password (Argon2 or Legacy SHA-256)
    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      const { lockedNow, remainingAttempts } = await recordFailedLogin(clientIp, username, userAgent);
      if (lockedNow) {
        return reply.status(429).send({
          status: 'error',
          sanction_active: true,
          locked_until_seconds: 3600,
          message: "3 tentatives de connexion infructueuses consécutives. Votre adresse IP a été sanctionnée et bloquée pour 1 heure."
        });
      }
      return reply.status(401).send({
        status: 'error',
        message: `Identifiants incorrects. Attention : il vous reste ${remainingAttempts} tentative(s) avant sanction automatique.`
      });
    }

    // E. On Success: Clear failures & Generate Session
    clearFailedLogin(clientIp);
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // Auto-upgrade legacy password hash to Argon2id if it was SHA-256
    let updatedHash = user.passwordHash;
    if (!user.passwordHash.startsWith('$argon2')) {
      updatedHash = await hashPassword(password);
    }

    await db.update(adminUsers)
      .set({
        token: sessionToken,
        passwordHash: updatedHash,
        lastLogin: sql`CURRENT_TIMESTAMP`,
        lastIp: clientIp
      })
      .where(eq(adminUsers.id, user.id));

    await db.insert(adminLoginLogs)
      .values({
        ipAddress: clientIp,
        usernameAttempted: username,
        status: 'success',
        userAgent,
        sanctionApplied: 0
      });

    // Set secure HttpOnly cookie
    reply.setCookie('kairo_admin_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 // 7 jours
    });

    const publicUser = toPublicUser(user);

    return reply.status(200).send({
      status: 'ok',
      token: sessionToken,
      username: publicUser.username,
      role: publicUser.role,
      permissions: publicUser.permissions,
      user: publicUser
    });
  });

  // 3. Admin Logout
  fastify.post('/api/auth/logout', async (request, reply) => {
    const cookieToken = request.cookies['kairo_admin_session'];
    const authHeader = request.headers.authorization?.replace('Bearer ', '').trim();
    const token = cookieToken || authHeader;

    if (token) {
      await db.update(adminUsers).set({ token: null }).where(eq(adminUsers.token, token));
    }

    reply.clearCookie('kairo_admin_session', { path: '/' });
    return reply.status(200).send({ status: 'ok', message: 'Déconnexion réussie' });
  });
};
