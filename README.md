# 🕹️ KaïroOS — Site Web Officiel

Site de présentation de KaïroOS, le frontend d'arcade moderne et 100% personnalisable.

---

## 📦 Structure

```
kairos-website/
├── index.html                    ← Page d'accueil (bilingue FR/EN)
├── pages/
│   ├── roadmap.html              ← Feuille de route publique
│   ├── plugins.html              ← Guide plugins & extensions
│   └── themes.html               ← Thèmes & personnalisation
├── assets/
│   └── images/                   ← Screenshots previews
│       ├── home-preview.png
│       ├── roadmap-preview.png
│       ├── plugins-preview.png
│       └── themes-preview.png
├── Source/                       ← Sources originales (à garder)
│   ├── kairoos_accueil_site_pur/
│   ├── kairoos_feuille_de_route_roadmap/
│   ├── kairoos_plugins_extensions_store_guide_de_publication/
│   ├── kairoos_th_mes_personnalisation/
│   └── luminous_editorial_tech/  ← Design system (DESIGN.md)
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
# Ouvrir directement
open index.html

# Ou avec un serveur local
npx serve .
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
