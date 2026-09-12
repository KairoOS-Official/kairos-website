/**
 * KairoOS Client-side Analytics & Click Tracker
 * Ultra-léger (< 2 Ko), anonyme, respectueux du RGPD (aucun cookie).
 */
(function() {
  // 1. Session ID (stocké uniquement pendant la session courante)
  let sessionId = sessionStorage.getItem('kairo_session_id');
  if (!sessionId) {
    sessionId = 's_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    sessionStorage.setItem('kairo_session_id', sessionId);
  }

  // 2. Fonction d'envoi non-bloquante (sendBeacon ou fetch keepalive)
  function sendEvent(eventType, target, meta = {}) {
    const payload = JSON.stringify({
      event_type: eventType,
      target: target,
      page: window.location.pathname || '/',
      session_id: sessionId,
      referrer: document.referrer || '',
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

  // 3. Enregistrement automatique de la page vue
  sendEvent('page_view', window.location.pathname || '/');

  // 4. Détection intelligente et automatique des clics
  document.addEventListener('click', function(e) {
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
        href: targetEl.getAttribute('href') || ''
      });
    }
  }, true);

  window.kairoTrack = sendEvent;
})();
