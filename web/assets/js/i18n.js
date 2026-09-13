/**
 * KaïroOS — Moteur Bilingue Universel (i18n) avec Support d'URLs (/fr/ et /en/)
 * Gère la persistance de la langue, la synchronisation avec l'URL du navigateur,
 * et la mise à jour réactive des éléments du DOM.
 */

(function() {
  const STORAGE_KEY = 'kairo_pref_lang';
  const DEFAULT_LANG = 'fr';

  function getInitialLang() {
    // 1. Détection via l'URL en priorité
    const p = (window.location.pathname || '').toLowerCase();
    if (p.startsWith('/en/') || p === '/en') return 'en';
    if (p.startsWith('/fr/') || p === '/fr') return 'fr';

    // 2. Détection via localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'fr' || saved === 'en') return saved;
    } catch (e) {}

    // 3. Détection via la langue du système/navigateur
    const navLang = (navigator.language || '').toLowerCase();
    return navLang.startsWith('fr') ? 'fr' : 'en';
  }

  let currentLang = getInitialLang();
  const listeners = [];

  function updateUrlLang(lang) {
    if (window.location.pathname.includes('/admin')) return;
    const path = window.location.pathname || '/';
    let sub = path;

    if (sub.startsWith('/fr/') || sub.startsWith('/en/')) {
      sub = sub.substring(3);
    } else if (sub === '/fr' || sub === '/en') {
      sub = '/';
    }

    const newUrl = '/' + lang + (sub === '/' ? '' : sub) + window.location.search + window.location.hash;
    if (newUrl !== path + window.location.search + window.location.hash) {
      window.history.pushState({ lang: lang }, '', newUrl);
    }
  }

  function applyLanguage(lang, syncUrl = false) {
    currentLang = lang;
    document.documentElement.lang = lang;

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {}

    if (syncUrl) {
      updateUrlLang(lang);
    }

    // Mise à jour de tous les éléments balisés avec data-fr / data-en
    document.querySelectorAll('[data-fr]').forEach(el => {
      const text = el.getAttribute('data-' + lang);
      if (text !== null) {
        el.innerHTML = text;
      }
    });

    // Mise à jour des placeholders
    document.querySelectorAll('[data-placeholder-fr]').forEach(el => {
      const ph = el.getAttribute('data-placeholder-' + lang);
      if (ph !== null) {
        el.setAttribute('placeholder', ph);
      }
    });

    // Mise à jour des titres (attribut title)
    document.querySelectorAll('[data-title-fr]').forEach(el => {
      const title = el.getAttribute('data-title-' + lang);
      if (title !== null) {
        el.setAttribute('title', title);
      }
    });

    // Notification des composants et scripts abonnés
    listeners.forEach(fn => {
      try { fn(lang); } catch (e) { console.error(e); }
    });
  }

  // Écoute du bouton Précédent/Suivant du navigateur
  window.addEventListener('popstate', () => {
    const lang = getInitialLang();
    if (lang !== currentLang) {
      applyLanguage(lang, false);
    }
  });

  window.kairoI18n = {
    get lang() { return currentLang; },
    getLang: function() { return currentLang; },
    setLanguage: function(lang) {
      applyLanguage(lang, true);
    },
    setLang: function(lang) {
      applyLanguage(lang, true);
    },
    onChange: function(callback) {
      if (typeof callback === 'function') {
        listeners.push(callback);
        callback(currentLang);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyLanguage(currentLang, false));
  } else {
    applyLanguage(currentLang, false);
  }
})();
