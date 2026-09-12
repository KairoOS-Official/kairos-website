/**
 * KaïroOS — Composant Web Footer Réutilisable (<kairo-footer>)
 * Encodage 100% UTF-8 propre (zéro mojibake)
 * Multilingue (FR/EN) et liens dynamiques selon l'arborescence
 */

class KairoFooter extends HTMLElement {
  connectedCallback() {
        const path = window.location.pathname;
    const isSubPage = path.includes('/themes') || path.includes('/plugins') || path.includes('/roadmap') || path.includes('/legal') || path.includes('/pages/') || this.getAttribute('root') === '../';
    const root = isSubPage ? '../' : './';
    const year = new Date().getFullYear();
    const fileSuffix = window.location.protocol === 'file:' ? 'index.html' : '';
    const homeHref = window.location.protocol === 'file:' ? `${root}index.html` : `${root}`;
    const themesHref = `${root}themes/${fileSuffix}`;
    const pluginsHref = `${root}plugins/${fileSuffix}`;
    const roadmapHref = `${root}roadmap/${fileSuffix}`;
    const mentionsHref = `${root}legal/mentions-legales${window.location.protocol === 'file:' ? '.html' : ''}`;
    const privacyHref = `${root}legal/confidentialite${window.location.protocol === 'file:' ? '.html' : ''}`;
    const cookiesHref = `${root}legal/cookies${window.location.protocol === 'file:' ? '.html' : ''}`;

    this.innerHTML = `
      <footer class="w-full bg-white border-t border-slate-200/80 pt-16 pb-12 mt-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-8">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8 pb-12 border-b border-slate-200/70">
            
            <!-- Col 1 : Marque & Description (2 cols) -->
            <div class="lg:col-span-2 space-y-4">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center p-1.5 shadow-sm">
                  <img alt="Kaïro Logo" class="w-full h-full object-contain filter invert" 
                       src="${root}assets/img/logo.png">
                </div>
                <span class="font-display font-bold text-lg tracking-tight text-heading">Kaïro<span class="text-brand-600">OS</span></span>
                <span class="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">v0.1.0 Alpha</span>
              </div>
              <p class="text-xs text-muted leading-relaxed max-w-sm" 
                 data-en="Modular, open-source operating layer crafted with editorial elegance for dedicated gaming setups and arcade cabinets." 
                 data-fr="Système d'exploitation modulaire, libre et axé sur l'élégance éditoriale pour bornes d'arcade et setups gaming dédiés.">
                Système d'exploitation modulaire, libre et axé sur l'élégance éditoriale pour bornes d'arcade et setups gaming dédiés.
              </p>
              <div class="flex items-center gap-2 text-xs font-mono text-slate-500">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span data-en="Free for Personal Use · Pro Operator" data-fr="Gratuit Usage Personnel · Pro Opérateur">Gratuit Usage Personnel · Pro Opérateur</span>
              </div>
            </div>

            <!-- Col 2 : Navigation -->
            <div>
              <h5 class="font-mono text-[11px] font-bold uppercase tracking-wider text-heading mb-4" 
                  data-en="Navigation" data-fr="Navigation">Navigation</h5>
              <ul class="space-y-2.5 text-xs font-medium text-muted">
                <li><a class="hover:text-heading transition-colors" data-en="Home" data-fr="Accueil" href="${homeHref}">Accueil</a></li>
                <li><a class="hover:text-heading transition-colors" data-en="Themes & Layouts" data-fr="Thèmes & Personnalisation" href="${themesHref}">Thèmes & Personnalisation</a></li>
                <li><a class="hover:text-heading transition-colors" data-en="Plugins & Extensions" data-fr="Plugins & Extensions" href="${pluginsHref}">Plugins & Extensions</a></li>
                <li><a class="hover:text-heading transition-colors" data-en="Roadmap" data-fr="Feuille de route" href="${roadmapHref}">Feuille de route</a></li>
              </ul>
            </div>

            <!-- Col 3 : Projet & Ressources -->
            <div>
              <h5 class="font-mono text-[11px] font-bold uppercase tracking-wider text-heading mb-4" 
                  data-en="Project" data-fr="Projet">Projet</h5>
              <ul class="space-y-2.5 text-xs font-medium text-muted">
                <li><a class="hover:text-heading transition-colors" data-en="GitHub Repository" data-fr="Dépôt GitHub" href="https://github.com/KairoOS-Official/KairoOS" rel="noopener noreferrer" target="_blank">Dépôt GitHub</a></li>
                <li><a class="hover:text-heading transition-colors" data-en="Releases & Downloads" data-fr="Téléchargements" href="https://github.com/KairoOS-Official/KairoOS/releases" rel="noopener noreferrer" target="_blank">Téléchargements</a></li>
                <li><a class="hover:text-heading transition-colors" data-en="Report an Issue" data-fr="Signaler un bug" href="https://github.com/KairoOS-Official/KairoOS/issues" rel="noopener noreferrer" target="_blank">Signaler un bug</a></li>
                <li><a class="hover:text-heading transition-colors" data-en="Release Notes" data-fr="Notes de version" href="${roadmapHref}">Notes de version</a></li>
              </ul>
            </div>

            <!-- Col 4 : Communauté -->
            <div>
              <h5 class="font-mono text-[11px] font-bold uppercase tracking-wider text-heading mb-4" 
                  data-en="Community" data-fr="Communauté">Communauté</h5>
              <ul class="space-y-2.5 text-xs font-medium text-muted">
                <li><a class="hover:text-heading transition-colors" href="https://github.com/KairoOS-Official/KairoOS/discussions" rel="noopener noreferrer" target="_blank" data-en="Discussions" data-fr="Discussions">Discussions</a></li>
                <li><a class="hover:text-heading transition-colors" href="https://github.com/KairoOS-Official/KairoOS" rel="noopener noreferrer" target="_blank" data-en="Contribute Code" data-fr="Contribuer au code">Contribuer au code</a></li>
                <li><a class="hover:text-heading transition-colors" href="${pluginsHref}" data-en="Publish a Plugin" data-fr="Publier un plugin">Publier un plugin</a></li>
              </ul>
            </div>

            <!-- Col 5 : Légal (RGPD & Cookies) -->
            <div>
              <h5 class="font-mono text-[11px] font-bold uppercase tracking-wider text-heading mb-4" 
                  data-en="Legal" data-fr="Légal">Légal</h5>
              <ul class="space-y-2.5 text-xs font-medium text-muted">
                <li><a class="hover:text-heading transition-colors" data-en="Legal Notice" data-fr="Mentions légales" href="${mentionsHref}">Mentions légales</a></li>
                <li><a class="hover:text-heading transition-colors" data-en="Privacy Policy" data-fr="Confidentialité" href="${privacyHref}">Confidentialité</a></li>
                <li><a class="hover:text-heading transition-colors" data-en="Cookie Inventory" data-fr="Gestion des cookies" href="${cookiesHref}">Gestion des cookies</a></li>
                <li>
                  <button type="button" id="btn-footer-open-cookies" class="hover:text-heading transition-colors text-brand-600 font-semibold cursor-pointer text-left" data-en="Cookie Preferences" data-fr="Préférences de cookies">
                    Préférences de cookies
                  </button>
                </li>
              </ul>
            </div>

          </div>

          <!-- Bottom bar : Copyright & Moteurs -->
          <div class="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-muted">
            <p>© ${year} KaïroOS Project · Crafted with editorial precision · Free for Personal Use · Pro Operator Available</p>
            <div class="flex items-center gap-4">
              <span class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span data-en="Operational System" data-fr="Système opérationnel">Système opérationnel</span>
              </span>
              <span>·</span>
              <span>Rust 2024</span>
              <span>·</span>
              <span>Tauri 2</span>
            </div>
          </div>

        </div>
      </footer>
    `;

    // Attacher l'événement pour ré-ouvrir la modale de cookies
    this.querySelector('#btn-footer-open-cookies')?.addEventListener('click', () => {
      if (window.openCookieSettings) {
        window.openCookieSettings();
      }
    });

    // Met à jour la langue du footer si i18n est déjà actif
    if (window.kairoI18n) {
      const currentLang = window.kairoI18n.getLang();
      this.querySelectorAll('[data-fr]').forEach(el => {
        const text = el.getAttribute('data-' + currentLang);
        if (text) el.innerHTML = text;
      });
    }
  }

