import http.server
import socketserver
import os
import json
import sqlite3
import hashlib
import secrets
import base64
import time
import argparse
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

PORT = 3000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'data', 'kairoos.db')
UPLOAD_DIR = os.path.join(BASE_DIR, 'assets', 'img', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Protection Anti-Bruteforce en mémoire : IP -> {'count': int, 'locked_until': float}
FAILED_LOGINS = {}

DEFAULT_ADMIN_USERNAME = 'admin'
DEFAULT_ADMIN_PASSWORD = 'KairoOS-Admin-2026!'

def hash_password(password: str, salt: str = "kairo_salt_2026") -> str:
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 13. Ban Appeals (Recours et oppositions aux sanctions)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ban_appeals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        email TEXT,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        admin_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 1. Admin Users, Multi-Account RBAC & Security
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        token TEXT,
        role TEXT DEFAULT 'superadmin',
        permissions TEXT DEFAULT '["all"]',
        last_login DATETIME,
        last_ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Migration de colonnes si existantes
    cursor.execute("PRAGMA table_info(admin_users)")
    admin_cols = [c[1] for c in cursor.fetchall()]
    if 'role' not in admin_cols:
        cursor.execute("ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'superadmin'")
    if 'permissions' not in admin_cols:
        cursor.execute("ALTER TABLE admin_users ADD COLUMN permissions TEXT DEFAULT '[\"all\"]'")
    if 'last_login' not in admin_cols:
        cursor.execute("ALTER TABLE admin_users ADD COLUMN last_login DATETIME")
    if 'last_ip' not in admin_cols:
        cursor.execute("ALTER TABLE admin_users ADD COLUMN last_ip TEXT")

    # Table des logs d'audit de connexion
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_login_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT,
        username_attempted TEXT,
        status TEXT,
        user_agent TEXT,
        sanction_applied INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Table des notifications et alertes de sécurité
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS security_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT,
        type TEXT,
        title TEXT,
        message TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_security_config (
        id INTEGER PRIMARY KEY,
        access_mode TEXT DEFAULT 'all',
        allowed_ips TEXT DEFAULT '127.0.0.1,::1'
    )
    """)
    cursor.execute("INSERT OR IGNORE INTO admin_security_config (id, access_mode, allowed_ips) VALUES (1, 'all', '127.0.0.1,::1')")

    # 2. Analytics Events & Page Views
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        target TEXT,
        page TEXT,
        session_id TEXT,
        meta_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS page_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page TEXT,
        session_id TEXT,
        referrer TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Multilingual Site Content (Key + Lang)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS site_content_i18n (
        content_key TEXT,
        lang TEXT,
        content_value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (content_key, lang)
    )
    """)

    # 4. Arcade Games (FR + EN)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS arcade_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        genre TEXT,
        year TEXT,
        desc_fr TEXT,
        desc_en TEXT,
        image TEXT,
        bg_image TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 5. FAQ Items (FR + EN)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS faq_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_fr TEXT,
        question_en TEXT,
        answer_fr TEXT,
        answer_en TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 6. Showcase Plugins (FR + EN)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS showcase_plugins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        desc_fr TEXT,
        desc_en TEXT,
        category TEXT,
        badge TEXT,
        version TEXT,
        author TEXT,
        installs TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 7. Showcase Themes (FR + EN)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS showcase_themes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        desc_fr TEXT,
        desc_en TEXT,
        badge TEXT,
        rating TEXT,
        author TEXT,
        installs TEXT,
        preview_class TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 8. Roadmap Milestones & Features (FR + EN)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS roadmap_milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT,
        title_fr TEXT,
        title_en TEXT,
        desc_fr TEXT,
        desc_en TEXT,
        date_text TEXT,
        progress_percent INTEGER DEFAULT 0,
        status_badge TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS roadmap_features (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title_fr TEXT,
        title_en TEXT,
        desc_fr TEXT,
        desc_en TEXT,
        tag TEXT,
        votes_count INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 9. Real Community Votes with IP tracking
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS roadmap_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_id INTEGER NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(feature_id, ip_address),
        FOREIGN KEY (feature_id) REFERENCES roadmap_features(id) ON DELETE CASCADE
    )
    """)

    # 10. Community Proposals (Idées futures soumises par les visiteurs)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS community_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT DEFAULT 'GÉNÉRAL',
        description TEXT NOT NULL,
        author TEXT DEFAULT 'Anonyme',
        ip_address TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 11. Feature Suggestions & Modifications (Compléments d'idées liés à un vote)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS feature_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_id INTEGER NOT NULL,
        author TEXT DEFAULT 'Anonyme',
        email TEXT,
        suggestion_text TEXT NOT NULL,
        ip_address TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feature_id) REFERENCES roadmap_features(id) ON DELETE CASCADE
    )
    """)

    # Migration ip_address sur page_views et analytics_events
    cursor.execute("PRAGMA table_info(page_views)")
    cols_pv = [r[1] for r in cursor.fetchall()]
    if 'ip_address' not in cols_pv:
        cursor.execute("ALTER TABLE page_views ADD COLUMN ip_address TEXT")

    cursor.execute("PRAGMA table_info(analytics_events)")
    cols_ae = [r[1] for r in cursor.fetchall()]
    if 'ip_address' not in cols_ae:
        cursor.execute("ALTER TABLE analytics_events ADD COLUMN ip_address TEXT")

    # 12. Banned IPs Table (Système de Bannissement Temporaire / Définitif & Granulaire)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS banned_ips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT UNIQUE NOT NULL,
        ban_type TEXT DEFAULT 'permanent',
        expires_at DATETIME,
        block_vote INTEGER DEFAULT 1,
        block_proposal INTEGER DEFAULT 1,
        block_suggestion INTEGER DEFAULT 1,
        block_all INTEGER DEFAULT 0,
        reason TEXT DEFAULT 'Non respect des règles de la communauté',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Migrations de colonnes si existantes
    cursor.execute("PRAGMA table_info(community_proposals)")
    cols_prop = [r[1] for r in cursor.fetchall()]
    if 'email' not in cols_prop:
        cursor.execute("ALTER TABLE community_proposals ADD COLUMN email TEXT")

    cursor.execute("PRAGMA table_info(feature_suggestions)")
    cols_sug = [r[1] for r in cursor.fetchall()]
    if 'email' not in cols_sug:
        cursor.execute("ALTER TABLE feature_suggestions ADD COLUMN email TEXT")

    # Pas de ban d'exemple en production : on démarre avec une table vide.
    # Les sanctions réelles seront créées uniquement via l'admin ou l'anti-bruteforce.

    conn.commit()

    # --- SEEDING INITIAL DATA ---

    # Default Admin
    cursor.execute("SELECT COUNT(*) FROM admin_users")
    admin_count = cursor.fetchone()[0]
    if admin_count == 0:
        cursor.execute("INSERT INTO admin_users (username, password_hash, role, permissions) VALUES (?, ?, ?, ?)",
                       (DEFAULT_ADMIN_USERNAME, hash_password(DEFAULT_ADMIN_PASSWORD), 'superadmin', '["all"]'))
    else:
        # Align the default seeded account with the known password referenced by project docs and UI.
        cursor.execute("UPDATE admin_users SET password_hash = ?, role = COALESCE(role, 'superadmin'), permissions = COALESCE(permissions, '[\"all\"]') WHERE username = ?",
                       (hash_password(DEFAULT_ADMIN_PASSWORD), DEFAULT_ADMIN_USERNAME))

    # Seed Multilingual Content
    content_seeds = [
        # Home Hero & CTAs
        ("home_hero_badge", "fr", "KAIRO-OS v0.1.0 ALPHA · 100% OPEN SOURCE (MIT)"),
        ("home_hero_badge", "en", "KAIRO-OS v0.1.0 ALPHA · 100% OPEN SOURCE (MIT)"),
        ("version_badge", "fr", "ALPHA 0.1"),
        ("version_badge", "en", "ALPHA 0.1"),
        ("home_hero_title1", "fr", "Toute votre arcade."),
        ("home_hero_title1", "en", "Your entire arcade."),
        ("home_hero_title2", "fr", "Une interface épurée."),
        ("home_hero_title2", "en", "One singular interface."),
        ("home_hero_desc", "fr", "KairoOS transforme votre PC Windows en une borne dédiée haut de gamme. Jeux rétro, blockbusters PC, émulateurs et contrôle distant réunis dans une expérience pensée exclusivement pour la manette."),
        ("home_hero_desc", "en", "KairoOS transforms your Windows PC into a dedicated luxury arcade. Retro gems, native PC blockbusters, emulators and phone remote unified in an experience crafted for the gamepad."),
        ("home_cta_download", "fr", "Télécharger v0.1.0 Alpha (Win x64)"),
        ("home_cta_download", "en", "Download v0.1.0 Alpha (Win x64)"),
        ("home_cta_github", "fr", "Dépôt officiel GitHub"),
        ("home_cta_github", "en", "GitHub Repository"),

        # Home Sections & Comparison
        ("home_section_details_badge", "fr", "DE PLUS PRÈS"),
        ("home_section_details_badge", "en", "CLOSER LOOK"),
        ("home_section_details_title", "fr", "L'arcade sans compromis."),
        ("home_section_details_title", "en", "Arcade without compromise."),
        ("home_comparison_chaos_title", "fr", "L'ancien monde : Le chaos Windows"),
        ("home_comparison_chaos_title", "en", "The old world: Windows Chaos"),
        ("home_comparison_chaos_desc", "fr", "Bureaux encombrés, fenêtres parasites, souris obligatoire et notifications intempestives ruinant l'immersion."),
        ("home_comparison_chaos_desc", "en", "Cluttered desktop, intrusive windows, mouse dependency and endless popups ruining immersion."),
        ("home_comparison_purity_title", "fr", "KairoOS : La pureté arcade"),
        ("home_comparison_purity_title", "en", "KairoOS: Pure Arcade Experience"),
        ("home_comparison_purity_desc", "fr", "Lancement instantané en plein écran, masquage de l'OS, navigation tactile ou manette et ambiance sonore 60 FPS."),
        ("home_comparison_purity_desc", "en", "Instant fullscreen launch, OS shell hidden, gamepad-first navigation and 60 FPS audio-visual bliss."),

        # Home Kiosk & Final CTA
        ("home_kiosk_badge", "fr", "KIOSQUE FLUIDE MANETTE"),
        ("home_kiosk_badge", "en", "FLUID CONTROLLER KIOSK"),
        ("home_kiosk_title", "fr", "Rayonnage dynamique et jaquettes 3D"),
        ("home_kiosk_title", "en", "Dynamic shelves and 3D box art"),
        ("home_banner_title1", "fr", "Votre arcade."),
        ("home_banner_title1", "en", "Your arcade."),
        ("home_banner_title2", "fr", "Vos règles."),
        ("home_banner_title2", "en", "Your rules."),
        ("home_banner_desc", "fr", "Téléchargez la version Alpha v0.1.0 dès aujourd'hui ou contribuez au code source sur GitHub. Gratuit, libre et pensé pour le plaisir de jouer."),
        ("home_banner_desc", "en", "Download the v0.1.0 Alpha release today or contribute on GitHub. Free, open source and crafted for gamepad bliss."),

        # Themes Page
        ("themes_hero_badge", "fr", "PERSONNALISATION ÉDITORIALE"),
        ("themes_hero_badge", "en", "EDITORIAL CUSTOMIZATION"),
        ("themes_hero_title1", "fr", "Votre arcade."),
        ("themes_hero_title1", "en", "Your arcade."),
        ("themes_hero_title2", "fr", "Votre signature visuelle."),
        ("themes_hero_title2", "en", "Your visual signature."),
        ("themes_hero_desc", "fr", "KairoOS sépare strictement le moteur de jeu de ses palettes lumineuses. Choisissez une ambiance officielle, activez les scanlines CRT authentiques ou injectez vos propres shaders en direct."),
        ("themes_hero_desc", "en", "KairoOS strictly separates game execution from visual themes. Pick an official ambiance, activate authentic CRT scanlines or inject your own shaders in real time."),
        ("themes_crt_badge", "fr", "RENDU 15KHZ ÉMULATION"),
        ("themes_crt_badge", "en", "15KHZ EMULATION RENDERING"),
        ("themes_crt_title", "fr", "Shaders cathodiques authentiques."),
        ("themes_crt_title", "en", "Authentic CRT Shaders."),
        ("themes_crt_desc", "fr", "Recréez fidèlement le grain chaud des moniteurs Trinitron d'arcade, avec masque de fente et persistance phosphoreuse."),
        ("themes_crt_desc", "en", "Faithfully recreate the warm glow of Trinitron arcade monitors, with aperture grille and phosphor persistence."),

        # Plugins Page
        ("plugins_hero_badge", "fr", "RUNTIME MODULAIRE WASM & RUST"),
        ("plugins_hero_badge", "en", "MODULAR WASM & RUST RUNTIME"),
        ("plugins_hero_title1", "fr", "Infiniment extensible."),
        ("plugins_hero_title1", "en", "Infinitely extensible."),
        ("plugins_hero_title2", "fr", "Zéro compromis sur la vitesse."),
        ("plugins_hero_title2", "en", "Zero compromise on speed."),
        ("plugins_hero_desc", "fr", "KairoOS intègre une architecture de plugins isolés ultra-rapides. Éclairez votre borne avec des LEDs réactives, synchronisez vos sauvegardes et partagez vos succès sur Discord sans jamais ralentir vos parties."),
        ("plugins_hero_desc", "en", "KairoOS features an isolated, sub-millisecond plugin system. Enrich your arcade with dynamic LED strips, cloud backup sync and Discord presence without slowing down your games."),
        ("plugins_sdk_title", "fr", "API Native Rust & WebHID"),
        ("plugins_sdk_title", "en", "Native Rust & WebHID API"),
        ("plugins_sdk_desc", "fr", "Créez vos propres plugins en Rust ou WebAssembly avec notre kit de développement documenté."),
        ("plugins_sdk_desc", "en", "Build your own plugins in Rust or WebAssembly using our fully documented SDK."),

        # Roadmap Page
        ("roadmap_hero_badge", "fr", "FEUILLE DE ROUTE OFFICIELLE"),
        ("roadmap_hero_badge", "en", "OFFICIAL ROADMAP"),
        ("roadmap_hero_title1", "fr", "Construit en public."),
        ("roadmap_hero_title1", "en", "Built in public."),
        ("roadmap_hero_title2", "fr", "Inspiré par vos retours."),
        ("roadmap_hero_title2", "en", "Inspired by your feedback."),
        ("roadmap_hero_desc", "fr", "Suivez l'évolution officielle de KaïroOS, le frontend d'arcade et de salon open source sous Windows. De la version 0.1.0 Alpha jusqu'à l'image autonome et la vision multi-plateforme."),
        ("roadmap_hero_desc", "en", "Follow the official evolution of KaïroOS, the open source arcade and living room frontend for Windows. From v0.1.0 Alpha to standalone image and cross-platform vision."),
        ("roadmap_vision_title", "fr", "Vision Cross-Platform & Binaire Headless"),
        ("roadmap_vision_title", "en", "Cross-Platform Vision & Headless Binary"),
        ("roadmap_vision_desc", "fr", "Une modularité exemplaire pensée dès le départ pour le portage Linux, Steam Deck et des binaires serveurs ultra-légers."),
        ("roadmap_vision_desc", "en", "Exemplary modularity designed from day one for Linux, Steam Deck, and ultra-lightweight server binaries.")
    ]
    cursor.executemany("INSERT OR IGNORE INTO site_content_i18n (content_key, lang, content_value) VALUES (?, ?, ?)", content_seeds)

    # Seed Arcade Games (FR + EN)
    cursor.execute("SELECT COUNT(*) FROM arcade_games")
    if cursor.fetchone()[0] == 0:
        default_games = [
            ("Super Mario World", "Plateforme 16-bit", "1990", 
             "Super Mario World optimisé pour KaïroOS avec zéro input lag et rendu Direct3D 12 authentique.",
             "Super Mario World optimized for KaïroOS with zero input lag and native Direct3D 12 rendering.",
             "assets/img/games/mario.png", "assets/img/wallpapers/bg-mario.jpg", 1),
            ("Tekken 3", "Combat 3D Arcade", "1997",
             "Tekken 3 avec détection directe des contrôleurs arcade et framerate 60 FPS verrouillé.",
             "Tekken 3 with direct arcade stick polling and rock-solid 60 FPS framerate.",
             "assets/img/games/tekken3.png", "assets/img/wallpapers/bg-tekken.jpg", 2),
            ("Street Fighter II", "Combat Rétro", "1991",
             "Street Fighter II : The World Warrior. Shaders scanlines 15kHz Sony Trinitron appliqués en temps réel.",
             "Street Fighter II : The World Warrior. Real-time 15kHz Sony Trinitron scanlines applied.",
             "assets/img/games/streetfighter2.jpg", "assets/img/wallpapers/bg-streetfighter.jpg", 3),
            ("Tetris Grand Master", "Puzzle / Arcade", "1998",
             "Tetris The Grand Master avec affichage vertical TATE et scores persistants hors-ligne.",
             "Tetris The Grand Master with vertical TATE display and persistent offline leaderboards.",
             "assets/img/games/tetris.png", "assets/img/wallpapers/bg-tetris.jpg", 4),
            ("Snake Retro 97", "Arcade Classique", "1997",
             "Version arcade originale restaurée au pixel-près avec sonneries monophoniques authentiques.",
             "Original arcade version pixel-perfect restored with authentic monophonic beeps.",
             "assets/img/games/snake.jpg", "assets/img/wallpapers/bg-snake.jpg", 5),
            ("Metal Slug X", "Run and Gun", "1999",
             "Metal Slug X Super Vehicle-001. Mode deux joueurs en local instantané sans configuration.",
             "Metal Slug X Super Vehicle-001. Instant two-player local coop with zero setup.",
             "assets/img/games/metalslug.jpg", "assets/img/wallpapers/bg-metalslug.jpg", 6),
            ("Pac-Man Arcade", "Labyrinthe Rétro", "1980",
             "Le grand classique des salles d'arcade Namco avec émulation sonore stéréo d'époque.",
             "The Namco arcade classic with authentic retro stereo sound synthesis.",
             "assets/img/games/pacman.jpg", "assets/img/wallpapers/bg-mario.jpg", 7),
            ("Sonic The Hedgehog 2", "Vitesse & Plateforme", "1992",
             "Sonic The Hedgehog 2 avec rendu 16:9 étendu et support des manettes analogiques modernes.",
             "Sonic The Hedgehog 2 with widescreen viewport and modern analog gamepad support.",
             "assets/img/games/sonic2.png", "assets/img/wallpapers/bg-sonic.jpg", 8),
        ]
        cursor.executemany("INSERT INTO arcade_games (title, genre, year, desc_fr, desc_en, image, bg_image, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", default_games)

    # Seed FAQ Items (FR + EN)
    cursor.execute("SELECT COUNT(*) FROM faq_items")
    if cursor.fetchone()[0] == 0:
        default_faq = [
            ("KairoOS remplace-t-il Windows ou fonctionne-t-il par-dessus ?",
             "Does KairoOS replace Windows or run on top of it?",
             "KairoOS fonctionne en surcouche ultra-légère par-dessus Windows 10/11. Il masque l'explorateur et la barre des tâches au démarrage pour offrir une expérience borne d'arcade 100% dédiée, tout en conservant vos pilotes graphiques.",
             "KairoOS runs as an ultra-lightweight overlay on top of Windows 10/11. It hides the explorer shell and taskbar on boot to deliver a 100% dedicated arcade experience, while keeping your native GPU drivers.", 1),
            ("Puis-je l'utiliser avec des manettes Bluetooth ou des encodeurs USB d'arcade ?",
             "Can I use Bluetooth controllers or USB arcade encoders?",
             "Oui, KairoOS intègre un module DirectInput / XInput / WebHID universel. Les joysticks Sanwa, encodeurs Zero Delay, manettes Xbox, PlayStation et Switch sont reconnus instantanément sans configuration.",
             "Yes, KairoOS features a universal DirectInput / XInput / WebHID input driver. Sanwa joysticks, Zero Delay encoders, Xbox, PlayStation, and Switch gamepads are recognized instantly with zero configuration.", 2),
            ("Comment ajouter mes propres jeux et ROMs ?",
             "How do I add my own games and ROMs?",
             "Déposez simplement vos dossiers de jeux ou vos ROMs dans le répertoire C:\\KairoOS\\Games. KairoOS scanne automatiquement la bibliothèque et télécharge les jaquettes haute définition.",
             "Simply place your game folders or ROMs in C:\\KairoOS\\Games. KairoOS scans your library automatically and fetches high-definition box art in the background.", 3),
            ("Le logiciel est-il gratuit et open source ?",
             "Is KairoOS completely free & open source?",
             "Absolument. KairoOS est un projet communautaire distribué sous licence MIT. Le code source est public sur GitHub et chacun peut développer ses propres thèmes ou plugins sans frais.",
             "Absolutely. KairoOS is a community project distributed under the MIT license. The source code is public on GitHub and anyone can create their own themes and plugins for free.", 4)
        ]
        cursor.executemany("INSERT INTO faq_items (question_fr, question_en, answer_fr, answer_en, sort_order) VALUES (?, ?, ?, ?, ?)", default_faq)

    # Seed Showcase Plugins
    cursor.execute("SELECT COUNT(*) FROM showcase_plugins")
    if cursor.fetchone()[0] == 0:
        default_plugins = [
            ("Discord Rich Presence", "Diffusez votre session arcade en direct avec jaquette et scores.", "Stream your arcade session live to Discord with active game cover and high score.", "RÉSEAU", "OFFICIEL", "v1.2.0", "@KairoCore", "4 120 installs", 1),
            ("Illumination Dynamique WebHID", "Synchronise les rubans LED WS2812B et boutons d'arcade avec le jeu.", "Syncs cabinet WS2812B LEDs and arcade pushbuttons with active game colors.", "MATÉRIEL", "OFFICIEL", "v2.0.4", "@ArcadeMaker", "1 890 installs", 2),
            ("RetroAchievements Overlay", "Notifications sonores et visuelles de succès rétro sans latence.", "Real-time visual and audio retro achievement toasts without lag.", "INTERFACE", "COMMUNAUTÉ", "v0.9.8", "@CheevoHunter", "3 250 installs", 3),
            ("Sauvegardes P2P Décentralisées", "Synchronise les sauvegardes entre borne fixe et portable en local.", "Syncs game save states between arcade cabinet and laptop via local Wi-Fi.", "SYNC", "OFFICIEL", "v1.0.1", "@KairoCore", "980 installs", 4),
        ]
        cursor.executemany("INSERT INTO showcase_plugins (name, desc_fr, desc_en, category, badge, version, author, installs, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", default_plugins)

    # Seed Showcase Themes
    cursor.execute("SELECT COUNT(*) FROM showcase_themes")
    if cursor.fetchone()[0] == 0:
        default_themes = [
            ("Tokyo Cyber Arcade", "Inspiré d'Akihabara avec scanlines fines et ambiance néon magenta.", "Inspired by Akihabara arcade parlors with fine scanlines and magenta neon glow.", "NÉON CRT", "★ 4.9", "@kenji_arcade", "1 240 installs", "cyber", 1),
            ("Atelier Minimaliste", "Zéro distraction. Contraste infini pour écrans OLED et téléviseurs 4K.", "Zero distraction. Infinite contrast crafted for OLED screens and 4K TVs.", "MONOCHROME", "★ 4.8", "@lucas_design", "890 installs", "minimal", 2),
            ("Phosphore Ambre 1982", "Rendu authentique des premiers terminaux informatiques VT220.", "Authentic monochrome amber phosphor glow inspired by 1982 VT220 terminals.", "AMBER CRT", "★ 5.0", "@retro_vault", "640 installs", "amber", 3)
        ]
        cursor.executemany("INSERT INTO showcase_themes (name, desc_fr, desc_en, badge, rating, author, installs, preview_class, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", default_themes)

    # Seed Official Roadmap Milestones (Strictly matching docs/ROADMAP.md)
    official_milestones = [
        ("v0.1.0 Alpha", "v0.1.0 Alpha — Fondations & Architecture", "v0.1.0 Alpha — Foundations & Architecture",
         "Core Rust autonome (kairo-core SQLite, scanner multi-consoles SNES/N64/GC/Wii/Switch/PS1/PS2/PS3/Arcade, superviseur PID, AppPaths), UI React 19 + Tauri 2 100% manette, 3 thèmes CSS (kairo-default, kairo-hub, kairo-console), PWA kairo-remote et compilation propre.",
         "Autonomous Rust Core (SQLite kairo.db, multi-console scanner SNES/N64/GC/Wii/Switch/PS1/PS2/PS3/Arcade, PID supervisor, AppPaths), React 19 + Tauri 2 100% gamepad UI, 3 CSS themes, kairo-remote PWA and clean builds.",
         "T1 2026", 100, "LIVRÉ", 1),
        ("v0.2.0 Bêta", "v0.2.0 Bêta — Enrichissement Multimédia & UX", "v0.2.0 Beta — Media & UX Polish",
         "Scraping automatique ScreenScraper (jaquettes 2D/3D, logos Wheel, résumés, trailers vidéo 30s), gestion multi-disques (.m3u + swap manette), overlay en jeu (save/load states, remap boutons).",
         "ScreenScraper auto-scraping (2D/3D box art, wheel logos, 30s video trailers), multi-disc support (.m3u + in-game disc swap), in-game overlay (save/load states, remap).",
         "T2 2026", 65, "EN COURS", 2),
        ("v0.3.0", "v0.3.0 — Communauté, Succès & Cloud", "v0.3.0 — Community, Achievements & Cloud",
         "Intégration RetroAchievements (toasts visuels & carillons sonores arcade), Cloud Save Sync (Google Drive, OneDrive, Nextcloud/WebDAV), suivi du temps de jeu et statistiques de complétion.",
         "RetroAchievements integration (visual toasts & sound beeps), Cloud Save Sync (Google Drive, OneDrive, Nextcloud/WebDAV), playtime tracking and completion stats.",
         "T3 2026", 25, "PLANIFIÉ", 3),
        ("v1.0.0", "v1.0.0 — Écosystème & Extensibilité", "v1.0.0 — Ecosystem & Extensibility",
         "Store de plugins WASM/Rust, mode kiosque ultra-sécurisé pour expositions publiques (verrouillage touches système, minuterie pièces virtuelles), localisation multilingue intégrale (FR/EN/ES/JA).",
         "WASM/Rust plugin store, ultra-secure kiosk mode for public arcade exhibitions (system key locks, coin timer), full multilingual localization.",
         "Fin 2026", 10, "FUTUR", 4),
        ("Cross-Platform", "Vision Cross-Platform & Binaire Headless", "Cross-Platform Vision & Headless Binary",
         "Matrice de faisabilité multi-plateformes (Windows 10/10, Linux 7.5/10, Steam Deck 8/10, macOS 7/10, Android 4/10), portage natif Steam Deck (gamescope 60/90Hz) et binaire console headless kairo-cli.",
         "Cross-platform feasibility matrix (Windows 10/10, Linux 7.5/10, Steam Deck 8/10, macOS 7/10, Android 4/10), native Steam Deck port (gamescope 60/90Hz) and headless console binary kairo-cli.",
         "2027", 5, "RECHERCHE", 5)
    ]

    cursor.execute("SELECT COUNT(*) FROM roadmap_milestones")
    count_m = cursor.fetchone()[0]
    if count_m == 0:
        cursor.executemany("INSERT INTO roadmap_milestones (version, title_fr, title_en, desc_fr, desc_en, date_text, progress_percent, status_badge, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", official_milestones)
    else:
        # Check if first milestone is old template and update to official
        cursor.execute("SELECT title_fr FROM roadmap_milestones WHERE id = 1")
        row = cursor.fetchone()
        if row and 'Couche Arcade' in row[0]:
            cursor.execute("DELETE FROM roadmap_milestones")
            cursor.executemany("INSERT INTO roadmap_milestones (version, title_fr, title_en, desc_fr, desc_en, date_text, progress_percent, status_badge, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", official_milestones)

    # Seed Upcoming Voting Features from Official Roadmap (compteurs à 0 en production)
    cursor.execute("SELECT COUNT(*) FROM roadmap_features")
    if cursor.fetchone()[0] == 0:
        official_features = [
            ("ScreenScraper & Vidéos 30s", "ScreenScraper & 30s Videos",
             "Scraping automatique complet (jaquettes 2D/3D, logos Wheel, résumés et trailers vidéo 30s) avec mise en cache locale.",
             "Full automated scraping (2D/3D box art, wheel logos, synopses, and 30s video trailers) with local caching.",
             "UX / MÉDIA", 0, 1),
            ("Overlay En Jeu & Remap Manette", "In-Game Overlay & Gamepad Remap",
             "Menu pause transparent superposé en jeu pour sauvegardes rapides (Save/Load States) et remappage des boutons à la volée.",
             "In-game transparent pause menu for instant Save/Load States and live controller button remapping.",
             "GAMEPLAY", 0, 2),
            ("Gestion Multi-Disques (.m3u)", "Multi-Disc Support (.m3u)",
             "Détection et regroupement automatique des jeux multi-CD (PlayStation, Saturn, Sega CD) avec swap de disque virtuel à la manette.",
             "Automatic grouping of multi-CD games (PS1, Saturn, Sega CD) with virtual in-game disc swap via gamepad.",
             "MOTEUR", 0, 3),
            ("Intégration RetroAchievements", "RetroAchievements Integration",
             "Déblocage des succès en direct avec badges visuels et carillons sonores arcade lors des prouesses en jeu.",
             "Real-time retro achievement unlocks with visual toasts and authentic arcade sound chimes.",
             "COMMUNAUTÉ", 0, 4),
            ("Synchronisation Cloud Saves", "Cloud Save Sync",
             "Synchronisation transparente des sauvegardes via Google Drive, OneDrive et Nextcloud/WebDAV.",
             "Seamless save state sync across devices using Google Drive, OneDrive, and Nextcloud/WebDAV.",
             "CLOUD", 0, 5),
            ("Portage Linux & Steam Deck", "Linux & Steam Deck Port",
             "Adaptation native pour Steam Deck (SteamOS) et distributions Linux avec session gamescope 60/90Hz.",
             "Native port for Steam Deck (SteamOS) and Linux distributions with dedicated gamescope 60/90Hz session.",
             "SYSTÈME", 0, 6),
            ("Binaire Headless (kairo-cli)", "Headless Binary (kairo-cli)",
             "Mode console / serveur headless ultra-léger sans interface graphique pour administration et scripts distants.",
             "Ultra-lightweight headless CLI binary without Webview GUI for remote administration and scripting.",
             "ARCHITECTURE", 0, 7),
            ("Kiosque Ultra-Sécurisé (Mode Salon/Expo)", "Ultra-Secure Kiosk Mode (Expo)",
             "Verrouillage total des touches Windows, pièces virtuelles / minuterie et isolation pour expositions publiques.",
             "Complete Windows hotkey lockdown, virtual coin timer, and sandbox isolation for public arcade exhibitions.",
             "ARCADE PRO", 0, 8),
        ]
        cursor.executemany("INSERT INTO roadmap_features (title_fr, title_en, desc_fr, desc_en, tag, votes_count, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)", official_features)

    # Pas de fausses propositions / suggestions en production : tables vides au départ.
    # Les vraies demandes arriveront via le site public.

    conn.commit()
    conn.close()

