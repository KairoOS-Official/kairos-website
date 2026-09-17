export type Lang = 'fr' | 'en';

const STORAGE_KEY = 'kairo_pref_lang';
const DEFAULT_LANG: Lang = 'fr';

export function getInitialLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  const p = (window.location.pathname || '').toLowerCase();
  if (p.startsWith('/en/') || p === '/en') return 'en';
  if (p.startsWith('/fr/') || p === '/fr') return 'fr';

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved as Lang;
  } catch {}

  const navLang = (navigator.language || '').toLowerCase();
  return navLang.startsWith('fr') ? 'fr' : 'en';
}

let currentLang: Lang = getInitialLang();
const listeners: Array<(lang: Lang) => void> = [];

export function updateUrlLang(lang: Lang): void {
  if (typeof window === 'undefined') return;
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
    window.history.pushState({ lang }, '', newUrl);
  }
}

export function applyLanguage(lang: Lang, syncUrl = false): void {
  currentLang = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }

  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}

  if (syncUrl) {
    updateUrlLang(lang);
  }

  if (typeof document !== 'undefined') {
    document.querySelectorAll('[data-fr]').forEach((el) => {
      const text = el.getAttribute('data-' + lang);
      if (text !== null) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          (el as HTMLInputElement).placeholder = text;
        } else {
          el.innerHTML = text;
        }
      }
    });
  }

  listeners.forEach((fn) => {
    try {
      fn(lang);
    } catch {}
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kairo_lang_changed', { detail: { lang } }));
  }
}

export function setLanguage(lang: Lang): void {
  applyLanguage(lang, true);
}

export function getLanguage(): Lang {
  return currentLang;
}

export function onLanguageChange(fn: (lang: Lang) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function t(fr: string, en: string): string {
  return currentLang === 'en' ? en : fr;
}
