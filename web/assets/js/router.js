/**
 * KaïroOS — Routeur Client SPA Léger & Transitions de Pages Fluides (Router JS)
 * 
 * Offre :
 * - Navigation instantanée sans rechargement de page brutale (évite les chargements)
 * - Préchargement anticipé au survol (hover / pointerenter / touchstart) et en tâche de fond (idle)
 * - Transitions animées élégantes (API View Transitions + animations CSS GPU)
 * - Barre de progression lumineuse en haut d'écran
 * - Synchronisation dynamique de la navbar, du titre et de l'historique
 * - Ré-initialisation propre des composants et scripts interactifs par page
 * - Tolérance de panne automatique vers la navigation native
 */

(function() {
  // Empêcher les sauts de scroll indésirables du navigateur
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  // Nettoyage esthétique immédiat : transforme les URLs physiques en Clean URLs (/plugins, /themes, /roadmap, /)
  if (window.location.protocol.startsWith('http')) {
    const pathname = window.location.pathname;
    let cleanPath = null;
    if (pathname.includes('themes') && pathname !== '/themes') cleanPath = '/themes';
    else if (pathname.includes('plugins') && pathname !== '/plugins') cleanPath = '/plugins';
    else if (pathname.includes('roadmap') && pathname !== '/roadmap') cleanPath = '/roadmap';
    else if (pathname.endsWith('/index.html')) cleanPath = '/';

    if (cleanPath) {
      const fullClean = cleanPath + window.location.search + window.location.hash;
      try {
        history.replaceState({ path: fullClean }, '', fullClean);
      } catch (e) {}
    }
  }

  // Cache mémoire des pages HTML
  const pageCache = new Map();

  // Barre de progression en haut de page
  let progressBar = null;

  function getProgressBar() {
    if (!progressBar) {
      progressBar = document.getElementById('kairo-progress-bar');
      if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'kairo-progress-bar';
        document.body.appendChild(progressBar);
      }
    }
    return progressBar;
  }

  function startProgress() {
    const bar = getProgressBar();
    bar.style.width = '0%';
    bar.classList.add('loading');
    requestAnimationFrame(() => {
      bar.style.width = '35%';
      setTimeout(() => {
        if (bar.classList.contains('loading')) {
          bar.style.width = '70%';
        }
      }, 150);
    });
  }

  function finishProgress() {
    const bar = getProgressBar();
    bar.style.width = '100%';
    setTimeout(() => {
      bar.classList.remove('loading');
      setTimeout(() => {
        bar.style.width = '0%';
      }, 200);
    }, 180);
  }

  // Normalisation des URLs internes
  function normalizeUrl(href) {
    try {
      const url = new URL(href, window.location.href);
      return url;
    } catch {
      return null;
    }
  }

    function getCleanDisplayUrl(targetUrl) {
    let displayUrl = targetUrl.href;
    if (window.location.protocol.startsWith('http')) {
      const origin = targetUrl.origin;
      const pathname = targetUrl.pathname;
      const hash = targetUrl.hash || '';
      const search = targetUrl.search || '';

      if (pathname.includes('themes')) {
        return `${origin}/themes${search}${hash}`;
      } else if (pathname.includes('plugins')) {
        return `${origin}/plugins${search}${hash}`;
      } else if (pathname.includes('roadmap')) {
        return `${origin}/roadmap${search}${hash}`;
      } else {
        return `${origin}/${search}${hash}`;
      }
    }
    return displayUrl;
  }

  function isInternalLink(anchor) {
    if (!anchor || anchor.tagName !== 'A') return false;
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return false;
    if (anchor.hasAttribute('data-no-router')) return false;

    const href = anchor.getAttribute('href');
    if (!href || href === '#' || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return false;
    }

    // Laisser le navigateur ou les gestionnaires dédiés traiter les pages légales et admin
    if (href.includes('/legal/') || href.startsWith('legal/') || href.includes('/admin') || href.startsWith('admin')) {
      return false;
    }

    const url = normalizeUrl(href);
    if (!url) return false;

    if (url.pathname.includes('/legal') || url.pathname.includes('/admin')) {
      return false;
    }

    // Même origine ou protocole local
    const isSameOrigin = url.origin === window.location.origin;
    const isLocalFile = window.location.protocol === 'file:' && url.protocol === 'file:';

    return isSameOrigin || isLocalFile;
  }

  function getActiveKeyFromUrl(url) {
    const pathname = (url.pathname || '') + (url.hash || '');
    if (pathname.includes('themes')) return 'themes';
    if (pathname.includes('plugins')) return 'plugins';
    if (pathname.includes('roadmap')) return 'roadmap';
    return 'home';
  }

  // Préchargement robuste d'une page en mémoire
  async function prefetchPage(urlStr) {
    const url = normalizeUrl(urlStr);
    if (!url) return null;

    const activeKey = getActiveKeyFromUrl(url);
    if (pageCache.has(activeKey)) {
      return pageCache.get(activeKey);
    }

    // Essayer les chemins physiques correspondants
    const candidates = [];
    if (activeKey === 'themes') {
      candidates.push('/themes/index.html', '/pages/themes.html', '/themes/');
    } else if (activeKey === 'plugins') {
      candidates.push('/plugins/index.html', '/pages/plugins.html', '/plugins/');
    } else if (activeKey === 'roadmap') {
      candidates.push('/roadmap/index.html', '/pages/roadmap.html', '/roadmap/');
    } else {
      candidates.push('/index.html', '/');
    }

    for (const candidate of candidates) {
      try {
        const fetchTarget = new URL(candidate, window.location.origin).href;
        const response = await fetch(fetchTarget);
        if (response.ok) {
          const htmlText = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, 'text/html');
          pageCache.set(activeKey, doc);
          pageCache.set(url.pathname, doc);
          return doc;
        }
      } catch (err) {
        // Poursuivre
      }
    }
    return null;
  }

  // Initialisation des scripts selon la page active
  function reinitPageScripts(activeKey) {
    // 1. Ré-application des animations Scroll Reveal
    if (typeof window.initScrollReveal === 'function') {
      window.initScrollReveal();
    }

    // 2. Ré-application de la langue bilingue courante (i18n)
    if (window.kairoI18n && typeof window.kairoI18n.applyLang === 'function') {
      window.kairoI18n.applyLang();
    }

    // 2a. Maintien et ré-application du thème (Clair / Sombre / Auto PC)
    if (window.kairoTheme && typeof window.kairoTheme.apply === 'function') {
      window.kairoTheme.apply();
    }

    // 2b. Ré-initialisation des vitrines interactives Apple « De plus près »
    if (typeof window.initDePlusPres === 'function') {
      window.initDePlusPres();
    }

    // 3. Scripts spécifiques par page
    if (activeKey === 'home') {
      if (typeof window.initHomePage === 'function') {
        window.initHomePage();
      }
      if (typeof window.initGamepadVisualizer === 'function') {
        window.initGamepadVisualizer();
      }
      if (typeof window.initKioskDemo === 'function') {
        window.initKioskDemo();
      }
      if (typeof window.initScrollZoom === 'function') {
        window.initScrollZoom();
      }
    } else if (activeKey === 'themes') {
      if (typeof window.initThemesPage === 'function') {
        window.initThemesPage();
      }
    } else if (activeKey === 'plugins') {
      if (typeof window.initPluginsPage === 'function') {
        window.initPluginsPage();
      }
    } else if (activeKey === 'roadmap') {
      if (typeof window.initRoadmapPage === 'function') {
        window.initRoadmapPage();
      }
    }

    // Émission d'un événement global pour tout écouteur personnalisé
    window.dispatchEvent(new CustomEvent('kairo:page-ready', { detail: { active: activeKey } }));
  }

  // Application du nouveau contenu de page
  function swapContent(newDoc, targetUrl, activeKey) {
    const currentMain = document.querySelector('main');
    const newMain = newDoc.querySelector('main');

    if (currentMain && newMain) {
      currentMain.innerHTML = newMain.innerHTML;
      currentMain.className = newMain.className;

      // Re-exécution des scripts contenus dans le main
      const scripts = currentMain.querySelectorAll('script');
      scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => {
          newScript.setAttribute(attr.name, attr.value);
        });
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
    }

    // S'assurer que les scripts spécifiques sont chargés si besoin
    const isSub = window.location.pathname.includes('/pages/');
    const assetPrefix = isSub ? '../' : './';

    if (activeKey === 'home') {
      if (typeof window.initKioskDemo !== 'function') {
        const s = document.createElement('script');
        s.src = assetPrefix + 'assets/js/kiosk-demo.js';
        document.head.appendChild(s);
      }
      if (typeof window.initGamepadVisualizer !== 'function') {
        const s2 = document.createElement('script');
        s2.src = assetPrefix + 'assets/js/gamepad-visualizer.js';
        document.head.appendChild(s2);
      }
    }

    // S'assurer que le composant <kairo-code-editor> est chargé si la nouvelle page l'utilise
    if (document.querySelector('kairo-code-editor') && !customElements.get('kairo-code-editor')) {
      const isSub = window.location.pathname.includes('/pages/');
      const s = document.createElement('script');
      s.src = (isSub ? '../' : './') + 'assets/js/components/code-editor.js';
      document.head.appendChild(s);
    }

    // Titre de page
    if (newDoc.title) {
      document.title = newDoc.title;
    }

    // Synchronisation Navbar & Footer Web Components
    const isSubPage = activeKey !== 'home';
    const navbar = document.querySelector('kairo-navbar');
    if (navbar && typeof navbar.setActive === 'function') {
      navbar.setActive(activeKey, isSubPage);
      if (typeof navbar.closeMobileMenu === 'function') {
        navbar.closeMobileMenu();
      }
    }

    const footer = document.querySelector('kairo-footer');
    if (footer && typeof footer.updateRoot === 'function') {
      footer.updateRoot(isSubPage);
    }

    // Gestion du scroll
    if (targetUrl.hash) {
      const targetEl = document.querySelector(targetUrl.hash);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }

    // Ré-initialisation
    reinitPageScripts(activeKey);
  }

  let isNavigating = false;

  // Navigation fluide principale
  async function navigateTo(urlStr, pushHistory = true) {
    if (isNavigating) return;
    const targetUrl = normalizeUrl(urlStr);
    if (!targetUrl) return;

    // Si on clique sur un lien vers la même page
    const currentKey = getActiveKeyFromUrl(new URL(window.location.href));
    const targetKey = getActiveKeyFromUrl(targetUrl);
    const isSamePage = currentKey === targetKey;
    if (isSamePage) {
      if (targetUrl.hash) {
        const targetEl = document.querySelector(targetUrl.hash);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
          if (pushHistory) {
            const cleanUrl = getCleanDisplayUrl(targetUrl);
            history.pushState({ path: cleanUrl }, '', cleanUrl);
          }
          return;
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    isNavigating = true;
    startProgress();

    try {
      let newDoc = pageCache.get(targetKey) || pageCache.get(targetUrl.pathname);
      if (!newDoc) {
        try {
          newDoc = await prefetchPage(targetUrl.href);
        } catch (err) {
          window.location.href = targetUrl.href;
          return;
        }
      }

      if (!newDoc) {
        window.location.href = targetUrl.href;
        return;
      }

      const activeKey = targetKey;

      // Animation de transition de page fluide & soyeuse sur le contenu principal <main>
      const main = document.querySelector('main');
      if (main) {
        // 1. Sortie en fondu et léger glissement vers le haut
        main.classList.remove('page-transition-enter', 'page-transition-enter-active');
        main.classList.add('page-transition-exit');
        await new Promise(r => setTimeout(r, 200));

        // 2. Remplacement du contenu DOM & synchronisation pendant que le contenu est invisible
        swapContent(newDoc, targetUrl, activeKey);

        // 3. Préparation de l'entrée (décalé vers le bas, opacité 0)
        main.classList.remove('page-transition-exit');
        main.classList.add('page-transition-enter');

        // Forcer le recalcul de mise en page (reflow)
        void main.offsetHeight;

        // 4. Glissement soyeux d'arrivée vers la position naturelle
        requestAnimationFrame(() => {
          main.classList.add('page-transition-enter-active');
          setTimeout(() => {
            main.classList.remove('page-transition-enter', 'page-transition-enter-active');
          }, 380);
        });
      } else {
        swapContent(newDoc, targetUrl, activeKey);
      }

      if (pushHistory) {
        const cleanUrl = getCleanDisplayUrl(targetUrl);
        history.pushState({ path: cleanUrl }, '', cleanUrl);
      }
    } finally {
      isNavigating = false;
      finishProgress();
    }
  }

  // Écouteur global de clics
  function setupLinkInterceptors() {
    document.addEventListener('click', (e) => {
      // Ignorer clics modifiés (Ctrl, Meta, Shift, Alt)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;

      const anchor = e.target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (href === '#') {
        e.preventDefault();
        return;
      }

      if (isInternalLink(anchor)) {
        e.preventDefault();
        navigateTo(href);
      }
    });

    // Préchargement au survol ou contact tactile
    const handlePrefetchTrigger = (e) => {
      const anchor = e.target.closest('a');
      if (anchor && isInternalLink(anchor)) {
        const href = anchor.getAttribute('href');
        prefetchPage(href);
      }
    };

    document.addEventListener('pointerenter', handlePrefetchTrigger, { passive: true, capture: true });
    document.addEventListener('touchstart', handlePrefetchTrigger, { passive: true });

    // Gestion du bouton Précédent / Suivant du navigateur
    window.addEventListener('popstate', () => {
      navigateTo(window.location.href, false);
    });
  }

  // Préchargement intelligent en tâche de fond (Idle)
  function setupIdlePrefetch() {
    const prefetchRoutes = () => {
      const isSubPage = window.location.pathname.includes('/pages/');
      const root = isSubPage ? '../' : './';

      const routes = [
        `${root}index.html`,
        `${root}themes/`,
        `${root}plugins/`,
        `${root}roadmap/`
      ];

      routes.forEach(route => {
        // Précharger uniquement si ce n'est pas la page active
        const url = normalizeUrl(route);
        if (url && url.pathname !== window.location.pathname) {
          prefetchPage(route);
        }
      });
    };

    if ('requestIdleCallback' in window) {
      setTimeout(() => requestIdleCallback(prefetchRoutes), 1200);
    } else {
      setTimeout(prefetchRoutes, 1800);
    }
  }

  // Export de l'API globale
  window.kairoRouter = {
    navigate: navigateTo,
    prefetch: prefetchPage
  };

  // Démarrage
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupLinkInterceptors();
      setupIdlePrefetch();
    });
  } else {
    setupLinkInterceptors();
    setupIdlePrefetch();
  }
})();
