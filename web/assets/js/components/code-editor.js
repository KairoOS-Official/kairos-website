/**
 * KaïroOS — Composant Web Éditeur de Code / Console Développeur (<kairo-code-editor>)
 * Unifie l'expérience visuelle et interactive entre Thèmes et Plugins :
 * - Onglets multi-fichiers avec icônes de langages
 * - Numérotation des lignes & coloration syntaxique soignée
 * - Bouton "Copier le code" avec toast
 * - Bouton interactif "Simuler / Valider" avec console de sortie animée
 * - Barre de statut type IDE moderne (VS Code / Zed)
 */

class KairoCodeEditor extends HTMLElement {
  connectedCallback() {
    // Récupération des fichiers déclarés
    const fileElements = Array.from(this.querySelectorAll('[data-filename]'));
    if (!fileElements.length) return;

    this.files = fileElements.map((el, index) => ({
      index,
      filename: el.getAttribute('data-filename') || `file_${index + 1}`,
      lang: el.getAttribute('data-lang') || 'JSON',
      badge: el.getAttribute('data-badge') || '',
      content: el.innerHTML.trim(),
      rawCode: el.textContent.trim(),
      active: el.hasAttribute('data-active') || index === 0
    }));

    this.activeIndex = this.files.findIndex(f => f.active);
    if (this.activeIndex === -1) this.activeIndex = 0;

    this.editorId = 'kairo-editor-' + Math.random().toString(36).substring(2, 8);
    this.render();
  }

  getFileIcon(filename) {
    if (filename.endsWith('.json')) return '<span class="text-amber-400 font-mono text-xs font-bold">{ }</span>';
    if (filename.endsWith('.css')) return '<span class="text-sky-400 font-mono text-xs font-bold">#</span>';
    if (filename.endsWith('.rs')) return '<span class="text-orange-400 font-mono text-xs font-bold">🦀</span>';
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return '<span class="text-blue-400 font-mono text-xs font-bold">TS</span>';
    if (filename.endsWith('.md')) return '<span class="text-slate-400 font-mono text-xs font-bold">M↓</span>';
    return '<span class="material-symbols-outlined text-xs text-slate-400">code</span>';
  }

