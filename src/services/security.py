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

# Durées de conservation officielles (Affichées publiquement) vs Durées réelles divisées par 2 (Principe de minimisation stricte)
DATA_RETENTION_POLICIES = [
    {
        "key": "analytics",
        "label": "Télémétrie & Pages Vues",
        "category": "Mesure d'audience",
        "legal_basis": "Consentement (Art. 6.1.a)",
        "stated_duration": "13 mois (395 jours)",
        "effective_days": 197,  # 13 mois divisé par 2 (~6.5 mois)
        "tables": ["page_views", "analytics_events"],
        "date_column": "created_at"
    },
    {
        "key": "community",
        "label": "Boîte à Idées & Suggestions",
        "category": "Contributions",
        "legal_basis": "Consentement (Art. 6.1.a)",
        "stated_duration": "3 ans (1095 jours)",
        "effective_days": 547,  # 3 ans divisé par 2 (1.5 an / 18 mois)
        "tables": ["community_proposals", "feature_suggestions"],
        "date_column": "created_at"
    },
    {
        "key": "appeals",
        "label": "Recours & Chat d'assistance",
        "category": "Modération",
        "legal_basis": "Intérêt légitime (Art. 6.1.f)",
        "stated_duration": "12 mois (365 jours)",
        "effective_days": 182,  # 12 mois divisé par 2 (6 mois)
        "tables": ["ban_appeals", "chat_messages"],
        "date_column": "created_at"
    },
    {
        "key": "logs",
        "label": "Journaux d'Audit & Tentatives",
        "category": "Sécurité",
        "legal_basis": "Intérêt légitime (Art. 6.1.f)",
        "stated_duration": "6 mois (180 jours)",
        "effective_days": 90,   # 6 mois divisé par 2 (3 mois)
        "tables": ["admin_login_logs", "security_notifications"],
        "date_column": "created_at"
    },
    {
        "key": "bans_temp",
        "label": "Bans Temporaires Échus",
        "category": "Sanctions",
        "legal_basis": "Intérêt légitime (Art. 6.1.f)",
        "stated_duration": "Durée de la sanction",
        "effective_days": 0,    # Immédiatement à expiration
        "tables": ["banned_ips"],
        "date_column": "expires_at"
    }
]

def purge_expired_gdpr_data():
    """
    Purge automatique ultra-protectrice (Minimisation RGPD Art. 5.1.c et 5.1.e) :
    Les données sont légalement annoncées avec une durée maximale, mais supprimées
    systématiquement deux fois plus tôt pour une confidentialité maximale.
    - Analytics / Pages vues : Annoncé 13 mois -> Supprimé à 6.5 mois (197 jours)
    - Idées / Suggestions : Annoncé 3 ans -> Supprimé à 1.5 an (547 jours)
    - Recours / Chat : Annoncé 12 mois -> Supprimé à 6 mois (182 jours)
    - Journaux de connexion admin : Annoncé 6 mois -> Supprimé à 3 mois (90 jours)
    - Bans temporaires échus : Levée immédiate
    """
    try:
        conn = get_db()
        cursor = conn.cursor()

        # 1. Analytics & Vues : Supprimé à 197 jours (~6.5 mois, annoncé 13 mois)
        cursor.execute("DELETE FROM page_views WHERE created_at < datetime('now', '-197 days')")
        cursor.execute("DELETE FROM analytics_events WHERE created_at < datetime('now', '-197 days')")

        # 2. Idées et suggestions communautaires : Supprimé à 547 jours (~1.5 an, annoncé 3 ans)
        cursor.execute("DELETE FROM community_proposals WHERE created_at < datetime('now', '-547 days')")
        cursor.execute("DELETE FROM feature_suggestions WHERE created_at < datetime('now', '-547 days')")

        # 3. Recours et chat : Supprimé à 182 jours (6 mois, annoncé 12 mois)
        cursor.execute("DELETE FROM ban_appeals WHERE created_at < datetime('now', '-182 days')")
        cursor.execute("DELETE FROM chat_messages WHERE created_at < datetime('now', '-182 days')")

        # 4. Bans temporaires échus
        cursor.execute("DELETE FROM banned_ips WHERE ban_type = 'temp' AND expires_at IS NOT NULL AND expires_at < datetime('now')")

        # 5. Logs admin & notifications : Supprimé à 90 jours (3 mois, annoncé 6 mois)
        cursor.execute("DELETE FROM admin_login_logs WHERE created_at < datetime('now', '-90 days')")
        cursor.execute("DELETE FROM security_notifications WHERE created_at < datetime('now', '-90 days')")

        conn.commit()
        conn.close()
    except Exception as e:
        print("Erreur purge_expired_gdpr_data:", e)

def get_data_retention_overview():
    """
    Calcule pour chaque catégorie de données :
    - Nombre d'enregistrements actuels
    - Date du plus ancien enregistrement
    - Date d'expiration programmée du plus ancien
    - Temps restant en jours / heures avant auto-suppression
    """
    conn = get_db()
    cursor = conn.cursor()
    overview = []

    for policy in DATA_RETENTION_POLICIES:
        total_count = 0
        oldest_ts = None
        for table in policy["tables"]:
            try:
                date_col = policy["date_column"]
                cursor.execute(f"SELECT COUNT(*) as c, MIN({date_col}) as oldest FROM {table}")
                row = cursor.fetchone()
                if row:
                    total_count += row['c'] or 0
                    ts = row['oldest']
                    if ts and (oldest_ts is None or ts < oldest_ts):
                        oldest_ts = ts
            except Exception:
                pass

        expires_at = None
        days_remaining = None
        if oldest_ts and policy["effective_days"] > 0:
            try:
                from datetime import datetime, timedelta
                # SQLite timestamp parsing
                clean_ts = oldest_ts.split('.')[0].replace('Z', '')
                if 'T' in clean_ts:
                    old_dt = datetime.fromisoformat(clean_ts)
                else:
                    old_dt = datetime.strptime(clean_ts, "%Y-%m-%d %H:%M:%S")
                exp_dt = old_dt + timedelta(days=policy["effective_days"])
                expires_at = exp_dt.strftime("%Y-%m-%d %H:%M:%S")
                diff = exp_dt - datetime.now()
                days_remaining = max(0, diff.days)
            except Exception:
                pass

        overview.append({
            "key": policy["key"],
            "label": policy["label"],
            "category": policy["category"],
            "legal_basis": policy["legal_basis"],
            "stated_duration": policy["stated_duration"],
            "effective_days": policy["effective_days"],
            "total_records": total_count,
            "oldest_record": oldest_ts,
            "next_expiration": expires_at,
            "days_remaining": days_remaining
        })

    conn.close()
    return overview

