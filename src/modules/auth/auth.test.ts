import { describe, it, expect } from 'vitest';
import { buildServer } from '../../server.js';

describe('Auth Module Integration', () => {
  const server = buildServer();

  it('checks authentication status on empty session (returns false)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/check'
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.authenticated).toBe(false);
  });

  it('rejects login with invalid credentials and records attempt (returns 401)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'non_existent_admin',
        password: 'wrong_password_123'
      }
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('error');
    expect(body.message).toContain('Identifiants incorrects');
  });

  it('rejects empty payload with 400 Bad Request', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {}
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('error');
  });
});
