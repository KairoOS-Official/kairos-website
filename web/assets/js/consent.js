/**
 * KaïroOS — Gestionnaire de Consentement RGPD & ePrivacy (consent.js)
 * Conforme ePrivacy & CNIL :
 * - 3 boutons équivalents : Tout accepter / Tout refuser / Personnaliser
 * - Aucun cookie ni tracking avant consentement explicite
 * - Durée de validité : 6 mois (180 jours)
 * - Persistance du choix dans localStorage.kairo_consent_v1
 * - Pas de blocage des fonctionnalités (aucun cookie wall)
 * - Réouverture à tout moment via window.openCookieSettings()
 */

(function() {
  const STORAGE_KEY = 'kairo_consent_v1';
  const CONSENT_DURATION_MS = 180 * 24 * 60 * 60 * 1000; // 6 mois (180 jours)

  function getSavedConsent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.timestamp !== 'number') return null;
      // Vérifier si expiré (> 6 mois)
      if (Date.now() - data.timestamp > CONSENT_DURATION_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch(e) {
      return null;
    }
  }

  function saveConsent(analyticsAllowed) {
    const consent = {
      timestamp: Date.now(),
      analytics: Boolean(analyticsAllowed),
      version: 1
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch(e) {}

    // Envoi anonyme des statistiques de consentement (sans IP ni traceur nominatif)
    sendAnonymousConsentStat(analyticsAllowed ? 'consent_accepted' : 'consent_refused');

    // Si refus, purger l'identifiant de session existant éventuel
    if (!analyticsAllowed) {
      try {
        sessionStorage.removeItem('kairo_session_id');
      } catch(e) {}
    }

    // Déclencher l'événement pour les composants et trackers
    window.dispatchEvent(new CustomEvent('kairo_consent_updated', { detail: consent }));

    closeBanner();
    closeModal();
  }

  function sendAnonymousConsentStat(choice) {
    try {
      const payload = JSON.stringify({ choice: choice });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track/consent-stat', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/track/consent-stat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(() => {});
      }
    } catch(e) {}
  function renderBanner() {
    if (document.getElementById('kairo-consent-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'kairo-consent-banner';
    banner.className = 'fixed bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-[90] animate-fade-in font-sans';
    banner.innerHTML = `
      <div class="bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200/90 text-slate-800 space-y-4">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-lg">cookie</span>
          </div>
          <div class="space-y-1">
            <h4 class="font-display font-bold text-sm text-slate-900">Respect de votre vie privée</h4>
            <p class="text-xs text-slate-600 leading-relaxed">
              Nous utilisons une mesure d'audience anonymisée hébergée localement pour comprendre l'usage du site et guider le développement de KaïroOS. Aucun traceur publicitaire n'est utilisé.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 text-[11px] font-mono text-slate-500">
          <a href="/legal/cookies" class="underline hover:text-brand-600 transition-colors">Détail des cookies</a>
          <span>·</span>
          <a href="/legal/confidentialite" class="underline hover:text-brand-600 transition-colors">Politique de confidentialité</a>
        </div>

        <div class="grid grid-cols-3 gap-2 pt-1">
          <button type="button" id="btn-consent-refuse" class="px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer text-center">
            Tout refuser
          </button>
          <button type="button" id="btn-consent-customize" class="px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors cursor-pointer text-center">
            Personnaliser
          </button>
          <button type="button" id="btn-consent-accept" class="px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-brand-600 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer text-center">
            Tout accepter
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('btn-consent-accept')?.addEventListener('click', () => saveConsent(true));
    document.getElementById('btn-consent-refuse')?.addEventListener('click', () => saveConsent(false));
    document.getElementById('btn-consent-customize')?.addEventListener('click', () => {
      closeBanner();
      openModal();
    });
  }

  function closeBanner() {
    const b = document.getElementById('kairo-consent-banner');
    if (b) b.remove();
  }

  function openModal() {
    let modal = document.getElementById('kairo-consent-modal');
    if (modal) modal.remove();

    const currentConsent = getSavedConsent();
    const isAnalyticsChecked = currentConsent ? Boolean(currentConsent.analytics) : false;

    modal = document.createElement('div');
    modal.id = 'kairo-consent-modal';
    modal.className = 'fixed inset-0 z-[95] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans animate-fade-in';
    modal.innerHTML = `
      <div class="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-brand-600 text-2xl">tune</span>
            <h3 class="font-display font-bold text-base text-slate-900">Préférences de Confidentialité</h3>
          </div>
          <button id="btn-close-consent-modal" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer">
            ✕
          </button>
        </div>

        <p class="text-xs text-slate-600 leading-relaxed">
          Gérez vos préférences relatives aux données collectées sur le site KaïroOS. Votre choix sera conservé pendant une durée de <strong>6 mois</strong>.
        </p>

        <div class="space-y-3">
          <!-- Finalité 1 : Nécessaire -->
          <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-bold text-xs text-slate-900">Stockage Technique & Fonctionnel</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-200 text-slate-700 font-bold">Toujours actif</span>
              </div>
              <p class="text-[11px] text-slate-500 leading-relaxed">
                Nécessaire à la navigation, au choix de la langue (FR/EN) et à la sécurité (authentification admin, prévention des abus).
              </p>
            </div>
            <input type="checkbox" checked disabled class="mt-1 w-4 h-4 text-brand-600 rounded">
          </div>

          <!-- Finalité 2 : Mesure d'audience -->
          <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-4">
            <div class="space-y-1">
              <span class="font-bold text-xs text-slate-900">Mesure d'audience anonymisée</span>
              <p class="text-[11px] text-slate-500 leading-relaxed">
                Permet de comptabiliser les pages vues et les téléchargements afin d'orienter les développements de l'OS. Adresse IP tronquée (/24), aucune revente, aucun croisement de données.
              </p>
            </div>
            <input type="checkbox" id="chk-analytics-toggle" ${isAnalyticsChecked ? 'checked' : ''} class="mt-1 w-4 h-4 text-brand-600 rounded cursor-pointer">
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100">
          <button type="button" id="btn-modal-refuse-all" class="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer">
            Tout refuser
          </button>
          <div class="flex items-center gap-2">
            <button type="button" id="btn-modal-save-choices" class="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm cursor-pointer">
              Enregistrer mes choix
            </button>
            <button type="button" id="btn-modal-accept-all" class="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm cursor-pointer">
              Tout accepter
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-close-consent-modal')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    document.getElementById('btn-modal-refuse-all')?.addEventListener('click', () => saveConsent(false));
    document.getElementById('btn-modal-accept-all')?.addEventListener('click', () => saveConsent(true));
    document.getElementById('btn-modal-save-choices')?.addEventListener('click', () => {
      const chk = document.getElementById('chk-analytics-toggle');
      saveConsent(chk ? chk.checked : false);
    });
  }

  function closeModal() {
    const modal = document.getElementById('kairo-consent-modal');
    if (modal) modal.remove();
  }

  // API publique accessible partout
  window.openCookieSettings = openModal;
  window.hasAnalyticsConsent = function() {
    const c = getSavedConsent();
    return c ? Boolean(c.analytics) : false;
  };

  // Initialisation au chargement de la page
  function init() {
    const consent = getSavedConsent();
    if (!consent) {
      // Aucun choix enregistré ou expiré : afficher le bandeau
      renderBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
