<p align="center">
  <img src="web/assets/img/logo.png?v=2" alt="KaïroOS" width="160" />
</p>

# 🕹️ KaïroOS — Site Web Officiel & API

Site de présentation officiel et plateforme communautaire de **KaïroOS**, le système d'arcade moderne 100% personnalisable.

---

## 📦 Structure Moderne du Projet

```text
kairos-website/
├── data/                         ← Base de données SQLite locale (kairoos.db)
├── apps/
│   ├── api/                      ← Backend API Fastify + TypeScript
│   │   └── src/
│   │       ├── db/               ← Client de données universel (SQLite local / Supabase PostgreSQL)
│   │       ├── modules/          ← Modules fonctionnels (auth, public, roadmap, content, admin)
│   │       ├── server.ts         ← Point d'entrée serveur Fastify
│   │       └── server.test.ts    ← Suite de tests d'intégration Vitest
│   └── web/                      ← Frontend Multi-pages & Composants React 19
│       └── src/
│           ├── components/       ← Îlots React 19 (RoadmapVoteApp, ThemeSimulator, Admin)
│           ├── entries/          ← Points de montage
│           └── index.ts          ← Baril d'export TypeScript
├── web/                          ← Pages HTML statiques, assets, styles et scripts
│   ├── index.html                ← Accueil officiel bilingue (FR/EN)
│   ├── admin/                    ← Portail d'administration sécurisé
│   ├── roadmap/                  ← Feuille de route & votes communautaires réels
│   ├── themes/                   ← Vitrine thèmes & simulateur CRT
│   ├── plugins/                  ← Catalogue extensions & SDK
│   └── assets/                   ← Polices locales WOFF2, CSS, icônes & images
├── packages/
│   └── shared/                   ← Schémas Zod & DTOs partagés
├── dist/                         ← Bundle de production compilé ultra-rapide
├── vite.config.ts                ← Configuration multi-pages Vite + Proxy API
├── tsconfig.json                 ← Typage TypeScript strict
└── README.md
```

---

## 🚀 Démarrage & Commandes

Le projet fonctionne avec **Node.js (>= 20)** et **npm** :

### 1. Installation des dépendances
```bash
npm install
```

### 2. Développement
Vous pouvez lancer le frontend et l'API de manière indépendante ou conjointe :

```bash
# Lancement de l'API Backend Fastify (Port 3000)
npm run dev:api

# Lancement du Frontend Vite avec Hot-Reload (Port 5173 avec proxy /api -> :3000)
npm run dev:web
# ou simplement
npm run dev
```

### 3. Tests & Contrôle de qualité
```bash
# Exécution du typecheck TypeScript strict (0 erreur)
npm run typecheck

# Exécution des tests d'intégration Vitest (48 tests)
npm test
```

### 4. Build & Production
```bash
# Compilation de la production (TypeScript + Vite Multi-pages vers dist/)
npm run build

# Démarrage du serveur unifié Fastify en production (sert API + Frontend sur le Port 3000)
npm start
```

---

## ⚙️ Configuration & Adaptabilité (`.env`)

Copiez le fichier d'exemple pour configurer votre environnement :
```bash
cp .env.example .env
```

### 1. Ports du système
- **`PORT=3000`** : Port du serveur principal Fastify.
- **`VITE_PORT=5173`** : Port du serveur Vite en développement.

### 2. Base de données adaptable (SQLite Local ↔ Supabase PostgreSQL)
Vous pouvez basculer d'une base SQLite locale à une instance Cloud Supabase sans modifier le code :
```env
# Mode SQLite local (par défaut) :
DB_DRIVER=sqlite
SQLITE_DB_PATH=data/kairoos.db

# Mode Cloud Supabase (PostgreSQL) :
# DB_DRIVER=supabase
# DATABASE_URL=postgres://postgres:[VOTRE_MDP]@db.[PROJET].supabase.co:5432/postgres
```

### 3. Personnalisation de l'accès Admin
Vous pouvez dissimuler l'URL d'administration ou la faire tourner sur un port réseau distinct :
```env
# Modification de l'URL admin (ex: /secret-admin au lieu de /admin) :
ADMIN_PATH=secret-admin

# Isolation du panneau admin sur un port dédié :
# ADMIN_PORT=3001
```

---

<div align="center">

**FlowCreativeStudio** · Florian ([@NayrolfRdgs](https://github.com/NayrolfRdgs)) · Discord: `nayrolf_rdgs`

</div>

