import os
import json
import re
from datetime import datetime, timezone
from src.data.db import BASE_DIR, WEB_DIR, get_db

def serve_html_file(req, rel_path, lang='fr'):
    full_path = os.path.join(WEB_DIR, rel_path.replace('/', os.sep))
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        req.send_error(404, f"Page non trouvée: {rel_path}")
        return

    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            html = f.read()
    except Exception as e:
        req.send_error(500, f"Erreur lecture fichier: {e}")
        return

    if '<head>' in html and '<base href="/"' not in html:
        html = html.replace('<head>', '<head>\n  <base href="/">', 1)

    html = re.sub(r'<html([^>]*)lang="[a-zA-Z\-]+"', rf'<html\1lang="{lang}"', html, count=1)

    encoded = html.encode('utf-8')
    req.send_response(200)
    req.send_header('Content-Type', 'text/html; charset=utf-8')
    req.send_header('Content-Length', str(len(encoded)))
    req.send_header('Access-Control-Allow-Origin', '*')
    req.end_headers()
    req.wfile.write(encoded)

def handle_public_get(req, raw_path, client_ip):
    if raw_path == '/api/user/ban-status':
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM banned_ips WHERE ip_address = ?", (client_ip,))
        ban_row = cursor.fetchone()
        conn.close()
        if not ban_row:
            req.send_json({"is_banned": False, "ip": client_ip})
            return True
        b = dict(ban_row)
        if b.get('ban_type') == 'temp' and b.get('expires_at'):
            try:
                exp_dt = datetime.fromisoformat(b['expires_at'].replace('Z', '+00:00'))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) >= exp_dt:
                    req.send_json({"is_banned": False, "ip": client_ip})
                    return True
            except Exception:
                pass
        req.send_json({
            "is_banned": True,
            "ip": client_ip,
            "ban_type": b.get('ban_type'),
            "expires_at": b.get('expires_at'),
            "reason": b.get('reason'),
            "block_all": bool(b.get('block_all')),
            "block_vote": bool(b.get('block_vote')),
            "block_proposal": bool(b.get('block_proposal')),
            "block_suggestion": bool(b.get('block_suggestion'))
        })
        return True

    elif raw_path == '/api/user/chat':
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, sender, message, created_at, is_read FROM chat_messages WHERE ip_address = ? ORDER BY id ASC LIMIT 100", (client_ip,))
        msgs = [dict(r) for r in cursor.fetchall()]
        cursor.execute("UPDATE chat_messages SET is_read = 1 WHERE ip_address = ? AND sender = 'admin'", (client_ip,))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "ip": client_ip, "has_thread": len(msgs) > 0, "messages": msgs})
        return True

    elif raw_path == '/api/analytics/summary':
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as total_views, COUNT(DISTINCT session_id) as unique_visitors FROM page_views")
        views_row = cursor.fetchone()

        cursor.execute("SELECT COUNT(*) as download_clicks FROM analytics_events WHERE target = 'download_button'")
        dl_clicks = cursor.fetchone()['download_clicks']

        cursor.execute("SELECT COUNT(*) as total_clicks FROM analytics_events WHERE event_type = 'click'")
        total_clicks = cursor.fetchone()['total_clicks']

        cursor.execute("""
        SELECT target, COUNT(*) as count 
        FROM analytics_events 
        WHERE event_type = 'click' 
        GROUP BY target 
        ORDER BY count DESC 
        LIMIT 10
        """)
        top_clicks = [dict(row) for row in cursor.fetchall()]

        cursor.execute("""
        SELECT event_type, target, page, created_at 
        FROM analytics_events 
        ORDER BY id DESC 
        LIMIT 15
        """)
        recent_events = [dict(row) for row in cursor.fetchall()]

        # Statistiques de consentement ePrivacy (totalement anonymisées)
        cursor.execute("SELECT COUNT(*) as c FROM analytics_events WHERE (event_type = 'consent' AND target = 'consent_accepted')")
        consent_accepted = cursor.fetchone()['c']

        cursor.execute("SELECT COUNT(*) as c FROM analytics_events WHERE (event_type = 'consent' AND target = 'consent_refused') OR (event_type = 'refusal')")
        consent_refused = cursor.fetchone()['c']

        total_consent_actions = consent_accepted + consent_refused
        consent_rate = round((consent_accepted / total_consent_actions * 100), 1) if total_consent_actions > 0 else 0.0

        total_views = views_row['total_views']
        conv_rate = round((dl_clicks / total_views * 100), 1) if total_views > 0 else 0.0

        # Statistiques anonymisées : Systèmes d'exploitation, Navigateurs et Appareils
        cursor.execute("""
        SELECT os, COUNT(*) as count 
        FROM page_views 
        WHERE os IS NOT NULL AND os != '' AND os != 'Inconnu'
        GROUP BY os 
        ORDER BY count DESC 
        LIMIT 6
        """)
        os_stats = [dict(row) for row in cursor.fetchall()]

        cursor.execute("""
        SELECT browser, COUNT(*) as count 
        FROM page_views 
        WHERE browser IS NOT NULL AND browser != '' AND browser != 'Inconnu'
        GROUP BY browser 
        ORDER BY count DESC 
        LIMIT 6
        """)
        browser_stats = [dict(row) for row in cursor.fetchall()]

        cursor.execute("""
        SELECT device, COUNT(*) as count 
        FROM page_views 
        WHERE device IS NOT NULL AND device != ''
        GROUP BY device 
        ORDER BY count DESC 
        LIMIT 4
        """)
        device_stats = [dict(row) for row in cursor.fetchall()]

        conn.close()
        req.send_json({
            "total_views": total_views,
            "unique_visitors": views_row['unique_visitors'],
            "download_clicks": dl_clicks,
            "total_clicks": total_clicks,
            "conversion_rate": conv_rate,
            "consent_accepted": consent_accepted,
            "consent_refused": consent_refused,
            "consent_rate": consent_rate,
            "os_stats": os_stats,
            "browser_stats": browser_stats,
            "device_stats": device_stats,
            "top_clicks": top_clicks,
            "recent_events": recent_events
        })
        return True

    return False

