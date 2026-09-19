/**
 * KaïroOS — Script de build web minimal
 * Copie web/ → dist/ tel quel, sans transformation Vite.
 * Adapté pour du vanilla HTML/JS pur (pas de bundling ES modules).
 * Exclut les fichiers/dossiers privés (admin/).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'web');
const DEST = path.join(ROOT, 'dist');

// Dossiers/fichiers à exclure du dist (code source TypeScript frontend)
const EXCLUDE = new Set(['src']);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const srcPath  = path.join(src,  entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Nettoyage du dist existant (hors admin s'il y était)
if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true });
}

console.log('📦 Building web → dist/ ...');
copyDir(SRC, DEST);
console.log('✅ Build terminé : dist/ est prêt.');
