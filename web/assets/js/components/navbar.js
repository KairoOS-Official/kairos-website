/**
 * KaïroOS — Composant Web Navbar Réutilisable (<kairo-navbar>)
 * Inclut :
 * - Barre flottante glassmorphism
 * - Détection automatique ou manuelle de la page active
 * - Menu mobile complet (Tiroir tactile + animation fluide)
 * - Switcher bilingue FR / EN connecté à i18n
 * - Liens GitHub et Téléchargement directs
 */

class KairoNavbar extends HTMLElement {
  connectedCallback() {
        // Détermination de la racine relative
    const path = window.location.pathname;
    const isSubPage = path.includes('/themes') || path.includes('/plugins') || path.includes('/roadmap') || path.includes('/legal') || path.includes('/pages/') || this.getAttribute('root') === '../';
    const root = isSubPage ? '../' : './';
    const active = this.getAttribute('active') || (isSubPage ? this.detectActivePage() : 'home');

    const fileSuffix = window.location.protocol === 'file:' ? 'index.html' : '';
    const homeHref = window.location.protocol === 'file:' ? `${root}index.html` : `${root}`;
    const themesHref = `${root}themes/${fileSuffix}`;
    const pluginsHref = `${root}plugins/${fileSuffix}`;
    const roadmapHref = `${root}roadmap/${fileSuffix}`;

    const downloadHref = active === 'home' ? '#download' : 'https://github.com/KairoOS-Official/KairoOS/releases';
    const downloadTarget = active === 'home' ? '' : 'target="_blank" rel="noopener noreferrer"';

    this.innerHTML = `
      <header class="fixed top-4 left-0 right-0 z-[100] px-3 sm:px-8 max-w-7xl mx-auto">
        <div class="h-16 w-full rounded-2xl bg-white/85 backdrop-blur-xl border border-black/5 shadow-subtle px-4 sm:px-5 flex items-center justify-between gap-3">
          
          <!-- Logo & Marque -->
          <a class="flex items-center gap-3 group shrink-0" href="${homeHref}">
            <div class="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center p-1.5 shadow-sm group-hover:scale-105 transition-transform">
              <img alt="KaïroOS Logo" class="w-full h-full object-contain filter invert" src="${root}assets/img/logo.png">
            </div>
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5">
                <span class="font-display font-bold text-lg tracking-tight text-heading">Kaïro<span class="text-brand-600">OS</span></span>
                <span class="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">Alpha 0.1</span>
              </div>
              <span class="text-[11px] text-muted -mt-0.5 font-medium hidden sm:inline" data-en="Arcade Operating Layer" data-fr="Couche Arcade pour PC">Couche Arcade pour PC</span>
            </div>
          </a>

          <!-- Menu Desktop -->
          <nav class="hidden lg:flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl border border-slate-200/60 text-sm font-medium">
            <a class="nav-link px-3.5 py-1.5 rounded-lg transition-all ${active === 'home' ? 'text-heading bg-white shadow-xs font-semibold' : 'text-slate-700 hover:text-heading hover:bg-white/80'}" 
               data-en="Home" data-fr="Accueil" href="${homeHref}">Accueil</a>
            <a class="nav-link px-3.5 py-1.5 rounded-lg transition-all ${active === 'themes' ? 'text-heading bg-white shadow-xs font-semibold' : 'text-slate-700 hover:text-heading hover:bg-white/80'}" 
               data-en="Themes" data-fr="Thèmes" href="${themesHref}">Thèmes</a>
            <a class="nav-link px-3.5 py-1.5 rounded-lg transition-all ${active === 'plugins' ? 'text-heading bg-white shadow-xs font-semibold' : 'text-slate-700 hover:text-heading hover:bg-white/80'}" 
               data-en="Plugins" data-fr="Plugins" href="${pluginsHref}">Plugins</a>
            <a class="nav-link px-3.5 py-1.5 rounded-lg transition-all ${active === 'roadmap' ? 'text-heading bg-white shadow-xs font-semibold' : 'text-slate-700 hover:text-heading hover:bg-white/80'}" 
               data-en="Roadmap" data-fr="Roadmap" href="${roadmapHref}">Roadmap</a>
          </nav>

          <!-- Contrôles Droite (Langue + GitHub + Download + Hamburger Mobile) -->
          <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <!-- Switcher Bilingue Interactif -->
            <div class="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs font-semibold shadow-xs">
              <button type="button" class="btn-lang-fr px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-slate-500 hover:text-heading" id="nav-btn-fr" title="Passer en Français">
                <span>🇫🇷</span>
                <span class="hidden xs:inline sm:inline">FR</span>
              </button>
              <button type="button" class="btn-lang-en px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-slate-500 hover:text-heading" id="nav-btn-en" title="Switch to English">
                <span>🇬🇧</span>
                <span class="hidden xs:inline sm:inline">EN</span>
              </button>
            </div>

            <!-- GitHub Link -->
            <a class="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/80 transition-all shadow-xs" 
               href="https://github.com/KairoOS-Official/KairoOS" rel="noopener noreferrer" target="_blank">
              <span class="material-symbols-outlined text-[16px]">code</span>
              <span>GitHub</span>
            </a>

            <!-- CTA Télécharger -->
            <a class="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-brand-600 transition-all shadow-subtle hover:scale-[1.02]" 
               href="${downloadHref}" ${downloadTarget}>
              <span class="material-symbols-outlined text-[16px]">download</span>
              <span data-en="Download" data-fr="Télécharger">Télécharger</span>
            </a>

            <!-- Bouton Hamburger Mobile -->
            <button type="button" class="lg:hidden p-2 rounded-xl text-slate-700 hover:text-heading hover:bg-slate-100 border border-slate-200/70 transition-colors" 
                    id="mobile-menu-btn" aria-label="Menu principal">
              <span class="material-symbols-outlined text-[24px] block" id="hamburger-icon">menu</span>
            </button>
          </div>
        </div>

        <!-- Tiroir de Navigation Mobile -->
        <div class="lg:hidden fixed inset-x-4 top-24 bg-white/95 backdrop-blur-2xl rounded-2xl border border-slate-200 shadow-float p-5 transition-all duration-300 opacity-0 pointer-events-none -translate-y-4 z-40" 
             id="mobile-drawer">
          <div class="flex flex-col gap-2 font-medium text-sm">
            <a class="mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all ${active === 'home' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}" 
               data-en="Home" data-fr="Accueil" href="${homeHref}">
              <span>Accueil</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
            </a>
            <a class="mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all ${active === 'themes' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}" 
               data-en="Themes & Personalization" data-fr="Thèmes & Personnalisation" href="${themesHref}">
              <span>Thèmes & Personnalisation</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
            </a>
            <a class="mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all ${active === 'plugins' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}" 
               data-en="Plugins & Extensions" data-fr="Plugins & Extensions" href="${pluginsHref}">
              <span>Plugins & Extensions</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
            </a>
            <a class="mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all ${active === 'roadmap' ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}" 
               data-en="Roadmap" data-fr="Feuille de route" href="${roadmapHref}">
              <span>Feuille de route</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
            </a>

            <div class="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between">
              <a class="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-brand-600 py-2" 
                 href="https://github.com/KairoOS-Official/KairoOS" rel="noopener noreferrer" target="_blank">
                <span class="material-symbols-outlined text-base">code</span>
                <span>GitHub Source</span>
              </a>
              <span class="font-mono text-[10px] text-slate-400">v0.1.0 Alpha</span>
            </div>
          </div>
        </div>

        <!-- Overlay flou pour fermer le menu mobile -->
        <div class="fixed inset-0 bg-slate-900/20 backdrop-blur-xs -z-10 opacity-0 pointer-events-none transition-opacity duration-300" 
             id="mobile-overlay"></div>
      </header>
    `;

    this.setupInteractions();
  }

