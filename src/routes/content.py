from src.data.db import get_db
from src.services.auth import verify_token

def handle_content_get(req, raw_path, query):
    if raw_path == '/api/content':
        lang = query.get('lang', ['fr'])[0]
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT content_key, content_value FROM site_content_i18n WHERE lang = ?", (lang,))
        content = {row['content_key']: row['content_value'] for row in cursor.fetchall()}

        cursor.execute("SELECT id, title, genre, year, desc_fr, desc_en, image, bg_image, sort_order FROM arcade_games ORDER BY sort_order ASC")
        games_raw = cursor.fetchall()
        games = []
        for r in games_raw:
            g = dict(r)
            g['desc'] = g['desc_' + lang] if ('desc_' + lang) in g else (g['desc_fr'] or '')
            games.append(g)

        cursor.execute("SELECT id, question_fr, question_en, answer_fr, answer_en, sort_order FROM faq_items ORDER BY sort_order ASC")
        faq_raw = cursor.fetchall()
        faq = []
        for r in faq_raw:
            f = dict(r)
            f['question'] = f['question_' + lang] if ('question_' + lang) in f else f['question_fr']
            f['answer'] = f['answer_' + lang] if ('answer_' + lang) in f else f['answer_fr']
            faq.append(f)

        cursor.execute("SELECT id, name, desc_fr, desc_en, category, badge, version, author, installs, sort_order FROM showcase_plugins ORDER BY sort_order ASC")
        plugins_raw = cursor.fetchall()
        plugins = []
        for r in plugins_raw:
            p = dict(r)
            p['desc'] = p['desc_' + lang] if ('desc_' + lang) in p else p['desc_fr']
            plugins.append(p)

        cursor.execute("SELECT id, name, desc_fr, desc_en, badge, rating, author, installs, preview_class, sort_order FROM showcase_themes ORDER BY sort_order ASC")
        themes_raw = cursor.fetchall()
        themes = []
        for r in themes_raw:
            t = dict(r)
            t['desc'] = t['desc_' + lang] if ('desc_' + lang) in t else t['desc_fr']
            themes.append(t)

        cursor.execute("SELECT id, version, title_fr, title_en, desc_fr, desc_en, date_text, progress_percent, status_badge, sort_order FROM roadmap_milestones ORDER BY sort_order ASC")
        milestones_raw = cursor.fetchall()
        milestones = []
        for r in milestones_raw:
            m = dict(r)
            m['title'] = m['title_' + lang] if ('title_' + lang) in m else m['title_fr']
            m['desc'] = m['desc_' + lang] if ('desc_' + lang) in m else m['desc_fr']
            milestones.append(m)

        conn.close()
        req.send_json({
            "status": "ok",
            "lang": lang,
            "content": content,
            "games": games,
            "faq": faq,
            "plugins": plugins,
            "themes": themes,
            "milestones": milestones
        })
        return True

    elif raw_path == '/api/content/all':
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT content_key, lang, content_value FROM site_content_i18n")
        content_rows = cursor.fetchall()
        content_i18n = {}
        for r in content_rows:
            k = r['content_key']
            if k not in content_i18n:
                content_i18n[k] = {}
            content_i18n[k][r['lang']] = r['content_value']

        cursor.execute("SELECT * FROM arcade_games ORDER BY sort_order ASC")
        games = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM faq_items ORDER BY sort_order ASC")
        faq = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM showcase_plugins ORDER BY sort_order ASC")
        plugins = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM showcase_themes ORDER BY sort_order ASC")
        themes = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM roadmap_milestones ORDER BY sort_order ASC")
        milestones = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM roadmap_features ORDER BY votes_count DESC, sort_order ASC")
        features = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM community_proposals ORDER BY id DESC")
        proposals = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT fs.*, f.title_fr as feature_title, f.tag as feature_tag
            FROM feature_suggestions fs
            LEFT JOIN roadmap_features f ON fs.feature_id = f.id
            ORDER BY fs.id DESC
        """)
        suggestions = [dict(r) for r in cursor.fetchall()]

        conn.close()
        req.send_json({
            "status": "ok",
            "content": content_i18n,
            "games": games,
            "faq": faq,
            "plugins": plugins,
            "themes": themes,
            "milestones": milestones,
            "features": features,
            "proposals": proposals,
            "suggestions": suggestions
        })
        return True

    return False

def handle_content_post(req, path, payload):
    conn = get_db()
    cursor = conn.cursor()

    if path == '/api/content/update':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True

        updates = payload.get('content', {})
        lang = payload.get('lang')
        for key, val in updates.items():
            if isinstance(val, dict):
                for l, text in val.items():
                    cursor.execute("""
                    INSERT INTO site_content_i18n (content_key, lang, content_value, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(content_key, lang) DO UPDATE SET content_value = excluded.content_value, updated_at = CURRENT_TIMESTAMP
                    """, (key, l, text))
            elif lang:
                cursor.execute("""
                INSERT INTO site_content_i18n (content_key, lang, content_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(content_key, lang) DO UPDATE SET content_value = excluded.content_value, updated_at = CURRENT_TIMESTAMP
                """, (key, lang, str(val)))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Contenus mis à jour"})
        return True

    elif path == '/api/games/save':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        game_id = payload.get('id')
        title = payload.get('title')
        genre = payload.get('genre', '')
        year = payload.get('year', '')
        desc_fr = payload.get('desc_fr', '')
        desc_en = payload.get('desc_en', '')
        image = payload.get('image', 'assets/img/games/mario.png')
        bg_image = payload.get('bg_image', 'assets/img/wallpapers/bg-mario.jpg')
        sort_order = payload.get('sort_order', 0)

        if game_id:
            cursor.execute("""
            UPDATE arcade_games 
            SET title = ?, genre = ?, year = ?, desc_fr = ?, desc_en = ?, image = ?, bg_image = ?, sort_order = ? 
            WHERE id = ?
            """, (title, genre, year, desc_fr, desc_en, image, bg_image, sort_order, game_id))
        else:
            cursor.execute("""
            INSERT INTO arcade_games (title, genre, year, desc_fr, desc_en, image, bg_image, sort_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (title, genre, year, desc_fr, desc_en, image, bg_image, sort_order))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Jeu enregistré"})
        return True

    elif path == '/api/games/delete':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        cursor.execute("DELETE FROM arcade_games WHERE id = ?", (payload.get('id'),))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Jeu supprimé"})
        return True

    elif path == '/api/faq/save':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        faq_id = payload.get('id')
        q_fr = payload.get('question_fr', '')
        q_en = payload.get('question_en', '')
        a_fr = payload.get('answer_fr', '')
        a_en = payload.get('answer_en', '')
        sort_order = payload.get('sort_order', 0)

        if faq_id:
            cursor.execute("""
            UPDATE faq_items 
            SET question_fr = ?, question_en = ?, answer_fr = ?, answer_en = ?, sort_order = ? 
            WHERE id = ?
            """, (q_fr, q_en, a_fr, a_en, sort_order, faq_id))
        else:
            cursor.execute("""
            INSERT INTO faq_items (question_fr, question_en, answer_fr, answer_en, sort_order) 
            VALUES (?, ?, ?, ?, ?)
            """, (q_fr, q_en, a_fr, a_en, sort_order))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Question FAQ enregistrée"})
        return True

    elif path == '/api/faq/delete':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        cursor.execute("DELETE FROM faq_items WHERE id = ?", (payload.get('id'),))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Question FAQ supprimée"})
        return True

    elif path == '/api/plugins/save':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        pid = payload.get('id')
        name = payload.get('name')
        desc_fr = payload.get('desc_fr')
        desc_en = payload.get('desc_en')
        cat = payload.get('category', 'GÉNÉRAL')
        badge = payload.get('badge', 'OFFICIEL')
        ver = payload.get('version', 'v1.0.0')
        author = payload.get('author', '@KaïroCore')
        installs = payload.get('installs', '1 000 installs')
        sort_order = payload.get('sort_order', 0)

        if pid:
            cursor.execute("""
            UPDATE showcase_plugins 
            SET name=?, desc_fr=?, desc_en=?, category=?, badge=?, version=?, author=?, installs=?, sort_order=? 
            WHERE id=?
            """, (name, desc_fr, desc_en, cat, badge, ver, author, installs, sort_order, pid))
        else:
            cursor.execute("""
            INSERT INTO showcase_plugins (name, desc_fr, desc_en, category, badge, version, author, installs, sort_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (name, desc_fr, desc_en, cat, badge, ver, author, installs, sort_order))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Plugin enregistré"})
        return True

    elif path == '/api/plugins/delete':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        cursor.execute("DELETE FROM showcase_plugins WHERE id = ?", (payload.get('id'),))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Plugin supprimé"})
        return True

    elif path == '/api/themes/save':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        tid = payload.get('id')
        name = payload.get('name')
        desc_fr = payload.get('desc_fr')
        desc_en = payload.get('desc_en')
        badge = payload.get('badge', 'AMB')
        rating = payload.get('rating', '★ 5.0')
        author = payload.get('author', '@designer')
        installs = payload.get('installs', '500 installs')
        pclass = payload.get('preview_class', 'cyber')
        sort_order = payload.get('sort_order', 0)

        if tid:
            cursor.execute("""
            UPDATE showcase_themes 
            SET name=?, desc_fr=?, desc_en=?, badge=?, rating=?, author=?, installs=?, preview_class=?, sort_order=? 
            WHERE id=?
            """, (name, desc_fr, desc_en, badge, rating, author, installs, pclass, sort_order, tid))
        else:
            cursor.execute("""
            INSERT INTO showcase_themes (name, desc_fr, desc_en, badge, rating, author, installs, preview_class, sort_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (name, desc_fr, desc_en, badge, rating, author, installs, pclass, sort_order))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Thème enregistré"})
        return True

    elif path == '/api/themes/delete':
        if not verify_token(req.headers):
            conn.close()
            req.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            return True
        cursor.execute("DELETE FROM showcase_themes WHERE id = ?", (payload.get('id'),))
        conn.commit()
        conn.close()
        req.send_json({"status": "ok", "message": "Thème supprimé"})
        return True

    conn.close()
    return False
