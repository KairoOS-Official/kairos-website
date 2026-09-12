<p align="center">
  <img src="assets/img/logo.png?v=2" alt="KaïroOS" width="160" />
</p>

# 🕹️ KaïroOS — Site Web Officiel

Site de présentation de KaïroOS, le frontend d'arcade moderne et 100% personnalisable.

---

## 📦 Structure du Projet

```text
kairos-website/
├── data/                  ← Base de données SQLite (kairoos.db) & migrations
├── src/                   ← Backend Python modulaire
│   ├── app/               ← Serveur HTTP et gestionnaire de requêtes (server.py)
│   ├── data/              ← Connexion base SQLite et migrations (db.py, migrations.py)
│   ├── routes/            ← Routes API & contrôleurs (public, admin, content, roadmap)
│   └── services/          ← Métier & sécurité (auth, ban, security, upload)
├── web/                   ← Frontend moderne découplé
│   ├── index.html         ← Page d'accueil officielle (bilingue FR/EN)
│   ├── admin/             ← Panneau d'administration & modération
│   ├── plugins/           ← Guide plugins, SDK & extensions
│   ├── roadmap/           ← Feuille de route interactive & votes réels
│   ├── themes/            ← Simulateur de thèmes & palettes
│   └── assets/            ← Web Components, CSS, i18n, images & uploads
├── server.py              ← Point d'entrée exécutable minimal
└── README.md
```

---

## 🎨 Design System — Luminous Editorial Tech

Chaque page est un fichier HTML autonome (CSS inline via Tailwind CDN).

### Palette

| Token | Rôle | Valeur |
|-------|------|--------|
| Surface | Fond principal | `#FBFBFA` |
| Elevated | Cartes | `#FFFFFF` |
| Primary Ink | Texte titre | `#111418` |
| Muted Ink | Texte secondaire | `#606770` / `#949CA6` |
| Primary Accent | Accent cobalt | `#1E40AF` |
| Warm Accent | Accent coral | `#F43F5E` |

### Typographie

| Style | Police | Usage |
|-------|--------|-------|
| Display | Space Grotesk | Titres, badges |
| Body | Plus Jakarta Sans | Texte principal |
| Code | JetBrains Mono | Code, labels techniques |

### Composants

- **Nav** : Glassmorphism flottante (rounded-2xl ou pill)
- **Cards** : Rounded-xl, ombres subtiles, hover shadow crescendo
- **Badges** : Pill-shaped, couleurs sémantiques
- **Code blocks** : Fond inverse dark, dots macOS, syntax highlighting

---

## 📄 Pages

| Page | Description | JS |
|------|-------------|-----|
| `index.html` | Hero interactif, kiosk showcase, before/after, thèmes live, FAQ | Lourd (shelf, toggle, lang) |
| `pages/roadmap.html` | Jalons v0.1→v1.0, barres de progression, stats | Aucun |
| `pages/plugins.html` | SDK WASM, manifest, store communautaire, guide publication | Léger (tabs + terminal) |
| `pages/themes.html` | Simulateur de thèmes interactif, palettes, layouts | Lourd (layouts + palettes) |

---

## 🔗 Liens Externes

- **Fonts** : Google Fonts (Plus Jakarta Sans, Space Grotesk, JetBrains Mono)
- **Icons** : Google Material Symbols Outlined
- **CSS** : Tailwind CSS CDN
- **Images** : lh3.googleusercontent.com (AI-generated), Unsplash

---

## 🚀 Lancement

```bash
# Lancement du serveur complet (API + Pages Web statiques)
python server.py

# Administration en ligne de commande
python server.py --admin-list
python server.py --admin-create <username> --password <mot_de_passe> --role superadmin
```

---

## 📋 Design Spec

Le design system complet est dans `Source/luminous_editorial_tech/DESIGN.md` avec :
- 50+ tokens couleur (Material Design 3)
- Échelle typographique complète
- Spacing system (space-xs → space-xl)
- Spécifications de composants (boutons, cards, inputs, badges)

---

Fait avec ❤️ par la communauté KaïroOS.