def parse_user_agent(ua_str):
    if not ua_str:
        return ('Inconnu', 'Inconnu', 'desktop')
    ua = ua_str.lower()

    # Détection OS
    os_name = 'Autre'
    if 'windows' in ua:
        os_name = 'Windows'
    elif 'android' in ua:
        os_name = 'Android'
    elif 'iphone' in ua or 'ipad' in ua or 'ipod' in ua:
        os_name = 'iOS'
    elif 'macintosh' in ua or 'mac os x' in ua:
        os_name = 'macOS'
    elif 'linux' in ua:
        os_name = 'Linux'
    elif 'cros' in ua:
        os_name = 'ChromeOS'

    # Détection Navigateur
    browser_name = 'Autre'
    if 'edg/' in ua or 'edge/' in ua:
        browser_name = 'Edge'
    elif 'opr/' in ua or 'opera' in ua:
        browser_name = 'Opera'
    elif 'firefox' in ua or 'fxios' in ua:
        browser_name = 'Firefox'
    elif 'brave' in ua:
        browser_name = 'Brave'
    elif 'chrome' in ua or 'crios' in ua:
        browser_name = 'Chrome'
    elif 'safari' in ua:
        browser_name = 'Safari'

    # Détection Type d'Appareil
    device_type = 'desktop'
    if 'mobile' in ua or 'android' in ua or 'iphone' in ua or 'ipod' in ua:
        device_type = 'mobile'
    elif 'ipad' in ua or 'tablet' in ua:
        device_type = 'tablette'

    return (os_name, browser_name, device_type)

def anonymize_ip(ip_str):
    if not ip_str:
        return '0.0.0.0'
    # IPv4
    if '.' in ip_str:
        parts = ip_str.split('.')
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}.0"
    # IPv6
    if ':' in ip_str:
        parts = ip_str.split(':')
        if len(parts) >= 3:
            return f"{parts[0]}:{parts[1]}:{parts[2]}::"
    return '0.0.0.0'

