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
                <span class="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 hidden sm:inline-block">Alpha 0.1</span>
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
            <!-- Sélecteur de Thème (burger uniquement) -->
            <button type="button" class="hidden items-center justify-center w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-white/10 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-all shadow-xs" 
                    id="nav-btn-theme" title="Changer de thème (Système PC / Sombre / Clair)" aria-label="Changer de thème">
              <span class="flex items-center justify-center" id="nav-theme-icon">
                <svg class="w-4 h-4 text-slate-700 dark:text-slate-300 fill-current" viewBox="0 0 24 24"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
              </span>
            </button>

            <!-- Switcher Bilingue (burger uniquement) -->
            <div class="hidden items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-white/10 text-xs font-semibold shadow-xs">
              <button type="button" class="btn-lang-fr px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-heading" id="nav-btn-fr" title="Passer en Français">
                <span>🇫🇷</span>
                <span class="hidden xs:inline sm:inline">FR</span>
              </button>
              <button type="button" class="btn-lang-en px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-heading" id="nav-btn-en" title="Switch to English">
                <span>🇬🇧</span>
                <span class="hidden xs:inline sm:inline">EN</span>
              </button>
            </div>

            <!-- GitHub Link (desktop uniquement, mobile : dans le burger) -->
            <a class="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-white/10 transition-all shadow-xs" 
               href="https://github.com/KairoOS-Official/KairoOS" rel="noopener noreferrer" target="_blank">
              <span class="material-symbols-outlined text-[16px]">code</span>
              <span>GitHub</span>
            </a>

            <!-- CTA Télécharger (desktop uniquement, mobile : dans le burger) -->
            <a class="hidden lg:inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-brand-600 transition-all shadow-subtle hover:scale-[1.02]" 
               href="${downloadHref}" ${downloadTarget}>
              <span class="material-symbols-outlined text-[16px]">download</span>
              <span data-en="Download" data-fr="Télécharger">Télécharger</span>
            </a>

            <!-- Bouton Hamburger Mobile -->
            <button type="button" class="lg:hidden p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-heading hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-white/10 transition-colors" 
                    id="mobile-menu-btn" aria-label="Menu principal">
              <span class="flex items-center justify-center w-6 h-6" id="hamburger-icon">
                <svg class="w-6 h-6 text-slate-700 dark:text-slate-200 fill-current" viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
              </span>
            </button>
          </div>
        </div>

        <!-- Tiroir de Navigation Mobile -->
        <div class="lg:hidden fixed inset-x-4 top-24 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-2xl border border-slate-200 dark:border-white/10 shadow-float p-5 transition-all duration-300 opacity-0 pointer-events-none -translate-y-4 z-40" 
             id="mobile-drawer">
          <div class="flex flex-col gap-2 font-medium text-sm">
            <a class="mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all ${active === 'home' ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'}" 
               data-en="Home" data-fr="Accueil" href="${homeHref}">
              <span>Accueil</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
            </a>
            <a class="mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all ${active === 'themes' ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'}" 
               data-en="Themes & Personalization" data-fr="Thèmes & Personnalisation" href="${themesHref}">
              <span>Thèmes & Personnalisation</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
            </a>
            <a class="mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all ${active === 'plugins' ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'}" 
               data-en="Plugins & Extensions" data-fr="Plugins & Extensions" href="${pluginsHref}">
              <span>Plugins & Extensions</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
            </a>
            <a class="mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all ${active === 'roadmap' ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'}" 
               data-en="Roadmap" data-fr="Feuille de route" href="${roadmapHref}">
              <span>Feuille de route</span>
              <span class="material-symbols-outlined text-sm">chevron_right</span>
            </a>

            <!-- Actions déplacées de la top bar (téléphone) -->
            <div class="grid grid-cols-2 gap-2 pt-1">
              <a class="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-brand-600 transition-all shadow-subtle"
                 href="${downloadHref}" ${downloadTarget}>
                <span class="material-symbols-outlined text-[16px]">download</span>
                <span data-en="Download" data-fr="Télécharger">Télécharger</span>
              </a>
              <a class="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-white/10 transition-all shadow-xs"
                 href="https://github.com/KairoOS-Official/KairoOS" rel="noopener noreferrer" target="_blank">
                <span class="material-symbols-outlined text-[16px]">code</span>
                <span>GitHub</span>
              </a>
            </div>

            <!-- Langue (déplacée de la top bar) -->
            <div class="flex items-center justify-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-white/10 text-xs font-semibold">
              <button type="button" class="px-3 py-1.5 rounded-lg transition-all flex-1 flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-heading" id="mobile-btn-fr" title="Passer en Français">
                <span>🇫🇷</span>
                <span>FR</span>
              </button>
              <button type="button" class="px-3 py-1.5 rounded-lg transition-all flex-1 flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-heading" id="mobile-btn-en" title="Switch to English">
                <span>🇬🇧</span>
                <span>EN</span>
              </button>
            </div>

            <div class="pt-3 mt-2 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
              <button type="button" class="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800" id="mobile-btn-theme">
                <span class="flex items-center justify-center" id="mobile-theme-icon">
                  <svg class="w-4 h-4 text-slate-700 dark:text-slate-300 fill-current" viewBox="0 0 24 24"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>
                </span>
                <span id="mobile-theme-label" data-en="Theme: Auto (PC)" data-fr="Thème : Auto (PC)">Thème : Auto (PC)</span>
              </button>
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

    // Easter egg Konami global : un seul composant partagé pour tout le site
    if (!window.__kairoKonamiLoaded) {
      window.__kairoKonamiLoaded = true;
      var kc = document.createElement('script');
      kc.src = root + 'assets/js/components/konami-cheat.js';
      kc.defer = true;
      document.head.appendChild(kc);
    }
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
        link.className = 'mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 font-bold';
      } else {
        link.className = 'mobile-nav-link flex items-center justify-between p-3 rounded-xl transition-all text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60';
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

    const SVG_BURGER = `<svg class="w-6 h-6 text-slate-700 dark:text-slate-200 fill-current" viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>`;
    const SVG_CLOSE = `<svg class="w-6 h-6 text-slate-700 dark:text-slate-200 fill-current" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;

    const toggleMenu = (open) => {
      isOpen = typeof open === 'boolean' ? open : !isOpen;
      if (isOpen) {
        drawer.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-4');
        drawer.classList.add('opacity-100', 'translate-y-0');
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        overlay.classList.add('opacity-100');
        icon.innerHTML = SVG_CLOSE;
      } else {
        drawer.classList.add('opacity-0', 'pointer-events-none', '-translate-y-4');
        drawer.classList.remove('opacity-100', 'translate-y-0');
        overlay.classList.add('opacity-0', 'pointer-events-none');
        overlay.classList.remove('opacity-100');
        icon.innerHTML = SVG_BURGER;
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

    // 2. Gestion du Sélecteur de Langue (top bar + burger)
    const langBtns = [
      [this.querySelector('#nav-btn-fr'), 'fr'],
      [this.querySelector('#nav-btn-en'), 'en'],
      [this.querySelector('#mobile-btn-fr'), 'fr'],
      [this.querySelector('#mobile-btn-en'), 'en'],
    ];

    const updateLangUI = (lang) => {
      langBtns.forEach(([btn, code]) => {
        if (!btn) return;
        const on = code === lang;
        btn.classList.toggle('bg-white', on);
        btn.classList.toggle('text-heading', on);
        btn.classList.toggle('shadow-xs', on);
        btn.classList.toggle('font-bold', on);
        btn.classList.toggle('text-slate-500', !on);
      });
    };

    if (window.kairoI18n) {
      updateLangUI(window.kairoI18n.getLang());
      window.kairoI18n.onChange(updateLangUI);

      langBtns.forEach(([btn, code]) => {
        if (btn) btn.addEventListener('click', () => window.kairoI18n.setLang(code));
      });
    }

    // 3. Gestion du Sélecteur de Thème (Auto PC / Sombre / Clair)
    const btnTheme = this.querySelector('#nav-btn-theme');
    const iconTheme = this.querySelector('#nav-theme-icon');
    const mobileBtnTheme = this.querySelector('#mobile-btn-theme');
    const mobileIconTheme = this.querySelector('#mobile-theme-icon');
    const mobileLabelTheme = this.querySelector('#mobile-theme-label');

    // SVGs vectoriels universels (ne dépendent d'aucune police ni ligature)
    const ICONS = {
      sun: `<svg class="w-4 h-4 text-amber-500 fill-current" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 00-1.41-1.41l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 00-1.41-1.41l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>`,
      moon: `<svg class="w-4 h-4 text-indigo-400 fill-current" viewBox="0 0 24 24"><path d="M12.3 2a10 10 0 00-1.9 19.8 9.9 9.9 0 009.6-6.5 1 1 0 00-1.2-1.3 8 8 0 01-10-10 1 1 0 00-1.3-1.2A10 10 0 0012.3 2z"/></svg>`,
      autoDark: `<svg class="w-4 h-4 text-indigo-400 fill-current" viewBox="0 0 24 24"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
      autoLight: `<svg class="w-4 h-4 text-slate-700 dark:text-slate-300 fill-current" viewBox="0 0 24 24"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`
    };

    const updateThemeUI = () => {
      if (!window.kairoTheme) return;
      const pref = window.kairoTheme.getPreference();
      const isDark = window.kairoTheme.isDark();
      const currentLang = window.kairoI18n ? window.kairoI18n.getLang() : 'fr';

      let svgIcon = ICONS.autoLight;
      let titleFr = 'Thème : Auto (Suit le PC)';
      let titleEn = 'Theme: Auto (Matches PC)';
      let labelFr = 'Thème : Auto (PC)';
      let labelEn = 'Theme: Auto (PC)';

      if (pref === 'dark') {
        svgIcon = ICONS.moon;
        titleFr = 'Thème : Sombre forcé (Cliquer pour Clair)';
        titleEn = 'Theme: Dark forced (Click for Light)';
        labelFr = 'Thème : Sombre';
        labelEn = 'Theme: Dark';
      } else if (pref === 'light') {
        svgIcon = ICONS.sun;
        titleFr = 'Thème : Clair forcé (Cliquer pour Auto)';
        titleEn = 'Theme: Light forced (Click for Auto)';
        labelFr = 'Thème : Clair';
        labelEn = 'Theme: Light';
      } else {
        // Auto
        svgIcon = isDark ? ICONS.moon : ICONS.sun;
        titleFr = `Thème : Auto (PC ${isDark ? 'Sombre' : 'Clair'}) - Cliquer pour changer`;
        titleEn = `Theme: Auto (PC ${isDark ? 'Dark' : 'Light'}) - Click to switch`;
        labelFr = `Thème : Auto (${isDark ? 'Sombre' : 'Clair'})`;
        labelEn = `Theme: Auto (${isDark ? 'Dark' : 'Light'})`;
      }

      if (iconTheme) iconTheme.innerHTML = svgIcon;
      if (btnTheme) {
        btnTheme.setAttribute('title', currentLang === 'fr' ? titleFr : titleEn);
      }

      if (mobileIconTheme) mobileIconTheme.innerHTML = svgIcon;
      if (mobileLabelTheme) {
        mobileLabelTheme.textContent = currentLang === 'fr' ? labelFr : labelEn;
        mobileLabelTheme.setAttribute('data-fr', labelFr);
        mobileLabelTheme.setAttribute('data-en', labelEn);
      }
    };

    if (btnTheme) {
      btnTheme.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.kairoTheme) {
          window.kairoTheme.cycleTheme();
          updateThemeUI();
        }
      });
    }

    if (mobileBtnTheme) {
      mobileBtnTheme.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.kairoTheme) {
          window.kairoTheme.cycleTheme();
          updateThemeUI();
        }
      });
    }

    // Écouter les changements globaux de thème
    window.addEventListener('kairo-theme-change', updateThemeUI);
    updateThemeUI();
  }
}

customElements.define('kairo-navbar', KairoNavbar);
