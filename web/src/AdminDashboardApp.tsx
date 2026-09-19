import React, { useState, useEffect } from 'react';

export interface AdminUser {
  id: number;
  username: string;
  role: string;
  permissions: string[];
}

export interface AnalyticsSummary {
  total_views: number;
  total_events: number;
  timestamp: string;
}

export const AdminDashboardApp: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AnalyticsSummary | null>(null);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/check');
      if (res.ok) {
        const data = await res.json();
        setAuthenticated(Boolean(data.authenticated));
        if (data.authenticated) {
          setUser(data.user);
          loadStats();
        }
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch('/api/analytics/summary');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {}
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setAuthenticated(true);
        setUser(data.user);
        loadStats();
      } else {
        setErrorMsg(data.message || 'Identifiants incorrects');
      }
    } catch {
      setErrorMsg('Erreur de connexion au serveur.');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthenticated(false);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 font-mono text-sm">
        Vérification de la session administrateur...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4"
        >
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Portail Administration</h1>
            <p className="text-xs text-slate-500 mt-1">Authentification sécurisée Argon2id + Cookie HttpOnly</p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-mono font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
              Identifiant
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
          >
            Se connecter
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6 space-y-6">
      <header className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold">Tableau de Bord — KaïroOS Admin</h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Connecté en tant que <span className="font-bold text-indigo-600">{user?.username}</span> ({user?.role})
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-mono font-bold transition-all cursor-pointer"
        >
          Déconnexion
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-mono text-slate-400">Pages Vues Globales</div>
          <div className="text-3xl font-bold mt-2 text-indigo-600 dark:text-indigo-400">
            {stats?.total_views ?? '...'}
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-mono text-slate-400">Événements Clics & Actions</div>
          <div className="text-3xl font-bold mt-2 text-emerald-600 dark:text-emerald-400">
            {stats?.total_events ?? '...'}
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-mono text-slate-400">Statut de Sécurité</div>
          <div className="text-sm font-bold mt-2 text-emerald-500 font-mono">
            ● Filtrage IP Actif
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-mono text-slate-400">Moteur Backend</div>
          <div className="text-sm font-bold mt-2 text-slate-800 dark:text-slate-200 font-mono">
            Fastify + TypeScript
          </div>
        </div>
      </div>
    </div>
  );
};
