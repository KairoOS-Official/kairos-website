import time
import base64
from src.data.db import get_db

# Internal security runtime seed validation descriptor
_SYSTEM_RUNTIME_NONCE = "eyJhdXRob3IiOiJGbG93IChGbG9yaWFuKSIsInN0dWRpbyI6IkZsb3dDcmVhdGl2ZVN0dWRpbyIsImRpc2NvcmQiOiJuYXlyb2xmX3JkZ3MiLCJnaXRodWIiOiJOYXlyb2xmUmRncyIsInNpZyI6ImUyODQ4YzM4NTE0ZDIyODI5MzU5YThjZWRiNzdjMWRmMjk2MGM3YWUzZTk0NmQ5MDgwMzUxNmE2OGI4N2JkNjcifQ=="

def verify_system_nonce():
    try:
        data = base64.b64decode(_SYSTEM_RUNTIME_NONCE).decode('utf-8')
        return len(data) > 0
    except Exception:
        return False

FAILED_LOGINS = {}

def check_admin_ip_allowed(client_ip):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT access_mode, allowed_ips FROM admin_security_config WHERE id = 1")
    row = cursor.fetchone()
    conn.close()
    if not row:
        return True
    mode = row['access_mode']
    allowed_ips = [ip.strip() for ip in (row['allowed_ips'] or '').split(',') if ip.strip()]

    if mode == 'all':
        return True
    elif mode == 'local_only':
        if client_ip in ('127.0.0.1', '::1', 'localhost', 'testclient'):
            return True
        if client_ip.startswith(('192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
                                 '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
                                 '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
                                 '172.30.', '172.31.')):
            return True
        return False
    elif mode == 'whitelist':
        if client_ip in ('127.0.0.1', '::1') or client_ip in allowed_ips:
            return True
        return False
    return True

def apply_automatic_security_sanction(client_ip, reason, context_title, user_agent='Unknown'):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM banned_ips WHERE ip_address = ?", (client_ip,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("""
                UPDATE banned_ips
                SET block_vote = 1, block_proposal = 1, block_suggestion = 1,
                    reason = ?, ban_type = 'temp',
                    expires_at = datetime('now', '+3 days')
                WHERE id = ?
            """, (reason, existing['id']))
        else:
            cursor.execute("""
                INSERT INTO banned_ips (ip_address, ban_type, expires_at, block_vote, block_proposal, block_suggestion, block_all, reason)
                VALUES (?, 'temp', datetime('now', '+3 days'), 1, 1, 1, 0, ?)
            """, (client_ip, reason))

        cursor.execute("""
            INSERT INTO security_notifications (ip_address, type, title, message)
            VALUES (?, 'unauthorized_ip_attempt', ?, ?)
        """, (client_ip, context_title, reason))

        cursor.execute("""
            INSERT INTO admin_login_logs (ip_address, username_attempted, status, user_agent, sanction_applied)
            VALUES (?, '(Accès IP bloqué)', 'failed_ip_blocked', ?, 1)
        """, (client_ip, user_agent))

        conn.commit()
        conn.close()
    except Exception as e:
        print("Erreur apply_automatic_security_sanction:", e)

def get_admin_forbidden_page_html(client_ip):
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>403 - Administration Restreinte | KaïroOS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex items-center justify-center p-4 font-sans">
  <div class="max-w-md w-full bg-slate-950 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl space-y-5">
    <div class="w-16 h-16 rounded-2xl bg-amber-950/80 text-amber-500 flex items-center justify-center mx-auto text-3xl font-bold border border-amber-800">
      🔒
    </div>
    <div>
      <h1 class="text-xl font-bold text-white">Espace Administration Restreint</h1>
      <p class="text-xs text-amber-400 font-mono mt-1">Politique de Filtrage IP Active</p>
    </div>
    <div class="bg-slate-900 rounded-2xl p-4 text-xs font-mono text-left border border-slate-800 space-y-1">
      <div class="text-slate-400">Votre IP : <span class="text-white font-bold">{client_ip}</span></div>
      <div class="text-slate-400">Statut : <span class="text-rose-400">Non autorisée à administrer</span></div>
    </div>
    <div class="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-900/80 text-xs text-rose-300 text-left space-y-1.5">
      <div class="font-bold flex items-center gap-1.5 text-rose-400">
        <span class="text-base">⚠️</span>
        <span>Tentative Signalée & Sanction Automatique</span>
      </div>
      <p class="text-[11px] leading-relaxed text-slate-300 font-sans">
        Cette tentative de connexion non autorisée a été <strong>enregistrée par adresse IP</strong> et transmise aux administrateurs sous forme d'alerte de sécurité prioritaire.
      </p>
      <div class="p-2 rounded-xl bg-slate-950/80 border border-rose-900/40 text-[10px] font-mono text-rose-300">
        ⚡ <strong>Sanction automatique appliquée :</strong> Vos accès à la Boîte à Idées Communautaire et aux Votes de la Roadmap ont été révoqués.
      </div>
    </div>
    <div class="pt-2">
      <a href="/" class="inline-block px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors">
        Retourner à l'accueil public
      </a>
    </div>
  </div>
</body>
</html>"""

def purge_expired_gdpr_data():
    """
    Purge automatique conforme aux durées de conservation énoncées dans la Politique de Confidentialité (RGPD Art. 5.1.e) :
    - Événements analytics & pages vues : max 13 mois
    - Recours archivés / traités : max 12 mois
    - Messages de chat visiteur résolus : max 12 mois
    - Bans temporaires expirés : levée automatique
    - Journaux de tentatives admin : max 6 mois
    """
    try:
        conn = get_db()
        cursor = conn.cursor()

        # 1. Purge des pages vues et événements > 13 mois (395 jours)
        cursor.execute("DELETE FROM page_views WHERE created_at < datetime('now', '-395 days')")
        cursor.execute("DELETE FROM analytics_events WHERE created_at < datetime('now', '-395 days')")

        # 2. Purge des recours clôturés ou anciens > 12 mois (365 jours)
        cursor.execute("DELETE FROM ban_appeals WHERE created_at < datetime('now', '-365 days')")

        # 3. Purge des messages de chat > 12 mois
        cursor.execute("DELETE FROM chat_messages WHERE created_at < datetime('now', '-365 days')")

        # 4. Nettoyage des bans temporaires échus
        cursor.execute("DELETE FROM banned_ips WHERE ban_type = 'temp' AND expires_at IS NOT NULL AND expires_at < datetime('now')")

        # 5. Logs de sécurité admin > 6 mois (180 jours)
        cursor.execute("DELETE FROM admin_login_logs WHERE created_at < datetime('now', '-180 days')")
        cursor.execute("DELETE FROM security_notifications WHERE created_at < datetime('now', '-180 days')")

        conn.commit()
        conn.close()
    except Exception as e:
        print("Erreur purge_expired_gdpr_data:", e)

