import http.server
import socketserver
import os
import json
import secrets
import time
import argparse
import sys
from urllib.parse import urlparse, parse_qs

from src.data.db import BASE_DIR, WEB_DIR, get_db
from src.data.migrations import init_db
from src.services.auth import (
    hash_password, verify_token, get_token_user,
    list_admin_users, create_admin_user, delete_admin_user, reset_admin_password
)
from src.services.security import (
    check_admin_ip_allowed, apply_automatic_security_sanction,
    get_admin_forbidden_page_html, FAILED_LOGINS
)
from src.services.ban import (
    is_ip_completely_banned, get_banned_page_html
)
from src.services.upload import save_uploaded_image
from src.services.logger import setup_daily_logging

from src.routes.public import (
    serve_html_file, handle_public_get, handle_public_post
)
from src.routes.content import (
    handle_content_get, handle_content_post
)
from src.routes.roadmap import (
    handle_roadmap_get, handle_roadmap_post
)
from src.routes.admin import (
    handle_admin_get, handle_admin_post
)

PORT = 3000

class KairoRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def get_client_ip(self):
        xff = self.headers.get('X-Forwarded-For', '')
        if xff:
            return xff.split(',')[0].strip()
        xri = self.headers.get('X-Real-IP', '')
        if xri:
            return xri.strip()
        return self.client_address[0] if (self.client_address and len(self.client_address) > 0) else '127.0.0.1'

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        raw_path = parsed.path
        if raw_path != '/' and raw_path.endswith('/'):
            raw_path = raw_path[:-1]
        query = parse_qs(parsed.query)

        client_ip = self.get_client_ip()

        # Public Routes always accessible (ban status & visitor chat)
        if raw_path in ('/api/user/ban-status', '/api/user/chat'):
            if handle_public_get(self, raw_path, client_ip):
                return

        # Check 1 : Full IP ban
        is_fully_banned, ban_info = is_ip_completely_banned(client_ip)
        if is_fully_banned:
            if raw_path.startswith('/api/'):
                return self.send_json({"status": "error", "message": "Accès interdit : votre adresse IP est bannie de la plateforme.", "ban": ban_info}, status=403)
            else:
                html = get_banned_page_html(client_ip, ban_info)
                body = html.encode('utf-8')
                self.send_response(403)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

        # Check 2 : Admin IP restrictions
        if raw_path.startswith('/admin') or raw_path in ('/pages/admin.html', '/admin.html') or raw_path.startswith('/api/admin/'):
            if not check_admin_ip_allowed(client_ip):
                reason = f"Sanction de sécurité : Tentative d'accès non autorisée au panneau d'administration ({raw_path}) depuis l'adresse IP {client_ip}."
                apply_automatic_security_sanction(client_ip, reason, f"🚨 Accès admin interdit : {client_ip}", self.headers.get('User-Agent', 'Unknown'))
                if raw_path.startswith('/api/'):
                    return self.send_json({
                        "status": "error",
                        "message": "Tentative de connexion non autorisée signalée. Vos accès aux votes et à la boîte à idées ont été automatiquement suspendus."
                    }, status=403)
                html = get_admin_forbidden_page_html(client_ip)
                body = html.encode('utf-8')
                self.send_response(403)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

        # Auth check endpoint
        if raw_path == '/api/auth/check':
            is_valid = verify_token(self.headers)
            return self.send_json({"authenticated": is_valid})

        # Modular route handlers
        if handle_public_get(self, raw_path, client_ip):
            return
        if handle_content_get(self, raw_path, query):
            return
        if handle_roadmap_get(self, raw_path, query, client_ip):
            return
        if handle_admin_get(self, raw_path, query):
            return

        # Static assets
        if '/assets/' in parsed.path:
            asset_idx = parsed.path.find('/assets/')
            clean_asset_path = parsed.path[asset_idx:]
            self.path = clean_asset_path + ('?' + parsed.query if parsed.query else '')
            super().do_GET()
            return

        # Favicon & robots
        if raw_path in ('/favicon.ico', '/robots.txt'):
            self.send_response(204)
            self.end_headers()
            return

        # Multilingual & Virtual Page Routing
        clean = raw_path.strip('/')
        parts = [p for p in clean.split('/') if p]

        lang = 'fr'
        if len(parts) > 0 and parts[0] in ('fr', 'en'):
            lang = parts[0]
            subparts = parts[1:]
        else:
            subparts = parts

        page = subparts[0] if len(subparts) > 0 else ''
        subpage = subparts[1] if len(subparts) > 1 else ''

        if page in ('', 'index.html', 'home'):
            return serve_html_file(self, 'index.html', lang)
        elif page in ('themes', 'themes.html'):
            return serve_html_file(self, 'themes/index.html', lang)
        elif page in ('plugins', 'plugins.html'):
            return serve_html_file(self, 'plugins/index.html', lang)
        elif page in ('roadmap', 'roadmap.html'):
            return serve_html_file(self, 'roadmap/index.html', lang)
        elif page in ('admin', 'admin.html'):
            return serve_html_file(self, 'admin/index.html', lang)
        elif page == 'legal':
            if subpage in ('mentions-legales', 'mentions-legales.html', 'mentions'):
                return serve_html_file(self, 'legal/mentions-legales.html', lang)
            elif subpage in ('confidentialite', 'confidentialite.html', 'privacy'):
                return serve_html_file(self, 'legal/confidentialite.html', lang)
            elif subpage in ('cookies', 'cookies.html'):
                return serve_html_file(self, 'legal/cookies.html', lang)

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')
        client_ip = self.get_client_ip()

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        # Public post handlers (appeals & visitor chat)
        if path in ('/api/ban/appeal', '/api/user/chat/send'):
            if handle_public_post(self, path, payload, client_ip):
                return

        # Check 1 : Full IP Ban
        is_fully_banned, ban_info = is_ip_completely_banned(client_ip)
        if is_fully_banned:
            return self.send_json({"status": "error", "message": "Accès interdit : votre adresse IP est bannie de l'ensemble de la plateforme."}, status=403)

        # Check 2 : Admin IP restrictions
        if path == '/api/auth/login' or path.startswith('/api/admin/'):
            if not check_admin_ip_allowed(client_ip):
                reason = f"Sanction de sécurité : Tentative de connexion non autorisée (POST {path}) depuis l'adresse IP {client_ip}."
                apply_automatic_security_sanction(client_ip, reason, f"🚨 Tentative d'intrusion admin : {client_ip}", self.headers.get('User-Agent', 'Unknown'))
                return self.send_json({
                    "status": "error",
                    "message": "Tentative de connexion non autorisée signalée aux administrateurs. Votre adresse IP a été automatiquement sanctionnée : la Boîte à Idées et les votes vous ont été révoqués."
                }, status=403)

        # Login endpoint with bruteforce lock
        if path == '/api/auth/login':
            now = time.time()
            record = FAILED_LOGINS.get(client_ip, {'count': 0, 'locked_until': 0})
            if record['locked_until'] > now:
                remaining_sec = int(record['locked_until'] - now)
                remaining_min = max(1, int(remaining_sec / 60))
                return self.send_json({
                    "status": "error",
                    "sanction_active": True,
                    "locked_until_seconds": remaining_sec,
                    "message": f"Tentatives de connexion bloquées pendant 1 heure suite à des échecs consécutifs. Réessayez dans {remaining_min} minute(s)."
                }, status=429)

            username = payload.get('username', '').strip()
            password = payload.get('password', '').strip()
            user_agent = self.headers.get('User-Agent', 'Unknown')
            pwd_hash = hash_password(password)

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, role, permissions FROM admin_users WHERE username = ? AND password_hash = ?", (username, pwd_hash))
            user = cursor.fetchone()

            if user:
                if client_ip in FAILED_LOGINS:
                    del FAILED_LOGINS[client_ip]

                token = secrets.token_hex(24)
                cursor.execute("""
                    UPDATE admin_users 
                    SET token = ?, last_login = CURRENT_TIMESTAMP, last_ip = ? 
                    WHERE id = ?
                """, (token, client_ip, user['id']))

                cursor.execute("""
                    INSERT INTO admin_login_logs (ip_address, username_attempted, status, user_agent, sanction_applied)
                    VALUES (?, ?, 'success', ?, 0)
                """, (client_ip, username, user_agent))

                conn.commit()
                conn.close()

                try:
                    perms = json.loads(user['permissions']) if user['permissions'] else ["all"]
                except Exception:
                    perms = ["all"]

                return self.send_json({
                    "status": "ok",
                    "token": token,
                    "username": username,
                    "role": user['role'] or "admin",
                    "permissions": perms
                })
            else:
                record['count'] += 1
                sanction_applied = 0

                if record['count'] >= 3:
                    record['locked_until'] = now + 3600
                    FAILED_LOGINS[client_ip] = record
                    sanction_applied = 1

                    ban_reason = f"Sanction automatique de sécurité : 3 tentatives de connexion non autorisées à l'espace d'administration (compte visé : '{username or 'inconnu'}')."
                    cursor.execute("SELECT id FROM banned_ips WHERE ip_address = ?", (client_ip,))
                    existing = cursor.fetchone()
                    if existing:
                        cursor.execute("""
                            UPDATE banned_ips
                            SET block_vote = 1, block_proposal = 1, block_suggestion = 1,
                                reason = ?, ban_type = 'temp',
                                expires_at = datetime('now', '+3 days')
                            WHERE ip_address = ?
                        """, (ban_reason, client_ip))
                    else:
                        cursor.execute("""
                            INSERT INTO banned_ips (ip_address, ban_type, expires_at, block_vote, block_proposal, block_suggestion, block_all, reason)
                            VALUES (?, 'temp', datetime('now', '+3 days'), 1, 1, 1, 0, ?)
                        """, (client_ip, ban_reason))

                    cursor.execute("""
                        INSERT INTO security_notifications (ip_address, type, title, message)
                        VALUES (?, 'failed_logins_sanction', ?, ?)
                    """, (
                        client_ip,
                        f"🚨 Sanction automatique appliquée à {client_ip}",
                        f"L'adresse IP {client_ip} a échoué 3 tentatives consécutives de connexion admin (identifiant tenté : '{username}'). La Boîte à Idées et les votes de la Roadmap lui ont été automatiquement révoqués pour 3 jours."
                    ))

                    cursor.execute("""
                        INSERT INTO admin_login_logs (ip_address, username_attempted, status, user_agent, sanction_applied)
                        VALUES (?, ?, 'failed_credentials', ?, 1)
                    """, (client_ip, username, user_agent))

                    conn.commit()
                    conn.close()

                    return self.send_json({
                        "status": "error",
                        "sanction_active": True,
                        "locked_until_seconds": 3600,
                        "message": "3 tentatives de connexion infructueuses consécutives. Votre adresse IP a officiellement été sanctionnée et les tentatives de connexion sont bloquées pendant 1 heure. Vos droits de vote et de proposition d'idées sur la Roadmap ont été révoqués."
                    }, status=429)
                else:
                    FAILED_LOGINS[client_ip] = record
                    remaining = 3 - record['count']

                    cursor.execute("""
                        INSERT INTO admin_login_logs (ip_address, username_attempted, status, user_agent, sanction_applied)
                        VALUES (?, ?, 'failed_credentials', ?, 0)
                    """, (client_ip, username, user_agent))

                    conn.commit()
                    conn.close()

                    return self.send_json({
                        "status": "error",
                        "message": f"Identifiants incorrects. Attention : il vous reste {remaining} tentative{'s' if remaining > 1 else ''} avant sanction automatique (révocation des votes et de la boîte à idées)."
                    }, status=401)

        # Upload image endpoint
        if path == '/api/upload':
            if not verify_token(self.headers):
                return self.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            file_data = payload.get('file_data')
            file_name = payload.get('file_name', 'image.png')
            rel_path = save_uploaded_image(file_data, file_name)
            return self.send_json({"status": "ok", "url": rel_path})

        # Public tracking
        if handle_public_post(self, path, payload, client_ip):
            return

        # Roadmap post handlers
        if handle_roadmap_post(self, path, payload, client_ip):
            return

        # Content post handlers
        if handle_content_post(self, path, payload):
            return

        # Admin post handlers
        if handle_admin_post(self, path, payload):
            return

        return self.send_json({"status": "not_found"}, status=404)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