def sanitize_referrer(ref_str):
    if not ref_str:
        return ''
    return ref_str.split('?')[0][:250]

def handle_public_post(req, path, payload, client_ip):
    if path == '/api/ban/appeal':
        email = payload.get('email', '').strip()
        message = payload.get('message', '').strip()
        if not email or not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
            req.send_json({"status": "error", "message": "L'adresse email est obligatoire pour traiter votre recours."}, status=400)
            return True
        if not message:
            req.send_json({"status": "error", "message": "Veuillez rédiger un message d'explication pour votre recours."}, status=400)
            return True
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM ban_appeals WHERE ip_address = ? AND datetime(created_at) >= datetime('now', 'localtime', '-12 hours')", (client_ip,))
        if cursor.fetchone()[0] >= 5:
            conn.close()
            req.send_json({"status": "error", "message": "Limite atteinte : 5 recours maximum toutes les 12 heures."}, status=429)
            return True
        cursor.execute("INSERT INTO ban_appeals (ip_address, email, message) VALUES (?, ?, ?)",
                       (client_ip, email, message))
        conn.commit()
        conn.close()
        req.send_json({
            "status": "ok",
            "message": "Votre recours a bien été transmis aux administrateurs. Il sera examiné prochainement."
        })
        return True

    elif path == '/api/user/chat/send':
        message = (payload.get('message') or '').strip()
        if not message:
            req.send_json({"status": "error", "message": "Message vide"}, status=400)
            return True
        if len(message) > 2000:
            req.send_json({"status": "error", "message": "Message trop long (2000 max)"}, status=400)
            return True
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM chat_messages WHERE ip_address = ?", (client_ip,))
        if cursor.fetchone()[0] == 0:
            conn.close()
            req.send_json({"status": "error", "message": "Aucune discussion ouverte par l'administrateur."}, status=403)
            return True
        cursor.execute("SELECT COUNT(*) FROM chat_messages WHERE ip_address = ? AND date(created_at) = date('now', 'localtime') AND sender = 'visitor'", (client_ip,))
        if cursor.fetchone()[0] >= 50:
            conn.close()
            req.send_json({"status": "error", "message": "Limite de 50 messages par jour atteinte."}, status=429)
            return True
        cursor.execute("INSERT INTO chat_messages (ip_address, sender, message) VALUES (?, 'visitor', ?)", (client_ip, message))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Message transmis à l'administrateur."})
        return True

    elif path in ('/api/track/refusal', '/api/track/consent-stat'):
        # Compteur statistique anonyme sans rétention de session ni d'adresse IP
        choice = payload.get('choice', 'consent_refused') if path == '/api/track/consent-stat' else 'consent_refused'
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO analytics_events (event_type, target, page, session_id, meta_json, ip_address) VALUES ('consent', ?, '/', 'anon', '{}', 'ANON')", (choice,))
        conn.commit()
        conn.close()
        req.send_json({"status": "consent_stat_recorded"})
        return True

    elif path == '/api/track':
        event_type = payload.get('event_type', 'click')
        target = payload.get('target', 'unknown')
        page = payload.get('page', '/')
        session_id = payload.get('session_id', 'anon')
        meta_json = json.dumps(payload.get('meta', {}))

        ua = req.headers.get('User-Agent', '')
        os_name, browser_name, device_type = parse_user_agent(ua)
        anon_ip = anonymize_ip(client_ip)

        conn = get_db()
        cursor = conn.cursor()
        if event_type == 'page_view':
            referrer = sanitize_referrer(payload.get('referrer', ''))
            cursor.execute("INSERT INTO page_views (page, session_id, referrer, ip_address, os, browser, device) VALUES (?, ?, ?, ?, ?, ?, ?)",
                           (page, session_id, referrer, anon_ip, os_name, browser_name, device_type))
        else:
            cursor.execute("INSERT INTO analytics_events (event_type, target, page, session_id, meta_json, ip_address, os, browser, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           (event_type, target, page, session_id, meta_json, anon_ip, os_name, browser_name, device_type))
        conn.commit()
        conn.close()
        req.send_json({"status": "tracked"})
        return True

    return False
