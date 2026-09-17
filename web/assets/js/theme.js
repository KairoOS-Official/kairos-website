/**
 * KaïroOS — Gestionnaire Universel de Thème (Clair / Sombre / Système PC)
 * @author Flow (Florian) — FlowCreativeStudio
 * 
 * Fonctionnalités :
 * - Suivi automatique en direct du thème du système d'exploitation / PC (prefers-color-scheme)
 * - Mémorisation de la préférence manuelle de l'utilisateur (auto | dark | light)
 * - Anti-FOUC (Zéro flash blanc) avec mise à jour immédiate de la classe 'dark' sur <html>
 * - Événement personnalisé 'kairo-theme-change' pour synchroniser les composants UI
 */

(function() {
  const THEME_STORAGE_KEY = 'kairo_theme_pref'; // 'auto' | 'dark' | 'light'
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // Récupération de la préférence enregistrée (défaut: 'auto' = suit le PC)
  function getThemePreference() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light' || saved === 'auto') {
        return saved;
      }
    } catch (e) {}
    return 'auto';
  }

  // Détermine le mode effectif affiché à l'écran ('dark' ou 'light')
  function getEffectiveTheme() {
    const pref = getThemePreference();
    if (pref === 'auto') {
      return mediaQuery.matches ? 'dark' : 'light';
    }
    return pref;
  }

  // Application du thème sur le DOM (classe 'dark' sur documentElement)
  function applyTheme(pref, triggerEvent = true) {
    const isDark = pref === 'auto' ? mediaQuery.matches : pref === 'dark';
    const root = document.documentElement;

    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }

    // Mise à jour de la balise meta theme-color pour mobile / OS si présente
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.name = 'theme-color';
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', isDark ? '#090d16' : '#FBFBF9');

    if (triggerEvent) {
      const event = new CustomEvent('kairo-theme-change', {
        detail: {
          preference: pref,
          effectiveTheme: isDark ? 'dark' : 'light',
          isDark: isDark
        }
      });
      window.dispatchEvent(event);
    }
  }

  // Définir une nouvelle préférence ('auto', 'dark', 'light')
  function setTheme(pref) {
    if (pref !== 'auto' && pref !== 'dark' && pref !== 'light') {
      pref = 'auto';
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch (e) {}
    applyTheme(pref, true);
  }

  // Cycle entre auto -> dark -> light -> auto
  function cycleTheme() {
    const current = getThemePreference();
    let next = 'auto';
    if (current === 'auto') {
      next = mediaQuery.matches ? 'light' : 'dark';
    } else if (current === 'dark') {
      next = 'light';
    } else if (current === 'light') {
      next = 'auto';
    }
    setTheme(next);
    return next;
  }

  // Écouteur en direct du thème du PC / Système
  try {
    mediaQuery.addEventListener('change', (e) => {
      if (getThemePreference() === 'auto') {
        applyTheme('auto', true);
      }
    });
  } catch (err) {
    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener((e) => {
        if (getThemePreference() === 'auto') {
          applyTheme('auto', true);
        }
      });
    }
  }

  // Initialisation immédiate
  applyTheme(getThemePreference(), false);

  // API publique exposée sur window
  window.kairoTheme = {
    getPreference: getThemePreference,
    getEffectiveTheme: getEffectiveTheme,
    isDark: function() {
      return getEffectiveTheme() === 'dark';
    },
    setTheme: setTheme,
    cycleTheme: cycleTheme,
    apply: function() {
      applyTheme(getThemePreference(), true);
    }
  };
})();