    detectActivePage() {
    const p = window.location.pathname;
    if (p.includes('themes')) return 'themes';
    if (p.includes('plugins')) return 'plugins';
    if (p.includes('roadmap')) return 'roadmap';
    return 'home';
  }

  closeMobileMenu() {
    if (typeof this._toggleMenu === 'function') {
      this._toggleMenu(false);
    }
  }

  setActive(active, isSubPage = window.location.pathname.includes('/pages/')) {
    this.setAttribute('active', active);
    const root = isSubPage ? '../' : './';

    // Mettre à jour le logo
    const logoLink = this.querySelector('a.group');
    if (logoLink) logoLink.setAttribute('href', `${root}index.html`);

    // Mettre à jour les liens Desktop
    const desktopLinks = this.querySelectorAll('nav .nav-link');
    const pageMap = {
      'Accueil': `${root}index.html`,
      'Thèmes': `${root}themes/`,
      'Thèmes & Personnalisation': `${root}themes/`,
      'Plugins': `${root}plugins/`,
      'Plugins & Extensions': `${root}plugins/`,
      'Roadmap': `${root}roadmap/`,
      'Feuille de route': `${root}roadmap/`,
      'Home': `${root}index.html`,
      'Themes': `${root}themes/`,
      'Themes & Personalization': `${root}themes/`
    };

    desktopLinks.forEach(link => {
      const fr = link.getAttribute('data-fr');
      if (pageMap[fr]) {
        link.setAttribute('href', pageMap[fr]);
      }
      const isMatch = (active === 'home' && (fr === 'Accueil' || fr === 'Home')) ||
                      (active === 'themes' && (fr === 'Thèmes' || fr === 'Themes')) ||
                      (active === 'plugins' && fr === 'Plugins') ||
                      (active === 'roadmap' && fr === 'Roadmap');

      if (isMatch) {
        link.className = 'nav-link px-3.5 py-1.5 rounded-lg transition-all text-heading bg-white shadow-xs font-semibold';
      } else {
        link.className = 'nav-link px-3.5 py-1.5 rounded-lg transition-all text-slate-700 hover:text-heading hover:bg-white/80';
      }
    });

    // Mettre à jour les liens Mobile
    const mobileLinks = this.querySelectorAll('#mobile-drawer .mobile-nav-link');
    mobileLinks.forEach(link => {
      const fr = link.getAttribute('data-fr');
      if (pageMap[fr]) {
        link.setAttribute('href', pageMap[fr]);
      }
      const isMatch = (active === 'home' && (fr === 'Accueil' || fr === 'Home')) ||
                      (active === 'themes' && fr && fr.includes('Thèmes')) ||
                      (active === 'plugins' && fr && fr.includes('Plugins')) ||
                      (active === 'roadmap' && fr && fr.includes('Feuille de route'));

      if (isMatch) {
        link.className = 'mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all bg-brand-50 text-brand-700 font-bold';
      } else {
        link.className = 'mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all text-slate-700 hover:bg-slate-50';
      }
    });
  }