init_db()

class KairoRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def get_client_ip(self):
        xff = self.headers.get('X-Forwarded-For', '')
        if xff:
            return xff.split(',')[0].strip()
        xri = self.headers.get('X-Real-IP', '')
        if xri:
            return xri.strip()
        return self.client_address[0] if (self.client_address and len(self.client_address) > 0) else '127.0.0.1'

    def verify_token(self, required_permission=None):
        auth = self.headers.get('Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        if not token:
            return False
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role, permissions FROM admin_users WHERE token = ?", (token,))
        user = cursor.fetchone()
        conn.close()
        if not user:
            return False

        if required_permission:
            try:
                perms = json.loads(user['permissions']) if user['permissions'] else ["all"]
            except Exception:
                perms = ["all"]
            if "all" not in perms and required_permission not in perms:
                return False

        return True

    def get_token_user(self):
        auth = self.headers.get('Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        if not token:
            return None
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role, permissions FROM admin_users WHERE token = ?", (token,))
        user = cursor.fetchone()
        conn.close()
        if not user:
            return None
        d = dict(user)
        try:
            d['permissions'] = json.loads(d['permissions']) if d['permissions'] else ["all"]
        except Exception:
            d['permissions'] = ["all"]
        return d

    def is_ip_completely_banned(self, client_ip):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM banned_ips WHERE ip_address = ?", (client_ip,))
        ban = cursor.fetchone()
        if not ban:
            conn.close()
            return False, None
        ban_dict = dict(ban)
        if ban_dict.get('ban_type') == 'temp' and ban_dict.get('expires_at'):
            try:
                from datetime import datetime, timezone
                exp_str = ban_dict['expires_at'].replace('Z', '+00:00')
                exp_dt = datetime.fromisoformat(exp_str)
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                now = datetime.now(timezone.utc)
                if now >= exp_dt:
                    cursor.execute("DELETE FROM banned_ips WHERE id = ?", (ban_dict['id'],))
                    conn.commit()
                    conn.close()
                    return False, None
            except Exception:
                pass
        conn.close()
        if ban_dict.get('block_all') == 1:
            return True, ban_dict
        return False, None

    def check_admin_ip_allowed(self, client_ip):
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

    def serve_banned_page(self, ban_info):
        reason = ban_info.get('reason') or "Infraction aux conditions d'utilisation."
        expires = ban_info.get('expires_at') or 'Bannissement permanent'
        client_ip = self.get_client_ip()
        html = '''<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>403 - Accès Refusé | KairoOS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4 font-sans">
  <div class="max-w-md w-full bg-slate-900 border border-rose-900/50 rounded-3xl p-8 text-center shadow-2xl space-y-5">
    <div class="w-16 h-16 rounded-2xl bg-rose-950/80 text-rose-500 flex items-center justify-center mx-auto text-3xl font-bold border border-rose-800">
      🚫
    </div>
    <div>
      <h1 class="text-2xl font-bold text-white tracking-tight">Accès Totalement Interdit</h1>
      <p class="text-xs text-rose-400 font-mono mt-1">Vous avez été sanctionné par l'administration</p>
    </div>
    <div class="bg-slate-950/80 rounded-2xl p-4 text-xs font-mono text-left border border-slate-800 space-y-2">
      <div class="text-slate-400">Adresse IP : <span class="text-white font-bold">{{CLIENT_IP}}</span></div>
      <div class="text-slate-400">Motif : <span class="text-rose-400 font-sans">{{REASON}}</span></div>
      <div class="text-slate-400">Expiration : <span class="text-amber-400">{{EXPIRES}}</span></div>
    </div>
    <p class="text-xs text-slate-400 leading-relaxed">
      L'accès à l'ensemble du site web et à ses services a été bloqué pour votre adresse IP.
    </p>

    <!-- FORMULAIRE DE RECOURS / OPPOSITION DIRECTE AU BANNISSEMENT -->
    <div class="border-t border-slate-800 pt-4 text-left space-y-3">
      <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
        <span>⚖️ S'opposer au ban / Faire une réclamation</span>
      </h3>
      <form id="appeal-form" class="space-y-2.5">
        <input type="email" id="appeal-email" placeholder="Votre email de contact (facultatif)" class="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500">
        <textarea id="appeal-message" rows="3" required placeholder="Expliquez pourquoi vous contestez cette sanction..." class="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"></textarea>
        <button type="submit" id="btn-submit-appeal" class="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg cursor-pointer transition-colors">
          Envoyer mon recours à l'administrateur
        </button>
        <div id="appeal-feedback" class="hidden p-3 rounded-xl text-xs font-mono text-center"></div>
      </form>
    </div>
  </div>

  <script>
    document.getElementById('appeal-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('appeal-email').value.trim();
      const msg = document.getElementById('appeal-message').value.trim();
      const fb = document.getElementById('appeal-feedback');
      const btn = document.getElementById('btn-submit-appeal');
      btn.disabled = true;
      btn.textContent = 'Envoi du recours...';

      fetch('/api/ban/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, message: msg })
      })
      .then(r => r.json())
      .then(res => {
        fb.classList.remove('hidden');
        if (res.status === 'ok') {
          fb.className = 'p-3 rounded-xl text-xs font-mono bg-emerald-950/60 border border-emerald-800 text-emerald-300';
          fb.textContent = '✓ ' + res.message;
          btn.classList.add('hidden');
        } else {
          fb.className = 'p-3 rounded-xl text-xs font-mono bg-rose-950/60 border border-rose-800 text-rose-300';
          fb.textContent = 'Erreur : ' + (res.message || 'Échec de l\\'envoi');
          btn.disabled = false;
          btn.textContent = 'Réessayer';
        }
      })
      .catch(() => {
        fb.classList.remove('hidden');
        fb.className = 'p-3 rounded-xl text-xs font-mono bg-rose-950/60 border border-rose-800 text-rose-300';
        fb.textContent = 'Erreur réseau de communication.';
        btn.disabled = false;
        btn.textContent = 'Réessayer';
      });
    });
  </script>
</body>
</html>'''.replace('{{CLIENT_IP}}', client_ip).replace('{{REASON}}', reason).replace('{{EXPIRES}}', expires)
        body = html.encode('utf-8')
        self.send_response(403)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def apply_automatic_security_sanction(self, client_ip, reason, context_title):
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
            """, (client_ip, self.headers.get('User-Agent', 'Unknown')))

            conn.commit()
            conn.close()
        except Exception as e:
            print("Erreur apply_automatic_security_sanction:", e)

    def serve_admin_forbidden_page(self, client_ip):
        html = f'''<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>403 - Administration Restreinte | KairoOS</title>
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
</html>'''
        body = html.encode('utf-8')
        self.send_response(403)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def check_ip_ban(self, action_type='all'):
        """
        action_type: 'vote', 'proposal', 'suggestion', or 'all'
        returns: (is_banned: bool, ban_info: dict or None)
        """
        client_ip = self.get_client_ip()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM banned_ips WHERE ip_address = ?", (client_ip,))
        ban = cursor.fetchone()
        if not ban:
            conn.close()
            return False, None

        ban_dict = dict(ban)
        # Check temporary ban expiration
        if ban_dict.get('ban_type') == 'temp' and ban_dict.get('expires_at'):
            try:
                from datetime import datetime, timezone
                exp_str = ban_dict['expires_at'].replace('Z', '+00:00')
                exp_dt = datetime.fromisoformat(exp_str)
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                now = datetime.now(timezone.utc)
                if now >= exp_dt:
                    # Expired ban -> cleanup
                    cursor.execute("DELETE FROM banned_ips WHERE id = ?", (ban_dict['id'],))
                    conn.commit()
                    conn.close()
                    return False, None
            except Exception as e:
                pass

        # Check action restrictions
        is_blocked = False
        if ban_dict.get('block_all') == 1:
            is_blocked = True
        elif action_type == 'vote' and ban_dict.get('block_vote') == 1:
            is_blocked = True
        elif action_type == 'proposal' and ban_dict.get('block_proposal') == 1:
            is_blocked = True
        elif action_type == 'suggestion' and ban_dict.get('block_suggestion') == 1:
            is_blocked = True

        conn.close()
        if is_blocked:
            return True, ban_dict
        return False, None

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

    def serve_html_file(self, rel_path, lang='fr'):
        full_path = os.path.join(BASE_DIR, rel_path.replace('/', os.sep))
        if not os.path.exists(full_path) or not os.path.isfile(full_path):
            self.send_error(404, f"Page non trouvée: {rel_path}")
            return

        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                html = f.read()
        except Exception as e:
            self.send_error(500, f"Erreur lecture fichier: {e}")
            return

        # Inject <base href="/"> if not present to ensure all relative assets (images, css, js) resolve cleanly
        if '<head>' in html and '<base href="/"' not in html:
            html = html.replace('<head>', '<head>\n  <base href="/">', 1)

        # Update html lang attribute if present
        import re
        html = re.sub(r'<html([^>]*)lang="[a-zA-Z\-]+"', rf'<html\1lang="{lang}"', html, count=1)

        encoded = html.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(encoded)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        parsed = urlparse(self.path)
        raw_path = parsed.path
        if raw_path != '/' and raw_path.endswith('/'):
            raw_path = raw_path[:-1]
        query = parse_qs(parsed.query)

        client_ip = self.get_client_ip()

        # ROUTE PUBLIQUE STATUT SANCTION (Accessible même si banni)
        if raw_path == '/api/user/ban-status':
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM banned_ips WHERE ip_address = ?", (client_ip,))
            ban_row = cursor.fetchone()
            conn.close()
            if not ban_row:
                return self.send_json({"is_banned": False, "ip": client_ip})
            b = dict(ban_row)
            # Check expiration
            if b.get('ban_type') == 'temp' and b.get('expires_at'):
                try:
                    exp_dt = datetime.fromisoformat(b['expires_at'].replace('Z', '+00:00'))
                    if exp_dt.tzinfo is None:
                        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) >= exp_dt:
                        return self.send_json({"is_banned": False, "ip": client_ip})
                except Exception:
                    pass
            return self.send_json({
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

        # CONTRÔLE 1 : Bannissement Total du Site Web (Blacklist Complète)
        is_fully_banned, ban_info = self.is_ip_completely_banned(client_ip)
        if is_fully_banned:
            if raw_path == '/api/ban/appeal':
                pass
            elif raw_path.startswith('/api/'):
                return self.send_json({"status": "error", "message": "Accès interdit : votre adresse IP est bannie de la plateforme.", "ban": ban_info}, status=403)
            else:
                return self.serve_banned_page(ban_info)

        # CONTRÔLE 2 : Restriction d'Accès IP à l'Administration avec Sanction Automatique
        if raw_path.startswith('/admin') or raw_path in ('/pages/admin.html', '/admin.html') or raw_path.startswith('/api/admin/'):
            if not self.check_admin_ip_allowed(client_ip):
                reason = f"Sanction de sécurité : Tentative d'accès non autorisée au panneau d'administration ({raw_path}) depuis l'adresse IP {client_ip}."
                self.apply_automatic_security_sanction(client_ip, reason, f"🚨 Accès admin interdit : {client_ip}")
                if raw_path.startswith('/api/'):
                    return self.send_json({
                        "status": "error",
                        "message": "Tentative de connexion non autorisée signalée. Vos accès aux votes et à la boîte à idées ont été automatiquement suspendus."
                    }, status=403)
                return self.serve_admin_forbidden_page(client_ip)

        # 1. API ROUTES
        if raw_path == '/api/content':
            lang = query.get('lang', ['fr'])[0]
            conn = get_db()
            cursor = conn.cursor()

            # Content i18n
            cursor.execute("SELECT content_key, content_value FROM site_content_i18n WHERE lang = ?", (lang,))
            content = {row['content_key']: row['content_value'] for row in cursor.fetchall()}

            # Games
            cursor.execute("SELECT id, title, genre, year, desc_fr, desc_en, image, bg_image, sort_order FROM arcade_games ORDER BY sort_order ASC")
            games_raw = cursor.fetchall()
            games = []
            for r in games_raw:
                g = dict(r)
                g['desc'] = g['desc_' + lang] if ('desc_' + lang) in g else (g['desc_fr'] or '')
                games.append(g)

            # FAQ
            cursor.execute("SELECT id, question_fr, question_en, answer_fr, answer_en, sort_order FROM faq_items ORDER BY sort_order ASC")
            faq_raw = cursor.fetchall()
            faq = []
            for r in faq_raw:
                f = dict(r)
                f['question'] = f['question_' + lang] if ('question_' + lang) in f else f['question_fr']
                f['answer'] = f['answer_' + lang] if ('answer_' + lang) in f else f['answer_fr']
                faq.append(f)

            # Showcase Plugins
            cursor.execute("SELECT id, name, desc_fr, desc_en, category, badge, version, author, installs, sort_order FROM showcase_plugins ORDER BY sort_order ASC")
            plugins_raw = cursor.fetchall()
            plugins = []
            for r in plugins_raw:
                p = dict(r)
                p['desc'] = p['desc_' + lang] if ('desc_' + lang) in p else p['desc_fr']
                plugins.append(p)

            # Showcase Themes
            cursor.execute("SELECT id, name, desc_fr, desc_en, badge, rating, author, installs, preview_class, sort_order FROM showcase_themes ORDER BY sort_order ASC")
            themes_raw = cursor.fetchall()
            themes = []
            for r in themes_raw:
                t = dict(r)
                t['desc'] = t['desc_' + lang] if ('desc_' + lang) in t else t['desc_fr']
                themes.append(t)

            # Milestones
            cursor.execute("SELECT id, version, title_fr, title_en, desc_fr, desc_en, date_text, progress_percent, status_badge, sort_order FROM roadmap_milestones ORDER BY sort_order ASC")
            milestones_raw = cursor.fetchall()
            milestones = []
            for r in milestones_raw:
                m = dict(r)
                m['title'] = m['title_' + lang] if ('title_' + lang) in m else m['title_fr']
                m['desc'] = m['desc_' + lang] if ('desc_' + lang) in m else m['desc_fr']
                milestones.append(m)

            conn.close()
            return self.send_json({
                "status": "ok",
                "lang": lang,
                "content": content,
                "games": games,
                "faq": faq,
                "plugins": plugins,
                "themes": themes,
                "milestones": milestones
            })

        elif raw_path == '/api/content/all':
            # For admin editing: returns raw bilingual content
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
            return self.send_json({
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

        elif raw_path == '/api/roadmap/features':
            client_ip = self.get_client_ip()
            conn = get_db()
            cursor = conn.cursor()
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
            return self.send_json({
                "status": "ok",
                "client_ip": client_ip,
                "features": features
            })

        elif raw_path == '/api/roadmap/proposals':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM community_proposals ORDER BY id DESC")
            proposals = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return self.send_json({
                "status": "ok",
                "proposals": proposals
            })

        elif raw_path == '/api/roadmap/suggestions':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT fs.*, f.title_fr as feature_title, f.tag as feature_tag
                FROM feature_suggestions fs
                LEFT JOIN roadmap_features f ON fs.feature_id = f.id
                ORDER BY fs.id DESC
            """)
            suggestions = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return self.send_json({
                "status": "ok",
                "suggestions": suggestions
            })

        elif raw_path == '/api/roadmap/votes':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT v.id, v.feature_id, f.title_fr, f.title_en, f.tag, v.ip_address, v.user_agent, v.created_at
                FROM roadmap_votes v
                LEFT JOIN roadmap_features f ON v.feature_id = f.id
                ORDER BY v.created_at DESC
                LIMIT 300
            """)
            votes = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return self.send_json({
                "status": "ok",
                "votes": votes
            })

        elif raw_path == '/api/roadmap/github-spec':
            doc_path = os.path.join(BASE_DIR, 'docs', 'ROADMAP.md')
            md_content = ""
            if os.path.exists(doc_path):
                try:
                    with open(doc_path, 'r', encoding='utf-8') as f:
                        md_content = f.read()
                except Exception as e:
                    md_content = f"# Erreur de lecture: {e}"
            return self.send_json({
                "status": "ok",
                "markdown": md_content,
                "github_url": "https://github.com/KairoOS-Official/KairoOS/blob/main/docs/ROADMAP.md"
            })

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

            total_views = views_row['total_views']
            conv_rate = round((dl_clicks / total_views * 100), 1) if total_views > 0 else 0.0

            conn.close()
            return self.send_json({
                "total_views": total_views,
                "unique_visitors": views_row['unique_visitors'],
                "download_clicks": dl_clicks,
                "total_clicks": total_clicks,
                "conversion_rate": conv_rate,
                "top_clicks": top_clicks,
                "recent_events": recent_events
            })

        elif raw_path == '/api/auth/check':
            is_valid = self.verify_token()
            return self.send_json({"authenticated": is_valid})

        elif raw_path == '/api/admin/users':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            conn = get_db()
            cursor = conn.cursor()

            # Collect distinct IPs across all activity tables
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
                # Views & events count
                cursor.execute("SELECT COUNT(*) as c FROM page_views WHERE ip_address = ?", (ip,))
                v_count = cursor.fetchone()['c']

                cursor.execute("SELECT COUNT(*) as c FROM analytics_events WHERE ip_address = ?", (ip,))
                e_count = cursor.fetchone()['c']

                # Votes count
                cursor.execute("SELECT COUNT(*) as c FROM roadmap_votes WHERE ip_address = ?", (ip,))
                votes_c = cursor.fetchone()['c']

                # Proposals count
                cursor.execute("SELECT COUNT(*) as c FROM community_proposals WHERE ip_address = ?", (ip,))
                props_c = cursor.fetchone()['c']

                # Suggestions count
                cursor.execute("SELECT COUNT(*) as c FROM feature_suggestions WHERE ip_address = ?", (ip,))
                sugs_c = cursor.fetchone()['c']

                # Last seen timestamp
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

                # Nickname or email if available
                cursor.execute("SELECT author, email FROM community_proposals WHERE ip_address = ? ORDER BY id DESC LIMIT 1", (ip,))
                prop_info = cursor.fetchone()
                nickname = prop_info['author'] if prop_info and prop_info['author'] != 'Anonyme' else None
                email = prop_info['email'] if prop_info else None

                if not nickname:
                    cursor.execute("SELECT author FROM feature_suggestions WHERE ip_address = ? ORDER BY id DESC LIMIT 1", (ip,))
                    sug_info = cursor.fetchone()
                    if sug_info and sug_info['author'] != 'Anonyme':
                        nickname = sug_info['author']

                # Ban status
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

            # Sort by activity/last_seen descending
            users.sort(key=lambda u: (u['last_seen'] or '', u['total_connections']), reverse=True)
            conn.close()
            return self.send_json({"status": "ok", "users": users, "total": len(users)})

        elif raw_path == '/api/admin/users/detail':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            target_ip = query.get('ip', [''])[0].strip()
            if not target_ip:
                return self.send_json({"status": "error", "message": "IP requise"}, status=400)

            conn = get_db()
            cursor = conn.cursor()

            # Ban status
            cursor.execute("SELECT * FROM banned_ips WHERE ip_address = ?", (target_ip,))
            ban_row = cursor.fetchone()
            ban = dict(ban_row) if ban_row else None

            # Votes details
            cursor.execute("""
                SELECT v.id, v.feature_id, v.created_at, v.user_agent, f.title_fr, f.title_en, f.tag
                FROM roadmap_votes v
                LEFT JOIN roadmap_features f ON v.feature_id = f.id
                WHERE v.ip_address = ?
                ORDER BY v.id DESC
            """, (target_ip,))
            votes = [dict(r) for r in cursor.fetchall()]

            # Proposals details
            cursor.execute("""
                SELECT id, title, category, description, author, email, status, created_at
                FROM community_proposals
                WHERE ip_address = ?
                ORDER BY id DESC
            """, (target_ip,))
            proposals = [dict(r) for r in cursor.fetchall()]

            # Suggestions details
            cursor.execute("""
                SELECT s.id, s.feature_id, s.author, s.email, s.suggestion_text, s.status, s.created_at, f.title_fr, f.tag
                FROM feature_suggestions s
                LEFT JOIN roadmap_features f ON s.feature_id = f.id
                WHERE s.ip_address = ?
                ORDER BY s.id DESC
            """, (target_ip,))
            suggestions = [dict(r) for r in cursor.fetchall()]

            # Recent page views & events
            cursor.execute("SELECT page, referrer, created_at FROM page_views WHERE ip_address = ? ORDER BY id DESC LIMIT 15", (target_ip,))
            views = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT event_type, target, page, created_at FROM analytics_events WHERE ip_address = ? ORDER BY id DESC LIMIT 15", (target_ip,))
            events = [dict(r) for r in cursor.fetchall()]

            conn.close()
            return self.send_json({
                "status": "ok",
                "ip": target_ip,
                "ban": ban,
                "votes": votes,
                "proposals": proposals,
                "suggestions": suggestions,
                "recent_views": views,
                "recent_events": events
            })

        elif raw_path == '/api/admin/features/votes':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            fid = query.get('feature_id', [''])[0].strip()
            if not fid:
                return self.send_json({"status": "error", "message": "ID requis"}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id, title_fr, title_en, tag, votes_count FROM roadmap_features WHERE id = ?", (fid,))
            feature_row = cursor.fetchone()
            if not feature_row:
                conn.close()
                return self.send_json({"status": "error", "message": "Fonctionnalité introuvable"}, status=404)

            feature = dict(feature_row)

            # Get all votes for this feature with IP ban info
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

            return self.send_json({
                "status": "ok",
                "feature": feature,
                "votes": votes,
                "total_votes": len(votes)
            })

        elif raw_path == '/api/admin/appeals':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ban_appeals ORDER BY id DESC")
            appeals = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return self.send_json({"status": "ok", "appeals": appeals})

        elif raw_path == '/api/admin/security/config':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT access_mode, allowed_ips FROM admin_security_config WHERE id = 1")
            row = cursor.fetchone()
            conn.close()
            return self.send_json({
                "status": "ok",
                "access_mode": row['access_mode'] if row else 'all',
                "allowed_ips": row['allowed_ips'] if row else '127.0.0.1,::1',
                "client_ip": self.get_client_ip()
            })

        elif raw_path == '/api/admin/admins':
            if not self.verify_token('settings'):
                return self.send_json({"status": "unauthorized"}, status=401)
            conn = get_db()
            cursor = conn.cursor()
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
            return self.send_json({"status": "ok", "admins": admins})

        elif raw_path == '/api/admin/audit-logs':
            if not self.verify_token('settings'):
                return self.send_json({"status": "unauthorized"}, status=401)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM admin_login_logs ORDER BY id DESC LIMIT 150")
            logs = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return self.send_json({"status": "ok", "logs": logs})

        elif raw_path == '/api/admin/notifications':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM security_notifications ORDER BY id DESC LIMIT 50")
            notifs = [dict(r) for r in cursor.fetchall()]
            cursor.execute("SELECT COUNT(*) FROM security_notifications WHERE is_read = 0")
            unread_count = cursor.fetchone()[0]
            conn.close()
            return self.send_json({"status": "ok", "notifications": notifs, "unread_count": unread_count})

        elif raw_path == '/api/admin/bans':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM banned_ips ORDER BY id DESC")
            bans = [dict(r) for r in cursor.fetchall()]

            # Collect all known visitor IPs for quick administration
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
            return self.send_json({"status": "ok", "bans": bans, "known_ips": known_ips})

        # 2. STATIC ASSET REQUESTS (handles /assets/..., /fr/assets/..., /en/assets/...)
        if '/assets/' in parsed.path:
            asset_idx = parsed.path.find('/assets/')
            clean_asset_path = parsed.path[asset_idx:]
            self.path = clean_asset_path + ('?' + parsed.query if parsed.query else '')
            super().do_GET()
            return

        # 3. FAVICON & SYSTEM FILES
        if raw_path in ('/favicon.ico', '/robots.txt'):
            self.send_response(204)
            self.end_headers()
            return

        # 4. MULTILINGUAL & VIRTUAL PAGE ROUTING
        clean = raw_path.strip('/')
        parts = [p for p in clean.split('/') if p]

        lang = 'fr'
        page = ''
        if len(parts) > 0 and parts[0] in ('fr', 'en'):
            lang = parts[0]
            page = parts[1] if len(parts) > 1 else ''
        else:
            page = parts[0] if len(parts) > 0 else ''

        if page in ('', 'index.html', 'home'):
            return self.serve_html_file('index.html', lang)
        elif page in ('themes', 'themes.html'):
            return self.serve_html_file('themes/index.html', lang)
        elif page in ('plugins', 'plugins.html'):
            return self.serve_html_file('plugins/index.html', lang)
        elif page in ('roadmap', 'roadmap.html'):
            return self.serve_html_file('roadmap/index.html', lang)
        elif page in ('admin', 'admin.html'):
            return self.serve_html_file('admin/index.html', lang)

        # 5. FALLBACK TO DIRECT FILE LOOKUP
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

        # RECOURS CONTRE UN BANNISSEMENT (Accessible même si banni)
        if path == '/api/ban/appeal':
            email = payload.get('email', '').strip()
            message = payload.get('message', '').strip()
            if not message:
                return self.send_json({"status": "error", "message": "Veuillez rédiger un message d'explication pour votre recours."}, status=400)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("INSERT INTO ban_appeals (ip_address, email, message) VALUES (?, ?, ?)",
                           (client_ip, email, message))
            conn.commit()
            conn.close()
            return self.send_json({
                "status": "ok",
                "message": "Votre recours a bien été transmis aux administrateurs. Il sera examiné prochainement."
            })

        # CONTRÔLE 1 : Bannissement Total du Site Web (Blacklist Complète)
        is_fully_banned, ban_info = self.is_ip_completely_banned(client_ip)
        if is_fully_banned:
            return self.send_json({"status": "error", "message": "Accès interdit : votre adresse IP est bannie de l'ensemble de la plateforme."}, status=403)

        # CONTRÔLE 2 : Restriction d'Accès IP à l'Administration avec Sanction Automatique
        if path == '/api/auth/login' or path.startswith('/api/admin/'):
            if not self.check_admin_ip_allowed(client_ip):
                reason = f"Sanction de sécurité : Tentative de connexion non autorisée (POST {path}) depuis l'adresse IP {client_ip}."
                self.apply_automatic_security_sanction(client_ip, reason, f"🚨 Tentative d'intrusion admin : {client_ip}")
                return self.send_json({
                    "status": "error",
                    "message": "Tentative de connexion non autorisée signalée aux administrateurs. Votre adresse IP a été automatiquement sanctionnée : la Boîte à Idées et les votes vous ont été révoqués."
                }, status=403)

        # 1. PUBLIC TRACKING ROUTE (AVEC IP RÉELLE POUR VISITEURS)
        if path == '/api/track':
            client_ip = self.get_client_ip()
            event_type = payload.get('event_type', 'click')
            target = payload.get('target', 'unknown')
            page = payload.get('page', '/')
            session_id = payload.get('session_id', 'anon')
            meta_json = json.dumps(payload.get('meta', {}))

            conn = get_db()
            cursor = conn.cursor()
            if event_type == 'page_view':
                referrer = payload.get('referrer', '')
                cursor.execute("INSERT INTO page_views (page, session_id, referrer, ip_address) VALUES (?, ?, ?, ?)",
                               (page, session_id, referrer, client_ip))
            else:
                cursor.execute("INSERT INTO analytics_events (event_type, target, page, session_id, meta_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
                               (event_type, target, page, session_id, meta_json, client_ip))
            conn.commit()
            conn.close()
            return self.send_json({"status": "tracked"})

        # 2. AUTHENTICATION LOGIN AVEC SANCTION AUTOMATIQUE (3 ÉCHECS) & MULTI-COMPTES
        elif path == '/api/auth/login':
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
                # Réinitialiser le compteur d'échecs
                if client_ip in FAILED_LOGINS:
                    del FAILED_LOGINS[client_ip]

                token = secrets.token_hex(24)
                cursor.execute("""
                    UPDATE admin_users 
                    SET token = ?, last_login = CURRENT_TIMESTAMP, last_ip = ? 
                    WHERE id = ?
                """, (token, client_ip, user['id']))

                # Journaliser la connexion réussie
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
                # Échec d'authentification
                record['count'] += 1
                sanction_applied = 0

                if record['count'] >= 3:
                    # ⚡ DÉCLENCHEMENT DE LA SANCTION AUTOMATIQUE (3 TENTATIVES) -> 1 HEURE DE BLOCAGE
                    record['locked_until'] = now + 3600  # Verrouillé 1 heure = 3600 secondes
                    FAILED_LOGINS[client_ip] = record
                    sanction_applied = 1

                    # 1. Bloquer la Boîte à Idées et les Votes pour cette IP dans banned_ips
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

                    # 2. Notification de sécurité pour les administrateurs
                    cursor.execute("""
                        INSERT INTO security_notifications (ip_address, type, title, message)
                        VALUES (?, 'failed_logins_sanction', ?, ?)
                    """, (
                        client_ip,
                        f"🚨 Sanction automatique appliquée à {client_ip}",
                        f"L'adresse IP {client_ip} a échoué 3 tentatives consécutives de connexion admin (identifiant tenté : '{username}'). La Boîte à Idées et les votes de la Roadmap lui ont été automatiquement révoqués pour 3 jours."
                    ))

                    # 3. Log d'audit
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

        # 2b. PUBLIC ROADMAP VOTE (1 vote per feature per public IP + Ban Check)
        elif path == '/api/roadmap/vote':
            client_ip = self.get_client_ip()
            user_agent = self.headers.get('User-Agent', 'Unknown')
            feature_id = payload.get('feature_id')

            # Vérification Bannissement IP pour le vote
            is_banned, ban_info = self.check_ip_ban('vote')
            if is_banned:
                exp_msg = f" jusqu'au {ban_info.get('expires_at')}" if ban_info.get('ban_type') == 'temp' and ban_info.get('expires_at') else " (définitif)"
                return self.send_json({
                    "status": "banned",
                    "message": f"Votre adresse IP ({client_ip}) est bannie des votes{exp_msg}. Motif : {ban_info.get('reason', 'Non respect des règles')}"
                }, status=403)

            if not feature_id:
                return self.send_json({"status": "error", "message": "ID de fonctionnalité manquant."}, status=400)

            conn = get_db()
            cursor = conn.cursor()

            # Check if feature exists
            cursor.execute("SELECT id, title_fr, votes_count FROM roadmap_features WHERE id = ?", (feature_id,))
            feature = cursor.fetchone()
            if not feature:
                conn.close()
                return self.send_json({"status": "error", "message": "Fonctionnalité introuvable."}, status=404)

            # Check if IP has already voted for this feature
            cursor.execute("SELECT id, created_at FROM roadmap_votes WHERE feature_id = ? AND ip_address = ?", (feature_id, client_ip))
            existing_vote = cursor.fetchone()
            if existing_vote:
                conn.close()
                return self.send_json({
                    "status": "already_voted",
                    "message": f"Vous avez déjà voté pour cette fonctionnalité avec cette adresse IP ({client_ip}).",
                    "feature_id": feature_id,
                    "votes_count": feature['votes_count']
                })

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
                return self.send_json({
                    "status": "ok",
                    "message": "Votre vote a été pris en compte avec succès !",
                    "feature_id": feature_id,
                    "votes_count": new_count
                })
            except sqlite3.IntegrityError:
                conn.close()
                return self.send_json({
                    "status": "already_voted",
                    "message": f"Vous avez déjà voté pour cette fonctionnalité avec cette adresse IP ({client_ip}).",
                    "feature_id": feature_id,
                    "votes_count": feature['votes_count']
                })

        elif path == '/api/roadmap/propose':
            client_ip = self.get_client_ip()

            # Vérification Bannissement IP pour les propositions
            is_banned, ban_info = self.check_ip_ban('proposal')
            if is_banned:
                exp_msg = f" jusqu'au {ban_info.get('expires_at')}" if ban_info.get('ban_type') == 'temp' and ban_info.get('expires_at') else " (définitif)"
                return self.send_json({
                    "status": "banned",
                    "message": f"Votre adresse IP ({client_ip}) est bannie des propositions d'idées{exp_msg}. Motif : {ban_info.get('reason', 'Non respect des règles')}"
                }, status=403)

            title = payload.get('title', '').strip()
            category = payload.get('category', 'GÉNÉRAL').strip()
            desc = payload.get('description', '').strip()
            author = payload.get('author', 'Anonyme').strip() or 'Anonyme'
            email = payload.get('email', '').strip()

            if not title or not desc:
                return self.send_json({"status": "error", "message": "Le titre et la description détaillée sont requis."}, status=400)

            # Validation STRICTE de l'email obligatoire
            import re
            email_pattern = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
            if not email or not re.match(email_pattern, email):
                return self.send_json({"status": "error", "message": "Une adresse email valide est obligatoire pour soumettre une idée (ex: contact@domaine.com)."}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("INSERT INTO community_proposals (title, category, description, author, email, ip_address, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
                           (title, category, desc, author, email, client_ip))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Votre idée a été transmise avec succès ! Vous recevrez une notification par email dès sa validation par l'équipe."})

        elif path == '/api/roadmap/features/suggest':
            client_ip = self.get_client_ip()

            # Vérification Bannissement IP pour les compléments
            is_banned, ban_info = self.check_ip_ban('suggestion')
            if is_banned:
                exp_msg = f" jusqu'au {ban_info.get('expires_at')}" if ban_info.get('ban_type') == 'temp' and ban_info.get('expires_at') else " (définitif)"
                return self.send_json({
                    "status": "banned",
                    "message": f"Votre adresse IP ({client_ip}) est bannie de l'envoi de compléments{exp_msg}. Motif : {ban_info.get('reason', 'Non respect des règles')}"
                }, status=403)

            fid = payload.get('feature_id')
            text = payload.get('suggestion_text', '').strip()
            author = payload.get('author', 'Anonyme').strip() or 'Anonyme'
            email = payload.get('email', '').strip()

            if not fid or not text:
                return self.send_json({"status": "error", "message": "ID et texte de suggestion requis."}, status=400)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM roadmap_features WHERE id = ?", (fid,))
            if not cursor.fetchone():
                conn.close()
                return self.send_json({"status": "error", "message": "Fonctionnalité introuvable."}, status=404)
            cursor.execute("INSERT INTO feature_suggestions (feature_id, author, email, suggestion_text, ip_address, status) VALUES (?, ?, ?, ?, ?, 'pending')",
                           (fid, author, email, text, client_ip))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Votre suggestion ou idée complémentaire a été transmise à l'équipe !"})

        # PROTECTED ADMIN ROUTES (REQUIRE TOKEN)
        if not self.verify_token():
            return self.send_json({"status": "unauthorized", "message": "Accès refusé"}, status=401)

        conn = get_db()
        cursor = conn.cursor()

        # 3. UPDATE MULTILINGUAL SITE CONTENT
        if path == '/api/content/update':
            updates = payload.get('content', {}) # dict of {key: {fr: '...', en: '...'}} or {key: '...'} with lang param
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
            return self.send_json({"status": "ok", "message": "Contenus mis à jour"})

        # 4. GAMES CRUD
        elif path == '/api/games/save':
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
            return self.send_json({"status": "ok", "message": "Jeu enregistré"})

        elif path == '/api/games/delete':
            cursor.execute("DELETE FROM arcade_games WHERE id = ?", (payload.get('id'),))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Jeu supprimé"})

        # 5. FAQ CRUD
        elif path == '/api/faq/save':
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
            return self.send_json({"status": "ok", "message": "Question FAQ enregistrée"})

        elif path == '/api/faq/delete':
            cursor.execute("DELETE FROM faq_items WHERE id = ?", (payload.get('id'),))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Question FAQ supprimée"})

        # 6. SHOWCASE PLUGINS CRUD
        elif path == '/api/plugins/save':
            pid = payload.get('id')
            name = payload.get('name')
            desc_fr = payload.get('desc_fr')
            desc_en = payload.get('desc_en')
            cat = payload.get('category', 'GÉNÉRAL')
            badge = payload.get('badge', 'OFFICIEL')
            ver = payload.get('version', 'v1.0.0')
            author = payload.get('author', '@KairoCore')
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
            return self.send_json({"status": "ok", "message": "Plugin enregistré"})

        elif path == '/api/plugins/delete':
            cursor.execute("DELETE FROM showcase_plugins WHERE id = ?", (payload.get('id'),))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Plugin supprimé"})

        # 7. SHOWCASE THEMES CRUD
        elif path == '/api/themes/save':
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
            return self.send_json({"status": "ok", "message": "Thème enregistré"})

        elif path == '/api/themes/delete':
            cursor.execute("DELETE FROM showcase_themes WHERE id = ?", (payload.get('id'),))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Thème supprimé"})

        # 8. ROADMAP MILESTONES CRUD
        elif path == '/api/milestones/save':
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
            return self.send_json({"status": "ok", "message": "Jalon Roadmap enregistré"})

        elif path == '/api/milestones/delete':
            cursor.execute("DELETE FROM roadmap_milestones WHERE id = ?", (payload.get('id'),))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Jalon supprimé"})

        # 8b. ROADMAP FEATURES CRUD (ADMIN)
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
                    """, (t_fr, t_en, d_fr, d_en, tag, sort_order, int(votes_count), fid))
                else:
                    cursor.execute("""
                    UPDATE roadmap_features 
                    SET title_fr=?, title_en=?, desc_fr=?, desc_en=?, tag=?, sort_order=? 
                    WHERE id=?
                    """, (t_fr, t_en, d_fr, d_en, tag, sort_order, fid))
            else:
                vc = int(votes_count) if votes_count is not None else 0
                cursor.execute("""
                INSERT INTO roadmap_features (title_fr, title_en, desc_fr, desc_en, tag, sort_order, votes_count) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (t_fr, t_en, d_fr, d_en, tag, sort_order, vc))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Fonctionnalité enregistrée pour les votes"})

        elif path == '/api/roadmap/features/delete':
            fid = payload.get('id')
            cursor.execute("DELETE FROM roadmap_votes WHERE feature_id = ?", (fid,))
            cursor.execute("DELETE FROM roadmap_features WHERE id = ?", (fid,))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Fonctionnalité supprimée"})

        # 8c. ROADMAP VOTES MANAGEMENT (ADMIN)
        elif path == '/api/roadmap/votes/delete':
            vote_id = payload.get('id')
            if not vote_id:
                conn.close()
                return self.send_json({"status": "error", "message": "ID de vote manquant"}, status=400)
            cursor.execute("SELECT feature_id FROM roadmap_votes WHERE id = ?", (vote_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return self.send_json({"status": "error", "message": "Vote introuvable"}, status=404)
            fid = row['feature_id']
            cursor.execute("DELETE FROM roadmap_votes WHERE id = ?", (vote_id,))
            cursor.execute("""
                UPDATE roadmap_features 
                SET votes_count = (SELECT COUNT(*) FROM roadmap_votes WHERE feature_id = ?) 
                WHERE id = ?
            """, (fid, fid))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Vote supprimé avec succès"})

        elif path == '/api/roadmap/votes/delete-all':
            cursor.execute("DELETE FROM roadmap_votes")
            cursor.execute("UPDATE roadmap_features SET votes_count = 0")
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Tous les votes ont été réinitialisés à zéro"})

        elif path == '/api/roadmap/votes/recalculate':
            cursor.execute("""
                UPDATE roadmap_features 
                SET votes_count = (SELECT COUNT(*) FROM roadmap_votes WHERE feature_id = roadmap_features.id)
            """)
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Tous les compteurs de votes ont été recalculés"})

        elif path == '/api/roadmap/features/reset-votes':
            fid = payload.get('id')
            if not fid:
                conn.close()
                return self.send_json({"status": "error", "message": "ID de fonctionnalité manquant"}, status=400)
            cursor.execute("DELETE FROM roadmap_votes WHERE feature_id = ?", (fid,))
            cursor.execute("UPDATE roadmap_features SET votes_count = 0 WHERE id = ?", (fid,))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Votes réinitialisés pour cette fonctionnalité"})

        # 8d. ROADMAP PROPOSALS & SUGGESTIONS MODERATION (ADMIN)
        elif path == '/api/roadmap/proposals/moderate':
            pid = payload.get('id')
            action = payload.get('action') # 'approve', 'reject', 'delete', 'edit'
            if not pid:
                conn.close()
                return self.send_json({"status": "error", "message": "ID manquant"}, status=400)

            if action == 'delete':
                cursor.execute("DELETE FROM community_proposals WHERE id = ?", (pid,))
                conn.commit()
                conn.close()
                return self.send_json({"status": "ok", "message": "Idée supprimée"})
            elif action == 'reject':
                cursor.execute("UPDATE community_proposals SET status = 'rejected' WHERE id = ?", (pid,))
                conn.commit()
                conn.close()
                return self.send_json({"status": "ok", "message": "Idée rejetée"})
            elif action == 'approve':
                cursor.execute("SELECT * FROM community_proposals WHERE id = ?", (pid,))
                prop = cursor.fetchone()
                if not prop:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Idée introuvable"}, status=404)
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
                return self.send_json({"status": "ok", "message": "Idée validée et publiée dans les fonctionnalités au vote communautaire !"})
            elif action == 'edit':
                title = payload.get('title')
                desc = payload.get('description')
                cat = payload.get('category')
                cursor.execute("UPDATE community_proposals SET title = ?, description = ?, category = ? WHERE id = ?",
                               (title, desc, cat, pid))
                conn.commit()
                conn.close()
                return self.send_json({"status": "ok", "message": "Idée mise à jour"})

        elif path == '/api/roadmap/suggestions/moderate':
            sid = payload.get('id')
            action = payload.get('action') # 'approve', 'reject', 'delete', 'append'
            if not sid:
                conn.close()
                return self.send_json({"status": "error", "message": "ID manquant"}, status=400)

            if action == 'delete':
                cursor.execute("DELETE FROM feature_suggestions WHERE id = ?", (sid,))
                conn.commit()
                conn.close()
                return self.send_json({"status": "ok", "message": "Suggestion supprimée"})
            elif action == 'reject':
                cursor.execute("UPDATE feature_suggestions SET status = 'rejected' WHERE id = ?", (sid,))
                conn.commit()
                conn.close()
                return self.send_json({"status": "ok", "message": "Suggestion rejetée"})
            elif action == 'approve':
                cursor.execute("UPDATE feature_suggestions SET status = 'approved' WHERE id = ?", (sid,))
                conn.commit()
                conn.close()
                return self.send_json({"status": "ok", "message": "Suggestion approuvée"})
            elif action == 'append':
                cursor.execute("SELECT fs.*, f.desc_fr FROM feature_suggestions fs JOIN roadmap_features f ON fs.feature_id = f.id WHERE fs.id = ?", (sid,))
                row = cursor.fetchone()
                if row:
                    new_desc = (row['desc_fr'] or '') + f"\n\n• [Idée ajoutée par {row['author']}]: {row['suggestion_text']}"
                    cursor.execute("UPDATE roadmap_features SET desc_fr = ?, desc_en = ? WHERE id = ?", (new_desc, new_desc, row['feature_id']))
                    cursor.execute("UPDATE feature_suggestions SET status = 'approved' WHERE id = ?", (sid,))
                    conn.commit()
                    conn.close()
                    return self.send_json({"status": "ok", "message": "Complément fusionné directement dans la description de la fonctionnalité !"})
                else:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Suggestion introuvable"}, status=404)

        # 8b. ADMIN IP BANS MANAGEMENT
        # SUPPRESSION COMPLÈTE D'UN UTILISATEUR / PERSONNE DE L'HISTORIQUE
        elif path == '/api/admin/users/delete':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            target_ip = payload.get('ip_address', '').strip()
            if not target_ip:
                return self.send_json({"status": "error", "message": "Adresse IP requise"}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            # Suppression intégrale de toutes les tables de suivi et de contribution
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

            # Recalculer les compteurs de vote sur les fonctionnalités
            cursor.execute("""
                UPDATE roadmap_features
                SET votes_count = (
                    SELECT COUNT(*) FROM roadmap_votes
                    WHERE roadmap_votes.feature_id = roadmap_features.id
                )
            """)
            conn.commit()
            conn.close()

            return self.send_json({
                "status": "ok",
                "message": f"Utilisateur {target_ip} supprimé définitivement ({views_del} vues, {votes_del} votes, {props_del + sugs_del} contributions purgées)."
            })

        # GESTION DE LA RESTRICTION D'ACCÈS IP ADMIN (LOCAL / WHITELIST)
        elif path == '/api/admin/security/config':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            access_mode = payload.get('access_mode', 'all')
            if access_mode not in ('all', 'local_only', 'whitelist'):
                access_mode = 'all'
            allowed_ips = payload.get('allowed_ips', '127.0.0.1,::1')

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO admin_security_config (id, access_mode, allowed_ips)
                VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET access_mode=excluded.access_mode, allowed_ips=excluded.allowed_ips
            """, (access_mode, allowed_ips))
            conn.commit()
            conn.close()

            return self.send_json({
                "status": "ok",
                "message": "Politique de restriction d'accès IP mise à jour avec succès."
            })

        # GESTION DES RECOURS (ACCEPTER ET DÉBANNIR OU REJETER)
        elif path == '/api/admin/appeals/respond':
            if not self.verify_token():
                return self.send_json({"status": "unauthorized"}, status=401)
            appeal_id = payload.get('appeal_id')
            action = payload.get('action', 'accept')  # accept ou reject

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ban_appeals WHERE id = ?", (appeal_id,))
            appeal = cursor.fetchone()
            if not appeal:
                conn.close()
                return self.send_json({"status": "error", "message": "Recours introuvable"}, status=404)

            target_ip = appeal['ip_address']
            new_status = 'accepted' if action == 'accept' else 'rejected'
            cursor.execute("UPDATE ban_appeals SET status = ? WHERE id = ?", (new_status, appeal_id))

            if action == 'accept':
                # Débannir automatiquement l'IP !
                cursor.execute("DELETE FROM banned_ips WHERE ip_address = ?", (target_ip,))
                conn.commit()
                conn.close()
                return self.send_json({
                    "status": "ok",
                    "message": f"Recours accepté ! L'adresse IP {target_ip} a été débannie avec succès."
                })
            else:
                conn.commit()
                conn.close()
                return self.send_json({
                    "status": "ok",
                    "message": f"Recours rejeté pour l'adresse IP {target_ip}."
                })

        elif path == '/api/admin/bans/save':
            ip = payload.get('ip_address', '').strip()
            if not ip:
                conn.close()
                return self.send_json({"status": "error", "message": "Adresse IP requise."}, status=400)

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
            return self.send_json({"status": "ok", "message": f"Bannissement appliqué avec succès pour l'adresse IP {ip}."})

        # GESTION MULTI-ADMINS (RBAC)
        elif path == '/api/admin/admins/save':
            if not self.verify_token('settings'):
                return self.send_json({"status": "error", "message": "Permission insuffisante pour gérer les comptes administrateurs."}, status=403)
            admin_id = payload.get('id')
            username = payload.get('username', '').strip()
            password = payload.get('password', '').strip()
            role = payload.get('role', 'admin').strip()
            perms = payload.get('permissions', ['all'])
            perms_json = json.dumps(perms)

            if not username:
                return self.send_json({"status": "error", "message": "L'identifiant est obligatoire."}, status=400)

            conn = get_db()
            cursor = conn.cursor()

            if admin_id:
                # Modification
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
                return self.send_json({"status": "ok", "message": f"Compte administrateur '{username}' mis à jour avec succès."})
            else:
                # Création
                if not password:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Le mot de passe est obligatoire pour un nouveau compte."}, status=400)
                pwd_hash = hash_password(password)
                try:
                    cursor.execute("""
                        INSERT INTO admin_users (username, password_hash, role, permissions)
                        VALUES (?, ?, ?, ?)
                    """, (username, pwd_hash, role, perms_json))
                    conn.commit()
                    conn.close()
                    return self.send_json({"status": "ok", "message": f"Compte administrateur '{username}' créé avec succès."})
                except sqlite3.IntegrityError:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Cet identifiant est déjà utilisé."}, status=400)

        elif path == '/api/admin/admins/delete':
            if not self.verify_token('settings'):
                return self.send_json({"status": "error", "message": "Permission insuffisante."}, status=403)
            admin_id = payload.get('id')
            current_user = self.get_token_user()
            if current_user and current_user['id'] == admin_id:
                return self.send_json({"status": "error", "message": "Vous ne pouvez pas supprimer votre propre compte actif."}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT username FROM admin_users WHERE id = ?", (admin_id,))
            target = cursor.fetchone()
            if target and target['username'] == 'admin':
                conn.close()
                return self.send_json({"status": "error", "message": "Le compte superadministrateur principal 'admin' ne peut pas être supprimé."}, status=400)

            cursor.execute("DELETE FROM admin_users WHERE id = ?", (admin_id,))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Compte administrateur supprimé."})

        # JOURNAUX D'AUDIT & NOTIFICATIONS
        elif path == '/api/admin/audit-logs/clear':
            if not self.verify_token('settings'):
                return self.send_json({"status": "error", "message": "Permission insuffisante."}, status=403)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM admin_login_logs")
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Journaux d'audit réinitialisés avec succès."})

        elif path == '/api/admin/notifications/mark-read':
            if not self.verify_token():
                return self.send_json({"status": "error", "message": "Non autorisé."}, status=401)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE security_notifications SET is_read = 1")
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Notifications marquées comme lues."})

        elif path == '/api/admin/bans/delete':
            bid = payload.get('id')
            ip = payload.get('ip_address')
            if bid:
                cursor.execute("DELETE FROM banned_ips WHERE id = ?", (bid,))
            elif ip:
                cursor.execute("DELETE FROM banned_ips WHERE ip_address = ?", (ip,))
            else:
                conn.close()
                return self.send_json({"status": "error", "message": "ID ou IP manquant"}, status=400)
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Bannissement levé avec succès ! L'IP a retrouvé tous ses droits."})

        # 9. CHANGE ADMIN PASSWORD
        elif path == '/api/admin/password':
            if not self.verify_token('settings'):
                conn.close()
                return self.send_json({"status": "unauthorized", "message": "Permission insuffisante pour modifier un mot de passe administrateur."}, status=403)

            target_username = (payload.get('username') or 'admin').strip()
            new_pwd = (payload.get('new_password') or '').strip()
            if not new_pwd or len(new_pwd) < 6:
                conn.close()
                return self.send_json({"status": "error", "message": "Le mot de passe doit faire au moins 6 caractères"}, status=400)

            cursor.execute("SELECT id FROM admin_users WHERE username = ?", (target_username,))
            target = cursor.fetchone()
            if not target:
                conn.close()
                return self.send_json({"status": "error", "message": f"Compte admin '{target_username}' introuvable."}, status=404)

            cursor.execute("UPDATE admin_users SET password_hash = ? WHERE username = ?", (hash_password(new_pwd), target_username))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": f"Mot de passe modifié avec succès pour '{target_username}'."})

        # 10. UPLOAD IMAGE
        elif path == '/api/upload':
            file_data = payload.get('file_data')
            file_name = payload.get('file_name', 'image.png')
            safe_name = f"{int(datetime.now(timezone.utc).timestamp())}_{secrets.token_hex(4)}_{os.path.basename(file_name)}"
            dest_path = os.path.join(UPLOAD_DIR, safe_name)

            if ',' in file_data:
                file_data = file_data.split(',', 1)[1]
            binary_content = base64.b64decode(file_data)
            with open(dest_path, 'wb') as f:
                f.write(binary_content)

            rel_path = f"assets/img/uploads/{safe_name}"
            conn.close()
            return self.send_json({"status": "ok", "url": rel_path})

        conn.close()
        return self.send_json({"status": "not_found"}, status=404)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def normalize_permissions(raw_permissions):
    try:
        perms = json.loads(raw_permissions or '["all"]')
        if isinstance(perms, list) and perms:
            return perms
        return ['all']
    except Exception:
        return ['all']


def list_admin_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role, permissions, last_login, last_ip, created_at FROM admin_users ORDER BY id ASC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    if not rows:
        print("Aucun utilisateur administrateur trouvé.")
        return

    print("Liste des comptes admin :")
    for row in rows:
        try:
            perms = json.loads(row['permissions']) if row['permissions'] else ['all']
        except Exception:
            perms = ['all']
        print(f"- id={row['id']} username={row['username']} role={row['role']} permissions={','.join(perms)} last_login={row['last_login']} last_ip={row['last_ip']} created_at={row['created_at']}")


def create_admin_user(username, password=None, role='superadmin', permissions='["all"]'):
    if not username or not username.strip():
        print("Erreur : un identifiant utilisateur admin est requis.")
        return

    username = username.strip()
    if password is None:
        password = secrets.token_urlsafe(12)

    password = password.strip()
    if len(password) < 6:
        print("Erreur : le mot de passe doit contenir au moins 6 caractères.")
        return

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM admin_users WHERE username = ?", (username,))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        print(f"Erreur : l'utilisateur '{username}' existe déjà.")
        return

    perms = normalize_permissions(permissions)
    cursor.execute("INSERT INTO admin_users (username, password_hash, role, permissions) VALUES (?, ?, ?, ?)",
                   (username, hash_password(password), role, json.dumps(perms)))
    conn.commit()
    conn.close()
    print(f"Compte admin créé : username={username} role={role} permissions={','.join(perms)} password={password}")


def delete_admin_user(username):
    username = (username or '').strip()
    if not username:
        print("Erreur : un identifiant admin est requis pour supprimer un compte.")
        return

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM admin_users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        print(f"Erreur : utilisateur '{username}' introuvable.")
        return

    cursor.execute("DELETE FROM admin_users WHERE username = ?", (username,))
    conn.commit()
    conn.close()
    print(f"Compte admin supprimé : {username}")


def reset_admin_password(username, password=None, generate_password=False):
    username = (username or '').strip()
    if not username:
        print("Erreur : un identifiant admin est requis pour la réinitialisation.")
        return

    if password and generate_password:
        print("Erreur : choisissez soit --password, soit --generate-password, pas les deux.")
        return

    if generate_password:
        password = secrets.token_urlsafe(12)

    if not password:
        print("Erreur : un mot de passe manuel ou la génération aléatoire est requis.")
        return

    password = password.strip()
    if len(password) < 6:
        print("Erreur : le mot de passe doit contenir au moins 6 caractères.")
        return

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM admin_users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        print(f"Erreur : utilisateur admin '{username}' introuvable.")
        return

    cursor.execute("UPDATE admin_users SET password_hash = ? WHERE username = ?", (hash_password(password), username))
    conn.commit()
    conn.close()
    print(f"Mot de passe réinitialisé pour l'utilisateur '{username}'. Nouveau mot de passe : {password}")


def parse_cli(argv):
    parser = argparse.ArgumentParser(description='KairoOS Admin CLI helper')
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


if __name__ == '__main__':
    args = parse_cli(sys.argv[1:])
    if run_admin_cli(args):
        sys.exit(0)

    with ThreadedTCPServer(("", PORT), KairoRequestHandler) as httpd:
        print(f"KairoOS Multilingual Server running on http://localhost:{PORT}")
        httpd.serve_forever()
