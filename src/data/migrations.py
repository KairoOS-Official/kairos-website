import sqlite3
from src.data.db import get_db
from src.services.auth import hash_password, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD

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
    # Masquage panel (soft-delete) : visible fiche profil même si masqué du panel
    cursor.execute("PRAGMA table_info(ban_appeals)")
    cols_appeals = [r[1] for r in cursor.fetchall()]
    if 'archived' not in cols_appeals:
        cursor.execute("ALTER TABLE ban_appeals ADD COLUMN archived INTEGER DEFAULT 0")

    # 13b. Chat instantané admin <-> visiteur (tout archivé, visible fiche profil)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        sender TEXT NOT NULL DEFAULT 'admin',
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_ip ON chat_messages(ip_address)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_appeals_ip ON ban_appeals(ip_address)")

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
        ("home_hero_badge", "fr", "KAÏRO-OS v0.1.0 ALPHA · 100% OPEN SOURCE (MIT)"),
        ("home_hero_badge", "en", "KAÏRO-OS v0.1.0 ALPHA · 100% OPEN SOURCE (MIT)"),
        ("version_badge", "fr", "ALPHA 0.1"),
        ("version_badge", "en", "ALPHA 0.1"),
        ("home_hero_title1", "fr", "Toute votre arcade."),
        ("home_hero_title1", "en", "Your entire arcade."),
        ("home_hero_title2", "fr", "Une interface épurée."),
        ("home_hero_title2", "en", "One singular interface."),
        ("home_hero_desc", "fr", "KaïroOS transforme votre PC Windows en une borne dédiée haut de gamme. Jeux rétro, blockbusters PC, émulateurs et contrôle distant réunis dans une expérience pensée exclusivement pour la manette."),
        ("home_hero_desc", "en", "KaïroOS transforms your Windows PC into a dedicated luxury arcade. Retro gems, native PC blockbusters, emulators and phone remote unified in an experience crafted for the gamepad."),
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
        ("home_comparison_purity_title", "fr", "KaïroOS : La pureté arcade"),
        ("home_comparison_purity_title", "en", "KaïroOS: Pure Arcade Experience"),
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
        ("themes_hero_desc", "fr", "KaïroOS sépare strictement le moteur de jeu de ses palettes lumineuses. Choisissez une ambiance officielle, activez les scanlines CRT authentiques ou injectez vos propres shaders en direct."),
        ("themes_hero_desc", "en", "KaïroOS strictly separates game execution from visual themes. Pick an official ambiance, activate authentic CRT scanlines or inject your own shaders in real time."),
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
        ("plugins_hero_desc", "fr", "KaïroOS intègre une architecture de plugins isolés ultra-rapides. Éclairez votre borne avec des LEDs réactives, synchronisez vos sauvegardes et partagez vos succès sur Discord sans jamais ralentir vos parties."),
        ("plugins_hero_desc", "en", "KaïroOS features an isolated, sub-millisecond plugin system. Enrich your arcade with dynamic LED strips, cloud backup sync and Discord presence without slowing down your games."),
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
            ("KaïroOS remplace-t-il Windows ou fonctionne-t-il par-dessus ?",
             "Does KaïroOS replace Windows or run on top of it?",
             "KaïroOS fonctionne en surcouche ultra-légère par-dessus Windows 10/11. Il masque l'explorateur et la barre des tâches au démarrage pour offrir une expérience borne d'arcade 100% dédiée, tout en conservant vos pilotes graphiques.",
             "KaïroOS runs as an ultra-lightweight overlay on top of Windows 10/11. It hides the explorer shell and taskbar on boot to deliver a 100% dedicated arcade experience, while keeping your native GPU drivers.", 1),
            ("Puis-je l'utiliser avec des manettes Bluetooth ou des encodeurs USB d'arcade ?",
             "Can I use Bluetooth controllers or USB arcade encoders?",
             "Oui, KaïroOS intègre un module DirectInput / XInput / WebHID universel. Les joysticks Sanwa, encodeurs Zero Delay, manettes Xbox, PlayStation et Switch sont reconnus instantanément sans configuration.",
             "Yes, KaïroOS features a universal DirectInput / XInput / WebHID input driver. Sanwa joysticks, Zero Delay encoders, Xbox, PlayStation, and Switch gamepads are recognized instantly with zero configuration.", 2),
            ("Comment ajouter mes propres jeux et ROMs ?",
             "How do I add my own games and ROMs?",
             "Déposez simplement vos dossiers de jeux ou vos ROMs dans le répertoire C:\\KaïroOS\\Games. KaïroOS scanne automatiquement la bibliothèque et télécharge les jaquettes haute définition.",
             "Simply place your game folders or ROMs in C:\\KaïroOS\\Games. KaïroOS scans your library automatically and fetches high-definition box art in the background.", 3),
            ("Le logiciel est-il gratuit et open source ?",
             "Is KaïroOS completely free & open source?",
             "Absolument. KaïroOS est un projet communautaire distribué sous licence MIT. Le code source est public sur GitHub et chacun peut développer ses propres thèmes ou plugins sans frais.",
             "Absolutely. KaïroOS is a community project distributed under the MIT license. The source code is public on GitHub and anyone can create their own themes and plugins for free.", 4)
        ]
        cursor.executemany("INSERT INTO faq_items (question_fr, question_en, answer_fr, answer_en, sort_order) VALUES (?, ?, ?, ?, ?)", default_faq)

    # Seed Showcase Plugins
    cursor.execute("SELECT COUNT(*) FROM showcase_plugins")
    if cursor.fetchone()[0] == 0:
        default_plugins = [
            ("Discord Rich Presence", "Diffusez votre session arcade en direct avec jaquette et scores.", "Stream your arcade session live to Discord with active game cover and high score.", "RÉSEAU", "OFFICIEL", "v1.2.0", "@KaïroCore", "4 120 installs", 1),
            ("Illumination Dynamique WebHID", "Synchronise les rubans LED WS2812B et boutons d'arcade avec le jeu.", "Syncs cabinet WS2812B LEDs and arcade pushbuttons with active game colors.", "MATÉRIEL", "OFFICIEL", "v2.0.4", "@ArcadeMaker", "1 890 installs", 2),
            ("RetroAchievements Overlay", "Notifications sonores et visuelles de succès rétro sans latence.", "Real-time visual and audio retro achievement toasts without lag.", "INTERFACE", "COMMUNAUTÉ", "v0.9.8", "@CheevoHunter", "3 250 installs", 3),
            ("Sauvegardes P2P Décentralisées", "Synchronise les sauvegardes entre borne fixe et portable en local.", "Syncs game save states between arcade cabinet and laptop via local Wi-Fi.", "SYNC", "OFFICIEL", "v1.0.1", "@KaïroCore", "980 installs", 4),
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