  setupInteractions() {
    // 1. Gestion du Drawer Mobile
    const btnMenu = this.querySelector('#mobile-menu-btn');
    const drawer = this.querySelector('#mobile-drawer');
    const overlay = this.querySelector('#mobile-overlay');
    const icon = this.querySelector('#hamburger-icon');

    let isOpen = false;

    const toggleMenu = (open) => {
      isOpen = typeof open === 'boolean' ? open : !isOpen;
      if (isOpen) {
        drawer.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-4');
        drawer.classList.add('opacity-100', 'translate-y-0');
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        overlay.classList.add('opacity-100');
        icon.textContent = 'close';
      } else {
        drawer.classList.add('opacity-0', 'pointer-events-none', '-translate-y-4');
        drawer.classList.remove('opacity-100', 'translate-y-0');
        overlay.classList.add('opacity-0', 'pointer-events-none');
        overlay.classList.remove('opacity-100');
        icon.textContent = 'menu';
      }
    };

    this._toggleMenu = toggleMenu;

    if (btnMenu) {
      btnMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => toggleMenu(false));
    }

    // Fermeture avec la touche Échap
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        toggleMenu(false);
      }
    });

    // 2. Gestion du Sélecteur de Langue
    const btnFr = this.querySelector('#nav-btn-fr');
    const btnEn = this.querySelector('#nav-btn-en');

    const updateLangUI = (lang) => {
      if (!btnFr || !btnEn) return;
      if (lang === 'fr') {
        btnFr.classList.add('bg-white', 'text-heading', 'shadow-xs', 'font-bold');
        btnFr.classList.remove('text-slate-500');
        btnEn.classList.remove('bg-white', 'text-heading', 'shadow-xs', 'font-bold');
        btnEn.classList.add('text-slate-500');
      } else {
        btnEn.classList.add('bg-white', 'text-heading', 'shadow-xs', 'font-bold');
        btnEn.classList.remove('text-slate-500');
        btnFr.classList.remove('bg-white', 'text-heading', 'shadow-xs', 'font-bold');
        btnFr.classList.add('text-slate-500');
      }
    };

    if (window.kairoI18n) {
      updateLangUI(window.kairoI18n.getLang());
      window.kairoI18n.onChange(updateLangUI);

      if (btnFr) btnFr.addEventListener('click', () => window.kairoI18n.setLang('fr'));
      if (btnEn) btnEn.addEventListener('click', () => window.kairoI18n.setLang('en'));
    }
  }
}

customElements.define('kairo-navbar', KairoNavbar);
