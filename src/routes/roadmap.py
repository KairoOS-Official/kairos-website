import os
import re
import sqlite3
import urllib.request
from src.data.db import BASE_DIR, get_db
from src.services.auth import verify_token
from src.services.ban import check_ip_ban

def handle_roadmap_get(req, raw_path, query, client_ip):
    conn = get_db()
    cursor = conn.cursor()

    if raw_path == '/api/roadmap/features':
        cursor.execute("""
            SELECT f.id, f.title_fr, f.title_en, f.desc_fr, f.desc_en, f.tag, f.votes_count, f.sort_order,
                   EXISTS(SELECT 1 FROM roadmap_votes v WHERE v.feature_id = f.id AND v.ip_address = ?) as has_voted
            FROM roadmap_features f
            ORDER BY f.votes_count DESC, f.sort_order ASC
        """, (client_ip,))
        features = [dict(r) for r in cursor.fetchall()]

        for f in features:
            cursor.execute("""
                SELECT id, author, suggestion_text, created_at, status 
                FROM feature_suggestions 
                WHERE feature_id = ? AND status != 'rejected'
                ORDER BY id DESC
            """, (f['id'],))
            f['suggestions'] = [dict(s) for s in cursor.fetchall()]

        conn.close()
        req.send_json({
            "status": "ok",
            "client_ip": client_ip,
            "features": features
        })
        return True

    elif raw_path == '/api/roadmap/proposals':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        cursor.execute("SELECT * FROM community_proposals ORDER BY id DESC")
        proposals = [dict(r) for r in cursor.fetchall()]
        conn.close()
        req.send_json({"status": "ok", "proposals": proposals})
        return True

    elif raw_path == '/api/roadmap/suggestions':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        cursor.execute("""
            SELECT fs.*, f.title_fr as feature_title, f.tag as feature_tag
            FROM feature_suggestions fs
            LEFT JOIN roadmap_features f ON fs.feature_id = f.id
            ORDER BY fs.id DESC
        """)
        suggestions = [dict(r) for r in cursor.fetchall()]
        conn.close()
        req.send_json({"status": "ok", "suggestions": suggestions})
        return True

    elif raw_path == '/api/roadmap/votes':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        cursor.execute("""
            SELECT v.id, v.feature_id, f.title_fr, f.title_en, f.tag, v.ip_address, v.user_agent, v.created_at
            FROM roadmap_votes v
            LEFT JOIN roadmap_features f ON v.feature_id = f.id
            ORDER BY v.created_at DESC
            LIMIT 300
        """)
        votes = [dict(r) for r in cursor.fetchall()]
        conn.close()
        req.send_json({"status": "ok", "votes": votes})
        return True

    elif raw_path == '/api/roadmap/github-spec':
        conn.close()
        remote_url = "https://raw.githubusercontent.com/KairoOS-Official/KairoOS/main/docs/ROADMAP.md"
        md_content = ""
        try:
            req_spec = urllib.request.Request(
                remote_url,
                headers={'User-Agent': 'KairoOS-Website/1.0'}
            )
            with urllib.request.urlopen(req_spec, timeout=4) as response:
                md_content = response.read().decode('utf-8', errors='replace')
        except Exception as e:
            md_content = (
                f"# Spécification Feuille de Route KaïroOS\n\n"
                f"> **Note :** La feuille de route est synchronisée depuis le dépôt officiel : [{remote_url}]({remote_url})\n\n"
                f"Impossible de récupérer le document en direct pour le moment ({e}). Veuillez consulter directement [GitHub]({remote_url})."
            )

        req.send_json({
            "status": "ok",
            "markdown": md_content,
            "github_url": "https://github.com/KairoOS-Official/KairoOS/blob/main/docs/ROADMAP.md"
        })
        return True

    conn.close()
    return False

