import http.server
import socketserver
import os
import json
import sqlite3
import hashlib
import secrets
import base64
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

PORT = 3000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'data', 'kairoos.db')
UPLOAD_DIR = os.path.join(BASE_DIR, 'assets', 'img', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

def hash_password(password: str, salt: str = "kairo_salt_2026") -> str:
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Admin Users
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

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

    conn.commit()

    # --- SEEDING INITIAL DATA ---

    # Default Admin
    cursor.execute("SELECT COUNT(*) FROM admin_users")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", ("admin", hash_password("admin123")))

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
        ("roadmap_hero_desc", "fr", "Suivez l'évolution du développement de KairoOS, de la première couche Windows Alpha jusqu'à l'image système amorçable autonome."),
        ("roadmap_hero_desc", "en", "Follow the evolution of KairoOS development, from the first Windows Alpha layer to the standalone bootable OS image."),
        ("roadmap_vision_title", "fr", "L'objectif Console Dédiée Autonome"),
        ("roadmap_vision_title", "en", "The Standalone Bootable Console Vision"),
        ("roadmap_vision_desc", "fr", "Transformer n'importe quel ordinateur en console instantanée dès l'allumage avec notre future image bootable."),
        ("roadmap_vision_desc", "en", "Turn any computer into an instant arcade boot appliance with our upcoming flashable OS image.")
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

    # Seed Roadmap Milestones
    cursor.execute("SELECT COUNT(*) FROM roadmap_milestones")
    if cursor.fetchone()[0] == 0:
        default_milestones = [
            ("v0.1.0 Alpha", "Couche Arcade Windows 10/11", "Windows 10/11 Arcade Layer", "Direct3D 12, Kiosque fluide à la manette et base SQLite.", "Direct3D 12, Gamepad Kiosk shell and SQLite base.", "T1 2026", 100, "LIVRÉ", 1),
            ("v0.2.0 Bêta", "Scraper Automatique & Métadonnées", "Auto Scraper & Metadata", "Téléchargement automatique des jaquettes 3D et résumés IGDB.", "Automatic 3D box art downloads and IGDB synopses.", "T2 2026", 68, "EN COURS", 2),
            ("v0.3.0 Netplay", "Multijoueur En Ligne P2P", "P2P Online Netplay", "Rollback Netcode GGPO et salons privés sans serveur tiers.", "GGPO Rollback Netcode and private P2P matchmaking.", "T3 2026", 35, "SPÉCIFIÉ", 3),
            ("v0.4.0 Shaders Pro", "Moteur de Shaders Trinitron 15kHz", "Trinitron 15kHz Shader Engine", "Courbure cathodique, bloom phosphore et masques d'ombre.", "Cathode curvature, phosphor bloom and shadow masks.", "T4 2026", 15, "RECHERCHE", 4),
            ("v1.0.0 Console", "Image Système Amorçable Autonome", "Standalone Bootable OS Image", "ISO amorçable sur clé USB sans dépendance à Windows.", "Bootable flashable ISO running independently of Windows.", "2027", 5, "PLANIFIÉ", 5)
        ]
        cursor.executemany("INSERT INTO roadmap_milestones (version, title_fr, title_en, desc_fr, desc_en, date_text, progress_percent, status_badge, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", default_milestones)

    conn.commit()
    conn.close()

init_db()

class KairoRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def verify_token(self):
        auth = self.headers.get('Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        if not token:
            return False
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username FROM admin_users WHERE token = ?", (token,))
        user = cursor.fetchone()
        conn.close()
        return user is not None

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

            conn.close()
            return self.send_json({
                "status": "ok",
                "content": content_i18n,
                "games": games,
                "faq": faq,
                "plugins": plugins,
                "themes": themes,
                "milestones": milestones
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

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        # 1. PUBLIC TRACKING ROUTE
        if path == '/api/track':
            event_type = payload.get('event_type', 'click')
            target = payload.get('target', 'unknown')
            page = payload.get('page', '/')
            session_id = payload.get('session_id', 'anon')
            meta_json = json.dumps(payload.get('meta', {}))

            conn = get_db()
            cursor = conn.cursor()
            if event_type == 'page_view':
                referrer = payload.get('referrer', '')
                cursor.execute("INSERT INTO page_views (page, session_id, referrer) VALUES (?, ?, ?)", (page, session_id, referrer))
            else:
                cursor.execute("INSERT INTO analytics_events (event_type, target, page, session_id, meta_json) VALUES (?, ?, ?, ?, ?)",
                               (event_type, target, page, session_id, meta_json))
            conn.commit()
            conn.close()
            return self.send_json({"status": "tracked"})

        # 2. AUTHENTICATION LOGIN
        elif path == '/api/auth/login':
            username = payload.get('username', '')
            password = payload.get('password', '')
            pwd_hash = hash_password(password)

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM admin_users WHERE username = ? AND password_hash = ?", (username, pwd_hash))
            user = cursor.fetchone()
            if user:
                token = secrets.token_hex(24)
                cursor.execute("UPDATE admin_users SET token = ? WHERE id = ?", (token, user['id']))
                conn.commit()
                conn.close()
                return self.send_json({"status": "ok", "token": token, "username": username})
            else:
                conn.close()
                return self.send_json({"status": "error", "message": "Identifiants invalides"}, status=401)

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

        # 9. CHANGE ADMIN PASSWORD
        elif path == '/api/admin/password':
            new_pwd = payload.get('new_password')
            if not new_pwd or len(new_pwd) < 6:
                conn.close()
                return self.send_json({"status": "error", "message": "Le mot de passe doit faire au moins 6 caractères"}, status=400)
            cursor.execute("UPDATE admin_users SET password_hash = ? WHERE username = 'admin'", (hash_password(new_pwd),))
            conn.commit()
            conn.close()
            return self.send_json({"status": "ok", "message": "Mot de passe modifié avec succès"})

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

if __name__ == '__main__':
    with ThreadedTCPServer(("", PORT), KairoRequestHandler) as httpd:
        print(f"KairoOS Multilingual Server running on http://localhost:{PORT}")
        httpd.serve_forever()
