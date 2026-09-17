export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  database: 'connected' | 'disconnected';
}

export type UserRole = 'superadmin' | 'admin' | 'moderator';

export type UserPermission = 'all' | 'content' | 'roadmap' | 'bans' | 'users' | 'settings';

export interface AdminUserPublic {
  id: number;
  username: string;
  role: string;
  permissions: string[];
  lastLogin: string | null;
  lastIp: string | null;
  createdAt: string | null;
}

export interface LoginRequest {
  username: string;
  password?: string;
}

export interface LoginResponse {
  status: 'ok' | 'error';
  user?: AdminUserPublic;
  token?: string;
  message?: string;
  sanctionActive?: boolean;
  lockedUntilSeconds?: number;
}