def parse_cli(argv):
    parser = argparse.ArgumentParser(description='KaïroOS Admin CLI helper')
    parser.add_argument('--admin-list', action='store_true', help='Liste les comptes admin.')
    parser.add_argument('--admin-create', metavar='USERNAME', help='Créer un compte admin.')
    parser.add_argument('--admin-delete', metavar='USERNAME', help='Supprimer un compte admin.')
    parser.add_argument('--admin-reset-password', metavar='USERNAME', help='Réinitialiser le mot de passe d’un compte admin.')
    parser.add_argument('--password', help='Mot de passe manuel à utiliser pour la création ou la réinitialisation.')
    parser.add_argument('--generate-password', action='store_true', help='Génère automatiquement un nouveau mot de passe aléatoire.')
    parser.add_argument('--role', default='superadmin', help='Rôle associé à la création d’un compte admin.')
    parser.add_argument('--permissions', default='["all"]', help='JSON liste des permissions admin. Exemple: ["all"] ou ["content","settings"]')
    parser.add_argument('--run-server', action='store_true', help='Démarrer le serveur (par défaut si aucune commande de gestion admin n’est fournie).')
    return parser.parse_args(argv)

def run_admin_cli(args):
    init_db()

    if args.admin_list:
        list_admin_users()
        return True

    if args.admin_create:
        create_admin_user(args.admin_create, args.password, args.role, args.permissions)
        return True

    if args.admin_delete:
        delete_admin_user(args.admin_delete)
        return True

    if args.admin_reset_password:
        reset_admin_password(args.admin_reset_password, args.password, args.generate_password)
        return True

    return False

def main(argv=None):
    setup_daily_logging()
    if argv is None:
        argv = sys.argv[1:]
    args = parse_cli(argv)
    if run_admin_cli(args):
        sys.exit(0)

    init_db()
    with ThreadedTCPServer(("", PORT), KairoRequestHandler) as httpd:
        print(f"KaïroOS Multilingual Server running on http://localhost:{PORT}")
        httpd.serve_forever()

if __name__ == '__main__':
    main()
