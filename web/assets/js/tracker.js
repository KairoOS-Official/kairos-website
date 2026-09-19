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

  function getVisitorId() {
    try {
      let vid = localStorage.getItem('kairo_vid');
      if (!vid) {
        vid = 'v_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem('kairo_vid', vid);
      }
      return vid;
    } catch(e) {
      return null;
    }
  }

  function getSessionId() {
    try {
      let sessionId = sessionStorage.getItem('kairo_session_id');
      if (!sessionId) {
        sessionId = 's_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
        sessionStorage.setItem('kairo_session_id', sessionId);
      }
      return sessionId;
    } catch(e) {
      return null;
    }
  }

  function sendEvent(eventType, target, meta = {}) {
    const hasConsent = getConsent();

    // Si pas de consentement : seule la vue de page 100% anonyme (exemptée CNIL) est transmise
    if (!hasConsent && eventType !== 'page_view') {
      return; // Aucun clic, aucun temps actif, aucun tracking comportemental
    }

    let vid = 'v_anon';
    let sid = 's_anon';

    if (hasConsent) {
      vid = getVisitorId() || 'v_anon';
      sid = getSessionId() || 's_anon';
    } else {
      // Mesure d'audience anonyme CNIL : identifiant de session volatile sans persistance inter-visites
      try {
        let anonSid = sessionStorage.getItem('kairo_anon_sid');
        if (!anonSid) {
          anonSid = 'anon_s_' + Math.random().toString(36).substring(2, 10);
          sessionStorage.setItem('kairo_anon_sid', anonSid);
        }
        sid = anonSid;
        vid = 'anon_visitor';
      } catch(e) {
        sid = 'anon_session';
      }
    }

    const compositeSession = hasConsent ? (vid + '.' + sid) : sid;

    const payload = JSON.stringify({
      event_type: eventType,
      target: target,
      page: window.location.pathname || '/',
      session_id: compositeSession,
      referrer: document.referrer ? document.referrer.split('?')[0] : '',
      meta: hasConsent ? Object.assign({ visitor_id: vid }, meta) : { anonymous: true, consent: false }
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

  // --- MOTEUR DE TEMPS ACTIF (ACTIVE ENGAGEMENT TIME) ---
  // Ne compte QUE si l'onglet est visible ET si l'utilisateur est actif (pas d'inactivité > 45s)
  let activeSeconds = 0;
  let isUserEngaged = true;
  let idleTimeoutId = null;

  function markUserEngaged() {
    isUserEngaged = true;
    clearTimeout(idleTimeoutId);
    // Pause après 45 secondes sans interaction
    idleTimeoutId = setTimeout(function() {
      isUserEngaged = false;
    }, 45000);
  }

  // Événements d'interaction légers
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(function(evt) {
    window.addEventListener(evt, markUserEngaged, { passive: true });
  });
  markUserEngaged();

  // Incrément chaque seconde si actif et visible
  setInterval(function() {
    if (document.visibilityState === 'visible' && isUserEngaged) {
      activeSeconds++;
    }
  }, 1000);

  let lastSentDuration = 0;

  function sendPageDuration() {
    if (!getConsent()) return;
    if (activeSeconds <= 0 || activeSeconds <= lastSentDuration) return;

    lastSentDuration = activeSeconds;
    sendEvent('page_duration', window.location.pathname || '/', {
      duration_seconds: activeSeconds
    });
  }

  // Envoi périodique régulier (heartbeat toutes les 15 secondes)
  setInterval(function() {
    if (document.visibilityState === 'visible' && isUserEngaged) {
      sendPageDuration();
    }
  }, 15000);

  // Envoi immédiat dès que l'onglet est masqué ou fermé
  window.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      isUserEngaged = false;
      sendPageDuration();
    } else {
      markUserEngaged();
    }
  });
  window.addEventListener('pagehide', sendPageDuration);
  window.addEventListener('beforeunload', sendPageDuration);

  // Enregistrement initial de la page vue (mesure d'audience anonyme CNIL par défaut si non consenti)
  sendEvent('page_view', window.location.pathname || '/');

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
