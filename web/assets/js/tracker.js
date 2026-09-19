/**
 * KaïroOS Client-side Analytics & Click Tracker
 * Ultra-léger (< 2 Ko), respectueux du RGPD / ePrivacy.
 * - Conditionné au consentement explicite (localStorage.kairo_consent_v1)
 * - Aucune télémétrie envoyée si le consentement n'est pas accordé
 * - Réactif aux changements de consentement via l'événement 'kairo_consent_updated'
 */
(function() {
  function getConsent() {
    try {
      const raw = localStorage.getItem('kairo_consent_v1');
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data && Boolean(data.analytics);
    } catch(e) {
      return false;
    }
  }

  function getSessionId() {
    if (!getConsent()) return null;
    let sessionId = sessionStorage.getItem('kairo_session_id');
    if (!sessionId) {
      sessionId = 's_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      sessionStorage.setItem('kairo_session_id', sessionId);
    }
    return sessionId;
  }

  function sendEvent(eventType, target, meta = {}) {
    // Ne rien envoyer si l'utilisateur n'a pas donné son consentement
    if (!getConsent()) {
      return;
    }

    const sId = getSessionId() || 'anon';
    const payload = JSON.stringify({
      event_type: eventType,
      target: target,
      page: window.location.pathname || '/',
      session_id: sId,
      referrer: document.referrer ? document.referrer.split('?')[0] : '',
      meta: meta
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/track', blob);
    } else {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }
  }

  let pageEnterTime = Date.now();
  let lastSentDuration = 0;

  function sendPageDuration() {
    if (!getConsent()) return;
    const durationSeconds = Math.max(1, Math.round((Date.now() - pageEnterTime) / 1000));
    // Limite raisonnable (ex: 2h max pour éviter les onglets laissés ouverts)
    if (durationSeconds > 7200) return;
    if (durationSeconds <= lastSentDuration) return;

    lastSentDuration = durationSeconds;
    sendEvent('page_duration', window.location.pathname || '/', {
      duration_seconds: durationSeconds
    });
  }

  // Envoi périodique régulier (heartbeat toutes les 15 secondes)
  setInterval(function() {
    if (document.visibilityState !== 'hidden') {
      sendPageDuration();
    }
  }, 15000);

  // Envoi au masquage et au départ de la page
  window.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      sendPageDuration();
    }
  });
  window.addEventListener('pagehide', sendPageDuration);
  window.addEventListener('beforeunload', sendPageDuration);

  // Si le consentement est déjà accordé, enregistrer la page vue
  if (getConsent()) {
    sendEvent('page_view', window.location.pathname || '/');
  }

  // Écouter l'événement de mise à jour du consentement
  window.addEventListener('kairo_consent_updated', function(e) {
    if (e.detail && e.detail.analytics) {
      pageEnterTime = Date.now();
      sendEvent('page_view', window.location.pathname || '/');
    }
  });

  // Détection intelligente et automatique des clics
  document.addEventListener('click', function(e) {
    if (!getConsent()) return;

    const targetEl = e.target.closest('a, button, [data-track], .game-card, .faq-btn, .plugin-tab-btn');
    if (!targetEl) return;

    let trackTarget = targetEl.getAttribute('data-track');

    if (!trackTarget) {
      const text = (targetEl.innerText || '').toLowerCase().trim();
      const href = targetEl.getAttribute('href') || '';

      if (href.includes('releases') || text.includes('télécharger') || text.includes('download')) {
        trackTarget = 'download_button';
      } else if (href.includes('github.com')) {
        trackTarget = 'github_button';
      } else if (text.includes('rust') || href.includes('#plugins')) {
        trackTarget = 'rust_guide_button';
      } else if (targetEl.classList.contains('faq-btn')) {
        trackTarget = 'faq_accordion_toggle';
      } else if (targetEl.classList.contains('game-card')) {
        trackTarget = 'game_card_click';
      } else if (targetEl.classList.contains('plugin-tab-btn')) {
        trackTarget = 'plugin_tab_switch';
      } else if (targetEl.id === 'btn-simulate-action') {
        trackTarget = 'wasm_simulate_action';
      } else if (targetEl.classList.contains('shader-slider')) {
        trackTarget = 'shader_adjust';
      } else if (targetEl.classList.contains('vote-btn')) {
        trackTarget = 'roadmap_vote_click';
      } else if (href) {
        trackTarget = 'nav_link_' + href.replace(/[^a-zA-Z0-9_-]/g, '_');
      } else {
        trackTarget = 'action_' + text.substring(0, 24).replace(/[^a-zA-Z0-9_-]/g, '_');
      }
    }

    if (trackTarget) {
      sendEvent('click', trackTarget, {
        text: (targetEl.innerText || '').substring(0, 50).trim(),
        href: (targetEl.getAttribute('href') || '').split('?')[0]
      });
    }
  }, true);

  window.kairoTrack = sendEvent;
})();