  render() {
    const currentFile = this.files[this.activeIndex];
    const lines = currentFile.content.split('\n');

    // Génération des numéros de ligne
    const lineNumbersHtml = lines.map((_, i) => `<span class="select-none text-slate-600 block text-right pr-4 font-mono text-[12px] leading-6">${i + 1}</span>`).join('');

    // Génération des lignes de code
    const codeLinesHtml = lines.map(line => `<div class="font-mono text-[13px] leading-6 whitespace-pre">${line || '&nbsp;'}</div>`).join('');

    this.innerHTML = `
      <div class="rounded-2xl overflow-hidden shadow-2xl bg-[#0d1117] text-slate-200 border border-slate-800/80 transition-all duration-300">
        
        <!-- En-tête macOS & Onglets -->
        <div class="flex flex-wrap items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-slate-800/80 gap-2">
          
          <!-- Boutons de fenêtre macOS & Onglets -->
          <div class="flex items-center gap-4">
            <!-- macOS Dots -->
            <div class="flex items-center gap-2 pr-2 border-r border-slate-800">
              <span class="w-3 h-3 rounded-full bg-[#ff5f56] inline-block shadow-xs hover:opacity-80 transition-opacity cursor-pointer" title="Fermer"></span>
              <span class="w-3 h-3 rounded-full bg-[#ffbd2e] inline-block shadow-xs hover:opacity-80 transition-opacity cursor-pointer" title="Minimiser"></span>
              <span class="w-3 h-3 rounded-full bg-[#27c93f] inline-block shadow-xs hover:opacity-80 transition-opacity cursor-pointer" title="Plein écran"></span>
            </div>

            <!-- Liste des Onglets Fichiers -->
            <div class="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5" id="${this.editorId}-tabs">
              ${this.files.map((file, idx) => `
                <button type="button" 
                        class="tab-file-btn px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 transition-all ${idx === this.activeIndex ? 'bg-[#0d1117] text-white shadow-xs font-semibold border border-slate-700/60' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}"
                        data-file-index="${idx}">
                  ${this.getFileIcon(file.filename)}
                  <span>${file.filename}</span>
                  ${file.badge ? `<span class="px-1.5 py-0.2 rounded text-[10px] bg-brand-500/20 text-brand-300 font-sans">${file.badge}</span>` : ''}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Actions En-tête (Simuler / Copier) -->
          <div class="flex items-center gap-2">
            <button type="button" 
                    class="btn-run-sim px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all flex items-center gap-1.5" 
                    id="${this.editorId}-btn-run"
                    title="Tester la syntaxe et exécuter la simulation">
              <span class="material-symbols-outlined text-[15px]">play_arrow</span>
              <span data-en="Validate & Run" data-fr="Tester / Valider">Tester / Valider</span>
            </button>

            <button type="button" 
                    class="btn-copy-code px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all flex items-center gap-1 border border-slate-700/80" 
                    id="${this.editorId}-btn-copy"
                    title="Copier le code">
              <span class="material-symbols-outlined text-[15px]">content_copy</span>
              <span class="hidden sm:inline" data-en="Copy" data-fr="Copier">Copier</span>
            </button>
          </div>
        </div>

        <!-- Corps de l'Éditeur (Numéros de ligne + Code) -->
        <div class="flex overflow-x-auto p-4 bg-[#0d1117] text-slate-300 font-mono text-xs max-h-[460px] scrollbar-thin">
          <div class="border-r border-slate-800/80 select-none opacity-50 py-1" id="${this.editorId}-lines">
            ${lineNumbersHtml}
          </div>
          <div class="pl-4 flex-1 overflow-x-auto py-1 text-slate-100" id="${this.editorId}-code">
            ${codeLinesHtml}
          </div>
        </div>

        <!-- Terminal de Sortie Interactif Déroulant (Affiché au clic sur "Tester") -->
        <div class="hidden border-t border-slate-800 bg-[#090d13] p-3 text-xs font-mono transition-all duration-300" id="${this.editorId}-output">
          <div class="flex items-center justify-between text-slate-400 pb-2 mb-2 border-b border-slate-800/60 text-[11px]">
            <span class="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Console KaïroOS Runtime
            </span>
            <button type="button" class="hover:text-white" id="${this.editorId}-output-close">Fermer ✕</button>
          </div>
          <div class="space-y-1 text-slate-300" id="${this.editorId}-output-lines">
            <!-- Lignes de logs injectées dynamiquement -->
          </div>
        </div>

        <!-- Barre de Statut Basse (IDE Style) -->
        <div class="px-4 py-2 bg-[#161b22] border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5 text-emerald-400">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span data-en="Schema Validated" data-fr="Schéma Validé">Schéma Validé</span>
            </span>
            <span class="text-slate-600">·</span>
            <span class="text-slate-400">${currentFile.filename}</span>
          </div>
          <div class="flex items-center gap-3 text-slate-400">
            <span>UTF-8</span>
            <span>Tab: 2</span>
            <span class="text-brand-400 font-semibold">${currentFile.lang}</span>
            <span class="hidden sm:inline">Ln ${lines.length}, Col 1</span>
          </div>
        </div>

      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // 1. Changement d'onglet
    const tabs = this.querySelectorAll('.tab-file-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const idx = parseInt(tab.getAttribute('data-file-index'), 10);
        if (!isNaN(idx) && idx !== this.activeIndex) {
          this.activeIndex = idx;
          this.render();
        }
      });
    });

    // 2. Bouton Copier
    const btnCopy = this.querySelector(`#${this.editorId}-btn-copy`);
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const currentFile = this.files[this.activeIndex];
        if (window.copyCode) {
          window.copyCode(currentFile.rawCode, btnCopy);
        } else {
          navigator.clipboard.writeText(currentFile.rawCode);
        }
      });
    }

    // 3. Bouton "Tester / Valider" (Console de simulation)
    const btnRun = this.querySelector(`#${this.editorId}-btn-run`);
    const outputDrawer = this.querySelector(`#${this.editorId}-output`);
    const outputLines = this.querySelector(`#${this.editorId}-output-lines`);
    const outputClose = this.querySelector(`#${this.editorId}-output-close`);

    if (btnRun && outputDrawer && outputLines) {
      btnRun.addEventListener('click', () => {
        outputDrawer.classList.remove('hidden');
        outputLines.innerHTML = '';

        const file = this.files[this.activeIndex];
        const now = new Date().toTimeString().split(' ')[0] + '.' + Math.floor(Math.random() * 900 + 100);

        const isPlugin = file.filename.includes('plugin') || file.filename.endsWith('.rs');
        const isTheme = file.filename.includes('theme') || file.filename.endsWith('.css');

        let logs = [];
        if (isPlugin) {
          logs = [
            `[${now}] <span class="text-slate-400">[kairo:core]</span> Parsing manifest: <strong class="text-sky-300">${file.filename}</strong>...`,
            `[${now}] <span class="text-slate-400">[kairo:sandbox]</span> Checking permissions and Win32 hardware sandbox isolation... OK`,
            `[${now}] <span class="text-emerald-400 font-bold">[kairo:wasm] ✓ Plugin binary verified! Ready for zero-copy 60 FPS runtime dispatch.</span>`
          ];
        } else if (isTheme) {
          logs = [
            `[${now}] <span class="text-slate-400">[kairo:theme]</span> Compiling layout tokens & CSS variables...`,
            `[${now}] <span class="text-slate-400">[kairo:renderer]</span> Direct3D 12 GPU buffer composited at 120 Hz.`,
            `[${now}] <span class="text-emerald-400 font-bold">[kairo:hot-reload] ✓ Theme live applied without restarting session!</span>`
          ];
        } else {
          logs = [
            `[${now}] <span class="text-slate-400">[kairo:validator]</span> Checking ${file.filename} against schema v1.2...`,
            `[${now}] <span class="text-emerald-400 font-bold">[kairo:validator] ✓ All constraints satisfied (0 errors, 0 warnings).</span>`
          ];
        }

        logs.forEach((log, i) => {
          setTimeout(() => {
            const p = document.createElement('p');
            p.innerHTML = log;
            outputLines.appendChild(p);
          }, i * 220);
        });

        if (window.showToast) {
          window.showToast(`Validation réussie pour ${file.filename} !`, 'success');
        }
      });
    }

    if (outputClose && outputDrawer) {
      outputClose.addEventListener('click', () => {
        outputDrawer.classList.add('hidden');
      });
    }
  }
}

customElements.define('kairo-code-editor', KairoCodeEditor);