  updateRoot(isSubPage = (window.location.pathname !== '/' && !window.location.pathname.endsWith('index.html'))) {
    const root = isSubPage ? '../' : './';
    const fileSuffix = window.location.protocol === 'file:' ? 'index.html' : '';
    const homeHref = window.location.protocol === 'file:' ? `${root}index.html` : `${root}`;

    this.setAttribute('root', root);
    this.querySelectorAll('a').forEach(link => {
      const fr = link.getAttribute('data-fr');
      if (fr === 'Accueil' || fr === 'Home') link.setAttribute('href', homeHref);
      if (fr && fr.includes('Thèmes')) link.setAttribute('href', `${root}themes/${fileSuffix}`);
      if (fr && fr.includes('Plugins')) link.setAttribute('href', `${root}plugins/${fileSuffix}`);
      if (fr && (fr.includes('Feuille de route') || fr.includes('Notes de version'))) link.setAttribute('href', `${root}roadmap/${fileSuffix}`);
      if (fr === 'Publier un plugin') link.setAttribute('href', `${root}plugins/${fileSuffix}`);
      if (fr === 'Mentions légales') link.setAttribute('href', `${root}legal/mentions-legales${window.location.protocol === 'file:' ? '.html' : ''}`);
      if (fr === 'Confidentialité') link.setAttribute('href', `${root}legal/confidentialite${window.location.protocol === 'file:' ? '.html' : ''}`);
      if (fr === 'Gestion des cookies') link.setAttribute('href', `${root}legal/cookies${window.location.protocol === 'file:' ? '.html' : ''}`);
    });
  }
}

customElements.define('kairo-footer', KairoFooter);
