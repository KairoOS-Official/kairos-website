import json
import sqlite3
from src.data.db import get_db
from src.services.auth import verify_token, get_token_user, hash_password
from src.services.security import get_data_retention_overview, purge_expired_gdpr_data

def handle_admin_get(req, raw_path, query):
    conn = get_db()
    cursor = conn.cursor()

    if raw_path == '/api/admin/users':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True

        cursor.execute("""
            SELECT DISTINCT ip_address FROM (
                SELECT ip_address FROM page_views WHERE ip_address IS NOT NULL AND ip_address != ''
                UNION
                SELECT ip_address FROM analytics_events WHERE ip_address IS NOT NULL AND ip_address != ''
                UNION
                SELECT ip_address FROM roadmap_votes WHERE ip_address IS NOT NULL AND ip_address != ''
                UNION
                SELECT ip_address FROM community_proposals WHERE ip_address IS NOT NULL AND ip_address != ''
                UNION
                SELECT ip_address FROM feature_suggestions WHERE ip_address IS NOT NULL AND ip_address != ''
                UNION
                SELECT ip_address FROM banned_ips WHERE ip_address IS NOT NULL AND ip_address != ''
            )
        """)
        raw_ips = [r['ip_address'] for r in cursor.fetchall()]

        users = []
        for ip in raw_ips:
            cursor.execute("SELECT COUNT(*) as c FROM page_views WHERE ip_address = ?", (ip,))
            v_count = cursor.fetchone()['c']

            cursor.execute("SELECT COUNT(*) as c FROM analytics_events WHERE ip_address = ?", (ip,))
            e_count = cursor.fetchone()['c']

            cursor.execute("SELECT COUNT(*) as c FROM roadmap_votes WHERE ip_address = ?", (ip,))
            votes_c = cursor.fetchone()['c']

            cursor.execute("SELECT COUNT(*) as c FROM community_proposals WHERE ip_address = ?", (ip,))
            props_c = cursor.fetchone()['c']

            cursor.execute("SELECT COUNT(*) as c FROM feature_suggestions WHERE ip_address = ?", (ip,))
            sugs_c = cursor.fetchone()['c']

            cursor.execute("""
                SELECT MAX(ts) as last_seen FROM (
                    SELECT MAX(created_at) as ts FROM page_views WHERE ip_address = ?
                    UNION ALL
                    SELECT MAX(created_at) as ts FROM analytics_events WHERE ip_address = ?
                    UNION ALL
                    SELECT MAX(created_at) as ts FROM roadmap_votes WHERE ip_address = ?
                    UNION ALL
                    SELECT MAX(created_at) as ts FROM community_proposals WHERE ip_address = ?
                    UNION ALL
                    SELECT MAX(created_at) as ts FROM feature_suggestions WHERE ip_address = ?
                )
            """, (ip, ip, ip, ip, ip))
            last_seen_row = cursor.fetchone()
            last_seen = last_seen_row['last_seen'] if last_seen_row else None

            cursor.execute("SELECT author, email FROM community_proposals WHERE ip_address = ? ORDER BY id DESC LIMIT 1", (ip,))
            prop_info = cursor.fetchone()
            nickname = prop_info['author'] if prop_info and prop_info['author'] != 'Anonyme' else None
            email = prop_info['email'] if prop_info else None

            if not nickname:
                cursor.execute("SELECT author FROM feature_suggestions WHERE ip_address = ? ORDER BY id DESC LIMIT 1", (ip,))
                sug_info = cursor.fetchone()
                if sug_info and sug_info['author'] != 'Anonyme':
                    nickname = sug_info['author']

            cursor.execute("SELECT * FROM banned_ips WHERE ip_address = ?", (ip,))
            ban_row = cursor.fetchone()
            ban_info = dict(ban_row) if ban_row else None

            users.append({
                "ip_address": ip,
                "total_connections": v_count + e_count,
                "page_views": v_count,
                "events_count": e_count,
                "votes_count": votes_c,
                "proposals_count": props_c,
                "suggestions_count": sugs_c,
                "nickname": nickname,
                "email": email,
                "last_seen": last_seen,
                "ban": ban_info
            })

        users.sort(key=lambda u: (u['last_seen'] or '', u['total_connections']), reverse=True)
        conn.close()
        req.send_json({"status": "ok", "users": users, "total": len(users)})
        return True

    elif raw_path == '/api/admin/users/detail':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        target_ip = query.get('ip', [''])[0].strip()
        if not target_ip:
            conn.close()
            req.send_json({"status": "error", "message": "IP requise"}, status=400)
            return True

        cursor.execute("SELECT * FROM banned_ips WHERE ip_address = ?", (target_ip,))
        ban_row = cursor.fetchone()
        ban = dict(ban_row) if ban_row else None

        cursor.execute("""
            SELECT v.id, v.feature_id, v.created_at, v.user_agent, f.title_fr, f.title_en, f.tag
            FROM roadmap_votes v
            LEFT JOIN roadmap_features f ON v.feature_id = f.id
            WHERE v.ip_address = ?
            ORDER BY v.id DESC
        """, (target_ip,))
        votes = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT id, title, category, description, author, email, status, created_at
            FROM community_proposals
            WHERE ip_address = ?
            ORDER BY id DESC
        """, (target_ip,))
        proposals = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT s.id, s.feature_id, s.author, s.email, s.suggestion_text, s.status, s.created_at, f.title_fr, f.tag
            FROM feature_suggestions s
            LEFT JOIN roadmap_features f ON s.feature_id = f.id
            WHERE s.ip_address = ?
            ORDER BY s.id DESC
        """, (target_ip,))
        suggestions = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT page, referrer, created_at FROM page_views WHERE ip_address = ? ORDER BY id DESC LIMIT 50", (target_ip,))
        views = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT event_type, target, page, created_at FROM analytics_events WHERE ip_address = ? ORDER BY id DESC LIMIT 50", (target_ip,))
        events = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT id, ip_address, email, message, status, admin_response, archived, created_at FROM ban_appeals WHERE ip_address = ? ORDER BY id DESC", (target_ip,))
        appeals = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT id, sender, message, is_read, created_at FROM chat_messages WHERE ip_address = ? ORDER BY id ASC LIMIT 200", (target_ip,))
        chat = [dict(r) for r in cursor.fetchall()]

        try:
            cursor.execute("SELECT username_attempted, status, sanction_applied, user_agent, created_at FROM admin_login_logs WHERE ip_address = ? ORDER BY id DESC LIMIT 20", (target_ip,))
            login_logs = [dict(r) for r in cursor.fetchall()]
        except Exception:
            login_logs = []

        last_seen = None
        for pool in (views, events, votes, proposals, suggestions, appeals, chat):
            for row in pool:
                ts = row.get('created_at')
                if ts and (last_seen is None or ts > last_seen):
                    last_seen = ts

        history = []
        for vw in views:
            history.append({"path": vw.get('page') or '/', "page_title": ('Réf: ' + vw.get('referrer')) if vw.get('referrer') else 'Page vue', "viewed_at": vw.get('created_at')})
        for ev in events:
            history.append({"path": ev.get('page') or '/', "page_title": f"{ev.get('event_type')}: {ev.get('target')}", "viewed_at": ev.get('created_at')})
        history.sort(key=lambda h: h.get('viewed_at') or '', reverse=True)
        history = history[:50]

        for v in votes:
            v['feature_title'] = v.get('title_fr') or v.get('title_en') or f"Feature #{v.get('feature_id')}"
            v['feature_tag'] = v.get('tag')
        for s in suggestions:
            s['feature_title'] = s.get('title_fr') or f"Feature #{s.get('feature_id')}"

        conn.close()
        req.send_json({
            "status": "ok",
            "ip": target_ip,
            "ban": ban,
            "is_banned": ban is not None,
            "ban_details": ban,
            "last_seen": last_seen,
            "votes": votes,
            "proposals": proposals,
            "suggestions": suggestions,
            "recent_views": views,
            "recent_events": events,
            "history": history,
            "appeals": appeals,
            "chat": chat,
            "login_logs": login_logs
        })
        return True

    elif raw_path == '/api/admin/chat':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        target_ip = query.get('ip', [''])[0].strip()
        if not target_ip:
            conn.close()
            req.send_json({"status": "error", "message": "IP requise"}, status=400)
            return True
        cursor.execute("SELECT id, sender, message, is_read, created_at FROM chat_messages WHERE ip_address = ? ORDER BY id ASC LIMIT 200", (target_ip,))
        msgs = [dict(r) for r in cursor.fetchall()]
        cursor.execute("UPDATE chat_messages SET is_read = 1 WHERE ip_address = ? AND sender = 'visitor'", (target_ip,))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "ip": target_ip, "messages": msgs})
        return True

    elif raw_path == '/api/admin/features/votes':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        fid = query.get('feature_id', [''])[0].strip()
        if not fid:
            conn.close()
            req.send_json({"status": "error", "message": "ID requis"}, status=400)
            return True

        cursor.execute("SELECT id, title_fr, title_en, tag, votes_count FROM roadmap_features WHERE id = ?", (fid,))
        feature_row = cursor.fetchone()
        if not feature_row:
            conn.close()
            req.send_json({"status": "error", "message": "Fonctionnalité introuvable"}, status=404)
            return True

        feature = dict(feature_row)
        cursor.execute("""
            SELECT v.id, v.feature_id, v.ip_address, v.user_agent, v.created_at,
                   b.ban_type, b.block_vote, b.expires_at, b.reason as ban_reason
            FROM roadmap_votes v
            LEFT JOIN banned_ips b ON v.ip_address = b.ip_address
            WHERE v.feature_id = ?
            ORDER BY v.id DESC
        """, (fid,))
        votes = [dict(r) for r in cursor.fetchall()]
        conn.close()

        req.send_json({
            "status": "ok",
            "feature": feature,
            "votes": votes,
            "total_votes": len(votes)
        })
        return True

    elif raw_path == '/api/admin/appeals':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        cursor.execute("SELECT * FROM ban_appeals ORDER BY id DESC")
        appeals = [dict(r) for r in cursor.fetchall()]
        conn.close()
        req.send_json({"status": "ok", "appeals": appeals})
        return True

    elif raw_path == '/api/admin/security/config':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        cursor.execute("SELECT access_mode, allowed_ips FROM admin_security_config WHERE id = 1")
        row = cursor.fetchone()
        conn.close()
        req.send_json({
            "status": "ok",
            "access_mode": row['access_mode'] if row else 'all',
            "allowed_ips": row['allowed_ips'] if row else '127.0.0.1,::1',
            "client_ip": req.get_client_ip()
        })
        return True

    elif raw_path == '/api/admin/admins':
        if not verify_token(req.headers, 'settings'):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        cursor.execute("SELECT id, username, role, permissions, last_login, last_ip, created_at FROM admin_users ORDER BY id ASC")
        admins = []
        for row in cursor.fetchall():
            d = dict(row)
            try:
                d['permissions'] = json.loads(d['permissions']) if d['permissions'] else ["all"]
            except Exception:
                d['permissions'] = ["all"]
            admins.append(d)
        conn.close()
        req.send_json({"status": "ok", "admins": admins})
        return True

    elif raw_path == '/api/admin/audit-logs':
        if not verify_token(req.headers, 'settings'):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        cursor.execute("SELECT * FROM admin_login_logs ORDER BY id DESC LIMIT 150")
        logs = [dict(r) for r in cursor.fetchall()]
        conn.close()
        req.send_json({"status": "ok", "logs": logs})
        return True

    elif raw_path == '/api/admin/notifications':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        cursor.execute("SELECT * FROM security_notifications ORDER BY id DESC LIMIT 50")
        notifs = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT COUNT(*) FROM security_notifications WHERE is_read = 0")
        unread_count = cursor.fetchone()[0]
        conn.close()
        req.send_json({"status": "ok", "notifications": notifs, "unread_count": unread_count})
        return True

    elif raw_path == '/api/admin/bans':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        cursor.execute("SELECT * FROM banned_ips ORDER BY id DESC")
        bans = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT ip_address, count(*) as count, 'vote' as origin FROM roadmap_votes WHERE ip_address IS NOT NULL GROUP BY ip_address
            UNION
            SELECT ip_address, count(*) as count, 'proposal' as origin FROM community_proposals WHERE ip_address IS NOT NULL GROUP BY ip_address
            UNION
            SELECT ip_address, count(*) as count, 'suggestion' as origin FROM feature_suggestions WHERE ip_address IS NOT NULL GROUP BY ip_address
            ORDER BY count DESC LIMIT 100
        """)
        known_ips = [dict(r) for r in cursor.fetchall()]
        conn.close()
        req.send_json({"status": "ok", "bans": bans, "known_ips": known_ips})
        return True

    elif raw_path == '/api/admin/data/retention':
        if not verify_token(req.headers, 'settings'):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        conn.close()
        overview = get_data_retention_overview()
        req.send_json({"status": "ok", "retention": overview})
        return True

    conn.close()
    return False

def handle_admin_post(req, path, payload):
    conn = get_db()
    cursor = conn.cursor()

    if path == '/api/admin/users/delete':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        target_ip = payload.get('ip_address', '').strip()
        if not target_ip:
            conn.close()
            req.send_json({"status": "error", "message": "Adresse IP requise"}, status=400)
            return True

        cursor.execute("DELETE FROM page_views WHERE ip_address = ?", (target_ip,))
        views_del = cursor.rowcount
        cursor.execute("DELETE FROM analytics_events WHERE ip_address = ?", (target_ip,))
        events_del = cursor.rowcount
        cursor.execute("DELETE FROM roadmap_votes WHERE ip_address = ?", (target_ip,))
        votes_del = cursor.rowcount
        cursor.execute("DELETE FROM community_proposals WHERE ip_address = ?", (target_ip,))
        props_del = cursor.rowcount
        cursor.execute("DELETE FROM feature_suggestions WHERE ip_address = ?", (target_ip,))
        sugs_del = cursor.rowcount
        cursor.execute("DELETE FROM banned_ips WHERE ip_address = ?", (target_ip,))
        bans_del = cursor.rowcount
        cursor.execute("DELETE FROM ban_appeals WHERE ip_address = ?", (target_ip,))
        appeals_del = cursor.rowcount
        cursor.execute("DELETE FROM chat_messages WHERE ip_address = ?", (target_ip,))
        chat_del = cursor.rowcount

        cursor.execute("""
            UPDATE roadmap_features
            SET votes_count = (
                SELECT COUNT(*) FROM roadmap_votes
                WHERE roadmap_votes.feature_id = roadmap_features.id
            )
        """)
        conn.commit()
        conn.close()

        req.send_json({
            "status": "ok",
            "message": f"Utilisateur {target_ip} supprimé définitivement ({views_del} vues, {votes_del} votes, {props_del + sugs_del} contributions, {appeals_del} recours, {chat_del} messages purgés)."
        })
        return True

    elif path == '/api/admin/appeals/delete':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        appeal_id = payload.get('appeal_id')
        hard = bool(payload.get('hard', False))
        if not appeal_id:
            conn.close()
            req.send_json({"status": "error", "message": "ID de recours requis"}, status=400)
            return True
        if hard:
            cursor.execute("DELETE FROM ban_appeals WHERE id = ?", (appeal_id,))
        else:
            cursor.execute("UPDATE ban_appeals SET archived = 1 WHERE id = ?", (appeal_id,))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Recours supprimé du panel (conservé en fiche profil)."})
        return True

    elif path == '/api/admin/votes/delete':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        fid = payload.get('feature_id')
        target_ip = (payload.get('ip_address') or '').strip()
        if not fid or not target_ip:
            conn.close()
            req.send_json({"status": "error", "message": "feature_id et ip_address requis"}, status=400)
            return True
        cursor.execute("DELETE FROM roadmap_votes WHERE feature_id = ? AND ip_address = ?", (fid, target_ip))
        deleted = cursor.rowcount
        cursor.execute("UPDATE roadmap_features SET votes_count = (SELECT COUNT(*) FROM roadmap_votes WHERE feature_id = ?) WHERE id = ?", (fid, fid))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": f"{deleted} vote(s) révoqué(s)."})
        return True

    elif path == '/api/admin/chat/send':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        target_ip = (payload.get('ip_address') or '').strip()
        message = (payload.get('message') or '').strip()
        if not target_ip or not message:
            conn.close()
            req.send_json({"status": "error", "message": "IP et message requis"}, status=400)
            return True
        if len(message) > 2000:
            conn.close()
            req.send_json({"status": "error", "message": "Message trop long (2000 max)"}, status=400)
            return True
        cursor.execute("INSERT INTO chat_messages (ip_address, sender, message) VALUES (?, 'admin', ?)", (target_ip, message))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Message envoyé au visiteur."})
        return True

    elif path == '/api/admin/security/config':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        access_mode = payload.get('access_mode', 'all')
        if access_mode not in ('all', 'local_only', 'whitelist'):
            access_mode = 'all'
        allowed_ips = payload.get('allowed_ips', '127.0.0.1,::1')

        cursor.execute("""
            INSERT INTO admin_security_config (id, access_mode, allowed_ips)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET access_mode=excluded.access_mode, allowed_ips=excluded.allowed_ips
        """, (access_mode, allowed_ips))
        conn.commit()
        conn.close()

        req.send_json({
            "status": "ok",
            "message": "Politique de restriction d'accès IP mise à jour avec succès."
        })
        return True

    elif path == '/api/admin/appeals/respond':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        appeal_id = payload.get('appeal_id')
        action = payload.get('action', 'accept')
        escalate_reason = (payload.get('escalate_reason') or '').strip()

        cursor.execute("SELECT * FROM ban_appeals WHERE id = ?", (appeal_id,))
        appeal = cursor.fetchone()
        if not appeal:
            conn.close()
            req.send_json({"status": "error", "message": "Recours introuvable"}, status=404)
            return True

        target_ip = appeal['ip_address']
        if action == 'escalate':
            if not escalate_reason:
                conn.close()
                req.send_json({"status": "error", "message": "La raison de la sur-sanction est obligatoire."}, status=400)
                return True
            cursor.execute("UPDATE ban_appeals SET status = 'escalated', admin_response = ? WHERE id = ?", (escalate_reason, appeal_id))
            cursor.execute("""
                INSERT INTO banned_ips (ip_address, ban_type, expires_at, block_vote, block_proposal, block_suggestion, block_all, reason, created_at)
                VALUES (?, 'permanent', NULL, 1, 1, 1, 1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(ip_address) DO UPDATE SET
                    ban_type = 'permanent', expires_at = NULL,
                    block_vote = 1, block_proposal = 1, block_suggestion = 1, block_all = 1,
                    reason = excluded.reason
            """, (target_ip, f"Sur-sanction (recours abusif) : {escalate_reason}"))
            conn.commit()
            conn.close()
            req.send_json({
                "status": "ok",
                "message": f"Recours abusif : l'adresse IP {target_ip} a été sur-sanctionnée (blocage total, bannissement à vie possible)."
            })
            return True

        new_status = 'accepted' if action == 'accept' else 'rejected'
        cursor.execute("UPDATE ban_appeals SET status = ? WHERE id = ?", (new_status, appeal_id))

        if action == 'accept':
            cursor.execute("DELETE FROM banned_ips WHERE ip_address = ?", (target_ip,))
            conn.commit()
            conn.close()
            req.send_json({
                "status": "ok",
                "message": f"Recours accepté ! L'adresse IP {target_ip} a été débannie avec succès."
            })
            return True
        else:
            conn.commit()
            conn.close()
            req.send_json({
                "status": "ok",
                "message": f"Recours rejeté pour l'adresse IP {target_ip}."
            })
            return True

    elif path == '/api/admin/bans/save':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized"}, status=401)
            return True
        ip = payload.get('ip_address', '').strip()
        if not ip:
            conn.close()
            req.send_json({"status": "error", "message": "Adresse IP requise."}, status=400)
            return True

        ban_type = payload.get('ban_type', 'permanent')
        duration_hours = int(payload.get('duration_hours', 24))
        expires_at = payload.get('expires_at')

        if ban_type == 'temp' and not expires_at:
            from datetime import datetime, timezone, timedelta
            exp_dt = datetime.now(timezone.utc) + timedelta(hours=duration_hours)
            expires_at = exp_dt.isoformat()
        elif ban_type == 'permanent':
            expires_at = None

        block_vote = 1 if payload.get('block_vote', True) else 0
        block_proposal = 1 if payload.get('block_proposal', True) else 0
        block_suggestion = 1 if payload.get('block_suggestion', True) else 0
        block_all = 1 if payload.get('block_all', False) else 0
        reason = payload.get('reason', 'Non respect des règles').strip() or 'Non respect des règles'

        cursor.execute("""
            INSERT INTO banned_ips (ip_address, ban_type, expires_at, block_vote, block_proposal, block_suggestion, block_all, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(ip_address) DO UPDATE SET
                ban_type = excluded.ban_type,
                expires_at = excluded.expires_at,
                block_vote = excluded.block_vote,
                block_proposal = excluded.block_proposal,
                block_suggestion = excluded.block_suggestion,
                block_all = excluded.block_all,
                reason = excluded.reason,
                created_at = CURRENT_TIMESTAMP
        """, (ip, ban_type, expires_at, block_vote, block_proposal, block_suggestion, block_all, reason))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": f"Bannissement appliqué avec succès pour l'adresse IP {ip}."})
        return True

    elif path == '/api/admin/admins/save':
        if not verify_token(req.headers, 'settings'):
            conn.close()
            req.send_json({"status": "error", "message": "Permission insuffisante pour gérer les comptes administrateurs."}, status=403)
            return True
        admin_id = payload.get('id')
        username = payload.get('username', '').strip()
        password = payload.get('password', '').strip()
        role = payload.get('role', 'admin').strip()
        perms = payload.get('permissions', ['all'])
        perms_json = json.dumps(perms)

        if not username:
            conn.close()
            req.send_json({"status": "error", "message": "L'identifiant est obligatoire."}, status=400)
            return True

        if admin_id:
            if password:
                pwd_hash = hash_password(password)
                cursor.execute("""
                    UPDATE admin_users
                    SET username = ?, password_hash = ?, role = ?, permissions = ?
                    WHERE id = ?
                """, (username, pwd_hash, role, perms_json, admin_id))
            else:
                cursor.execute("""
                    UPDATE admin_users
                    SET username = ?, role = ?, permissions = ?
                    WHERE id = ?
                """, (username, role, perms_json, admin_id))
            conn.commit()
            conn.close()
            req.send_json({"status": "ok", "message": f"Compte administrateur '{username}' mis à jour avec succès."})
            return True
        else:
            if not password:
                conn.close()
                req.send_json({"status": "error", "message": "Le mot de passe est obligatoire pour un nouveau compte."}, status=400)
                return True
            pwd_hash = hash_password(password)
            try:
                cursor.execute("""
                    INSERT INTO admin_users (username, password_hash, role, permissions)
                    VALUES (?, ?, ?, ?)
                """, (username, pwd_hash, role, perms_json))
                conn.commit()
                conn.close()
                req.send_json({"status": "ok", "message": f"Compte administrateur '{username}' créé avec succès."})
                return True
            except sqlite3.IntegrityError:
                conn.close()
                req.send_json({"status": "error", "message": "Cet identifiant est déjà utilisé."}, status=400)
                return True

    elif path == '/api/admin/admins/delete':
        if not verify_token(req.headers, 'settings'):
            conn.close()
            req.send_json({"status": "error", "message": "Permission insuffisante."}, status=403)
            return True
        admin_id = payload.get('id')
        current_user = get_token_user(req.headers)
        if current_user and current_user['id'] == admin_id:
            conn.close()
            req.send_json({"status": "error", "message": "Vous ne pouvez pas supprimer votre propre compte actif."}, status=400)
            return True

        cursor.execute("SELECT username FROM admin_users WHERE id = ?", (admin_id,))
        target = cursor.fetchone()
        if target and target['username'] == 'admin':
            conn.close()
            req.send_json({"status": "error", "message": "Le compte superadministrateur principal 'admin' ne peut pas être supprimé."}, status=400)
            return True

        cursor.execute("DELETE FROM admin_users WHERE id = ?", (admin_id,))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Compte administrateur supprimé."})
        return True

    elif path == '/api/admin/audit-logs/clear':
        if not verify_token(req.headers, 'settings'):
            conn.close()
            req.send_json({"status": "error", "message": "Permission insuffisante."}, status=403)
            return True
        cursor.execute("DELETE FROM admin_login_logs")
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Journaux d'audit réinitialisés avec succès."})
        return True

    elif path == '/api/admin/notifications/mark-read':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "error", "message": "Non autorisé."}, status=401)
            return True
        cursor.execute("UPDATE security_notifications SET is_read = 1")
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Notifications marquées comme lues."})
        return True

    elif path == '/api/admin/bans/delete':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "error", "message": "Non autorisé."}, status=401)
            return True
        bid = payload.get('id')
        ip = payload.get('ip_address')
        if bid:
            cursor.execute("DELETE FROM banned_ips WHERE id = ?", (bid,))
        elif ip:
            cursor.execute("DELETE FROM banned_ips WHERE ip_address = ?", (ip,))
        else:
            conn.close()
            req.send_json({"status": "error", "message": "ID ou IP manquant"}, status=400)
            return True
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Bannissement levé avec succès ! L'IP a retrouvé tous ses droits."})
        return True

    elif path == '/api/admin/password':
        if not verify_token(req.headers, 'settings'):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Permission insuffisante pour modifier un mot de passe administrateur."}, status=403)
            return True

        target_username = (payload.get('username') or 'admin').strip()
        new_pwd = (payload.get('new_password') or '').strip()
        if not new_pwd or len(new_pwd) < 6:
            conn.close()
            req.send_json({"status": "error", "message": "Le mot de passe doit faire au moins 6 caractères"}, status=400)
            return True

        cursor.execute("SELECT id FROM admin_users WHERE username = ?", (target_username,))
        target = cursor.fetchone()
        if not target:
            conn.close()
            req.send_json({"status": "error", "message": f"Compte admin '{target_username}' introuvable."}, status=404)
            return True

        cursor.execute("UPDATE admin_users SET password_hash = ? WHERE username = ?", (hash_password(new_pwd), target_username))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": f"Mot de passe modifié avec succès pour '{target_username}'."})
        return True

    elif path == '/api/admin/data/purge':
        if not verify_token(req.headers, 'settings'):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Permission insuffisante."}, status=403)
            return True

        scope = payload.get('scope', 'expired') # 'expired', 'analytics', 'community', 'appeals', 'logs', 'all'

        if scope == 'expired':
            conn.close()
            purge_expired_gdpr_data()
            return req.send_json({"status": "ok", "message": "Purge automatique des données expirées exécutée avec succès."})

        elif scope == 'analytics':
            cursor.execute("DELETE FROM page_views")
            cursor.execute("DELETE FROM analytics_events")
            conn.commit()
            conn.close()
            return req.send_json({"status": "ok", "message": "Toutes les données analytics et pages vues ont été réinitialisées."})

        elif scope == 'community':
            cursor.execute("DELETE FROM community_proposals")
            cursor.execute("DELETE FROM feature_suggestions")
            conn.commit()
            conn.close()
            return req.send_json({"status": "ok", "message": "Toutes les idées et suggestions communautaires ont été purgées."})

        elif scope == 'appeals':
            cursor.execute("DELETE FROM ban_appeals")
            cursor.execute("DELETE FROM chat_messages")
            conn.commit()
            conn.close()
            return req.send_json({"status": "ok", "message": "Tous les recours et messages de discussion ont été purgés."})

        elif scope == 'logs':
            cursor.execute("DELETE FROM admin_login_logs")
            cursor.execute("DELETE FROM security_notifications")
            conn.commit()
            conn.close()
            return req.send_json({"status": "ok", "message": "Les journaux d'audit et notifications de sécurité ont été vidés."})

        elif scope == 'all':
            cursor.execute("DELETE FROM page_views")
            cursor.execute("DELETE FROM analytics_events")
            cursor.execute("DELETE FROM community_proposals")
            cursor.execute("DELETE FROM feature_suggestions")
            cursor.execute("DELETE FROM ban_appeals")
            cursor.execute("DELETE FROM chat_messages")
            cursor.execute("DELETE FROM admin_login_logs")
            cursor.execute("DELETE FROM security_notifications")
            conn.commit()
            conn.close()
            return req.send_json({"status": "ok", "message": "Réinitialisation intégrale effectuée : toutes les statistiques et données utilisateurs ont été effacées."})

        conn.close()
        req.send_json({"status": "error", "message": "Action inconnue."}, status=400)
        return True

    conn.close()
    return False