def handle_roadmap_post(req, path, payload, client_ip):
    if path == '/api/roadmap/vote':
        user_agent = req.headers.get('User-Agent', 'Unknown')
        feature_id = payload.get('feature_id')

        is_banned, ban_info = check_ip_ban(client_ip, 'vote')
        if is_banned:
            exp_msg = f" jusqu'au {ban_info.get('expires_at')}" if ban_info.get('ban_type') == 'temp' and ban_info.get('expires_at') else " (définitif)"
            req.send_json({
                "status": "banned",
                "message": f"Votre adresse IP ({client_ip}) est bannie des votes{exp_msg}. Motif : {ban_info.get('reason', 'Non respect des règles')}"
            }, status=403)
            return True

        if not feature_id:
            req.send_json({"status": "error", "message": "ID de fonctionnalité manquant."}, status=400)
            return True

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, title_fr, votes_count FROM roadmap_features WHERE id = ?", (feature_id,))
        feature = cursor.fetchone()
        if not feature:
            conn.close()
            req.send_json({"status": "error", "message": "Fonctionnalité introuvable."}, status=404)
            return True

        cursor.execute("SELECT id, created_at FROM roadmap_votes WHERE feature_id = ? AND ip_address = ?", (feature_id, client_ip))
        existing_vote = cursor.fetchone()
        if existing_vote:
            conn.close()
            req.send_json({
                "status": "already_voted",
                "message": f"Vous avez déjà voté pour cette fonctionnalité avec cette adresse IP ({client_ip}).",
                "feature_id": feature_id,
                "votes_count": feature['votes_count']
            })
            return True

        try:
            cursor.execute("INSERT INTO roadmap_votes (feature_id, ip_address, user_agent) VALUES (?, ?, ?)",
                           (feature_id, client_ip, user_agent))
            cursor.execute("""
                UPDATE roadmap_features 
                SET votes_count = (SELECT COUNT(*) FROM roadmap_votes WHERE feature_id = ?) 
                WHERE id = ?
            """, (feature_id, feature_id))
            conn.commit()

            cursor.execute("SELECT votes_count FROM roadmap_features WHERE id = ?", (feature_id,))
            new_count = cursor.fetchone()['votes_count']
            conn.close()
            req.send_json({
                "status": "ok",
                "message": "Votre vote a été pris en compte avec succès !",
                "feature_id": feature_id,
                "votes_count": new_count
            })
            return True
        except sqlite3.IntegrityError:
            conn.close()
            req.send_json({
                "status": "already_voted",
                "message": f"Vous avez déjà voté pour cette fonctionnalité avec cette adresse IP ({client_ip}).",
                "feature_id": feature_id,
                "votes_count": feature['votes_count']
            })
            return True

    elif path == '/api/roadmap/propose':
        is_banned, ban_info = check_ip_ban(client_ip, 'proposal')
        if is_banned:
            exp_msg = f" jusqu'au {ban_info.get('expires_at')}" if ban_info.get('ban_type') == 'temp' and ban_info.get('expires_at') else " (définitif)"
            req.send_json({
                "status": "banned",
                "message": f"Votre adresse IP ({client_ip}) est bannie des propositions d'idées{exp_msg}. Motif : {ban_info.get('reason', 'Non respect des règles')}"
            }, status=403)
            return True

        title = payload.get('title', '').strip()
        category = payload.get('category', 'GÉNÉRAL').strip()
        desc = payload.get('description', '').strip()
        author = payload.get('author', 'Anonyme').strip() or 'Anonyme'
        email = payload.get('email', '').strip()

        if not title or not desc:
            req.send_json({"status": "error", "message": "Le titre et la description détaillée sont requis."}, status=400)
            return True

        email_pattern = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
        if not email or not re.match(email_pattern, email):
            req.send_json({"status": "error", "message": "Une adresse email valide est obligatoire pour soumettre une idée (ex: contact@domaine.com)."}, status=400)
            return True

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO community_proposals (title, category, description, author, email, ip_address, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
                       (title, category, desc, author, email, client_ip))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Votre idée a bien été soumise à l'équipe ! Elle sera examinée très prochainement."})
        return True

    elif path == '/api/roadmap/features/suggest':
        is_banned, ban_info = check_ip_ban(client_ip, 'suggestion')
        if is_banned:
            exp_msg = f" jusqu'au {ban_info.get('expires_at')}" if ban_info.get('ban_type') == 'temp' and ban_info.get('expires_at') else " (définitif)"
            req.send_json({
                "status": "banned",
                "message": f"Votre adresse IP ({client_ip}) est bannie de l'envoi de compléments{exp_msg}. Motif : {ban_info.get('reason', 'Non respect des règles')}"
            }, status=403)
            return True

        fid = payload.get('feature_id')
        text = payload.get('suggestion_text', '').strip()
        author = payload.get('author', 'Anonyme').strip() or 'Anonyme'
        email = payload.get('email', '').strip()

        if not fid or not text:
            req.send_json({"status": "error", "message": "ID et texte de suggestion requis."}, status=400)
            return True
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM roadmap_features WHERE id = ?", (fid,))
        if not cursor.fetchone():
            conn.close()
            req.send_json({"status": "error", "message": "Fonctionnalité introuvable."}, status=404)
            return True
        cursor.execute("INSERT INTO feature_suggestions (feature_id, author, email, suggestion_text, ip_address, status) VALUES (?, ?, ?, ?, ?, 'pending')",
                       (fid, author, email, text, client_ip))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Votre suggestion ou idée complémentaire a été transmise à l'équipe !"})
        return True

    # Protected Roadmap Admin Actions
    if path in (
        '/api/milestones/save', '/api/milestones/delete',
        '/api/roadmap/features/save', '/api/roadmap/features/delete',
        '/api/roadmap/votes/delete-all', '/api/roadmap/votes/recalculate',
        '/api/roadmap/features/reset-votes', '/api/roadmap/proposals/moderate',
        '/api/roadmap/suggestions/moderate'
    ):
        if not verify_token(req.headers):
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True

        conn = get_db()
        cursor = conn.cursor()

        if path == '/api/milestones/save':
            mid = payload.get('id')
            ver = payload.get('version')
            t_fr = payload.get('title_fr')
            t_en = payload.get('title_en')
            d_fr = payload.get('desc_fr')
            d_en = payload.get('desc_en')
            date_text = payload.get('date_text', '2026')
            prog = payload.get('progress_percent', 0)
            badge = payload.get('status_badge', 'EN COURS')
            sort_order = payload.get('sort_order', 0)

            if mid:
                cursor.execute("""
                UPDATE roadmap_milestones 
                SET version=?, title_fr=?, title_en=?, desc_fr=?, desc_en=?, date_text=?, progress_percent=?, status_badge=?, sort_order=? 
                WHERE id=?
                """, (ver, t_fr, t_en, d_fr, d_en, date_text, prog, badge, sort_order, mid))
            else:
                cursor.execute("""
                INSERT INTO roadmap_milestones (version, title_fr, title_en, desc_fr, desc_en, date_text, progress_percent, status_badge, sort_order) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (ver, t_fr, t_en, d_fr, d_en, date_text, prog, badge, sort_order))
            conn.commit()
            conn.close()
            req.send_json({"status": "ok", "message": "Jalon Roadmap enregistré"})
            return True

        elif path == '/api/milestones/delete':
            cursor.execute("DELETE FROM roadmap_milestones WHERE id = ?", (payload.get('id'),))
            conn.commit()
            conn.close()
            req.send_json({"status": "ok", "message": "Jalon supprimé"})
            return True

        elif path == '/api/roadmap/features/save':
            fid = payload.get('id')
            t_fr = payload.get('title_fr', '')
            t_en = payload.get('title_en', '')
            d_fr = payload.get('desc_fr', '')
            d_en = payload.get('desc_en', '')
            tag = payload.get('tag', 'GÉNÉRAL')
            sort_order = payload.get('sort_order', 0)
            votes_count = payload.get('votes_count')

            if fid:
                if votes_count is not None:
                    cursor.execute("""
                    UPDATE roadmap_features 
                    SET title_fr=?, title_en=?, desc_fr=?, desc_en=?, tag=?, sort_order=?, votes_count=? 
                    WHERE id=?
                    """, (t_fr, t_en, d_fr, d_en, tag, sort_order, votes_count, fid))
                else:
                    cursor.execute("""
                    UPDATE roadmap_features 
                    SET title_fr=?, title_en=?, desc_fr=?, desc_en=?, tag=?, sort_order=? 
                    WHERE id=?
                    """, (t_fr, t_en, d_fr, d_en, tag, sort_order, fid))
            else:
                cursor.execute("""
                INSERT INTO roadmap_features (title_fr, title_en, desc_fr, desc_en, tag, votes_count, sort_order) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (t_fr, t_en, d_fr, d_en, tag, votes_count or 0, sort_order))
            conn.commit()
            conn.close()
            req.send_json({"status": "ok", "message": "Fonctionnalité enregistrée"})
            return True

        elif path == '/api/roadmap/features/delete':
            cursor.execute("DELETE FROM roadmap_features WHERE id = ?", (payload.get('id'),))
            conn.commit()
            conn.close()
            req.send_json({"status": "ok", "message": "Fonctionnalité supprimée"})
            return True

        elif path == '/api/roadmap/votes/delete-all':
            cursor.execute("DELETE FROM roadmap_votes")
            cursor.execute("UPDATE roadmap_features SET votes_count = 0")
            conn.commit()
            conn.close()
            req.send_json({"status": "ok", "message": "Tous les votes ont été réinitialisés à zéro"})
            return True

        elif path == '/api/roadmap/votes/recalculate':
            cursor.execute("""
                UPDATE roadmap_features 
                SET votes_count = (SELECT COUNT(*) FROM roadmap_votes WHERE feature_id = roadmap_features.id)
            """)
            conn.commit()
            conn.close()
            req.send_json({"status": "ok", "message": "Tous les compteurs de votes ont été recalculés"})
            return True

        elif path == '/api/roadmap/features/reset-votes':
            fid = payload.get('id')
            if not fid:
                conn.close()
                req.send_json({"status": "error", "message": "ID de fonctionnalité manquant"}, status=400)
                return True
            cursor.execute("DELETE FROM roadmap_votes WHERE feature_id = ?", (fid,))
            cursor.execute("UPDATE roadmap_features SET votes_count = 0 WHERE id = ?", (fid,))
            conn.commit()
            conn.close()
            req.send_json({"status": "ok", "message": "Votes réinitialisés pour cette fonctionnalité"})
            return True

        elif path == '/api/roadmap/proposals/moderate':
            pid = payload.get('id')
            action = payload.get('action')
            if not pid:
                conn.close()
                req.send_json({"status": "error", "message": "ID manquant"}, status=400)
                return True

            if action == 'delete':
                cursor.execute("DELETE FROM community_proposals WHERE id = ?", (pid,))
                conn.commit()
                conn.close()
                req.send_json({"status": "ok", "message": "Idée supprimée"})
                return True
            elif action == 'reject':
                cursor.execute("UPDATE community_proposals SET status = 'rejected' WHERE id = ?", (pid,))
                conn.commit()
                conn.close()
                req.send_json({"status": "ok", "message": "Idée rejetée"})
                return True
            elif action == 'approve':
                cursor.execute("SELECT * FROM community_proposals WHERE id = ?", (pid,))
                prop = cursor.fetchone()
                if not prop:
                    conn.close()
                    req.send_json({"status": "error", "message": "Idée introuvable"}, status=404)
                    return True
                title = payload.get('title') or prop['title']
                desc = payload.get('description') or prop['description']
                cat = payload.get('category') or prop['category']
                cursor.execute("""
                    INSERT INTO roadmap_features (title_fr, title_en, desc_fr, desc_en, tag, votes_count, sort_order)
                    VALUES (?, ?, ?, ?, ?, 1, 99)
                """, (title, title, desc, desc, cat))
                cursor.execute("UPDATE community_proposals SET status = 'approved' WHERE id = ?", (pid,))
                conn.commit()
                conn.close()
                req.send_json({"status": "ok", "message": "Idée validée et publiée dans les fonctionnalités au vote communautaire !"})
                return True
            elif action == 'edit':
                title = payload.get('title')
                desc = payload.get('description')
                cat = payload.get('category')
                cursor.execute("UPDATE community_proposals SET title = ?, description = ?, category = ? WHERE id = ?",
                               (title, desc, cat, pid))
                conn.commit()
                conn.close()
                req.send_json({"status": "ok", "message": "Idée mise à jour"})
                return True

        elif path == '/api/roadmap/suggestions/moderate':
            sid = payload.get('id')
            action = payload.get('action')
            if not sid:
                conn.close()
                req.send_json({"status": "error", "message": "ID manquant"}, status=400)
                return True

            if action == 'delete':
                cursor.execute("DELETE FROM feature_suggestions WHERE id = ?", (sid,))
                conn.commit()
                conn.close()
                req.send_json({"status": "ok", "message": "Suggestion supprimée"})
                return True
            elif action == 'reject':
                cursor.execute("UPDATE feature_suggestions SET status = 'rejected' WHERE id = ?", (sid,))
                conn.commit()
                conn.close()
                req.send_json({"status": "ok", "message": "Suggestion rejetée"})
                return True
            elif action == 'approve':
                cursor.execute("UPDATE feature_suggestions SET status = 'approved' WHERE id = ?", (sid,))
                conn.commit()
                conn.close()
                req.send_json({"status": "ok", "message": "Suggestion approuvée"})
                return True
            elif action == 'append':
                cursor.execute("SELECT fs.*, f.desc_fr FROM feature_suggestions fs JOIN roadmap_features f ON fs.feature_id = f.id WHERE fs.id = ?", (sid,))
                row = cursor.fetchone()
                if row:
                    new_desc = (row['desc_fr'] or '') + f"\n\n• [Idée ajoutée par {row['author']}]: {row['suggestion_text']}"
                    cursor.execute("UPDATE roadmap_features SET desc_fr = ?, desc_en = ? WHERE id = ?", (new_desc, new_desc, row['feature_id']))
                    cursor.execute("UPDATE feature_suggestions SET status = 'approved' WHERE id = ?", (sid,))
                    conn.commit()
                    conn.close()
                    req.send_json({"status": "ok", "message": "Complément fusionné directement dans la description de la fonctionnalité !"})
                    return True
                else:
                    conn.close()
                    req.send_json({"status": "error", "message": "Suggestion introuvable"}, status=404)
                    return True

    return False
