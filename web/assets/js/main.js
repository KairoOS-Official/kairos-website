/**
 * KaïroOS — Script Principal (Main JS)
 * @author Flow (Florian) — FlowCreativeStudio
 * @see https://github.com/NayrolfRdgs
 * @discord nayrolf_rdgs
 * @signature FCS-SIG-2026:e2848c38514d22829359a8cedb77c1df2960c7ae3e946d90803516a68b87bd67
 */

/*fcs:Flow:e2848c38514d22829359a8cedb77c1df2960c7ae3e946d90803516a68b87bd67*/
console.log('%c🎨 FlowCreativeStudio', 'color:#6366f1;font-weight:bold;font-size:14px');

(function() {
  // 1. Animation au défilement (Intersection Observer réinitialisable)
  let revealObserver = null;

  function initScrollReveal() {
    if (revealObserver) {
      revealObserver.disconnect();
    }
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;

    if (!('IntersectionObserver' in window)) {
      reveals.forEach(el => el.classList.add('active'));
      return;
    }

    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, {
      threshold: 0.05,
      rootMargin: '0px 0px -20px 0px'
    });

    reveals.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight + 40 && rect.bottom > 0) {
        el.classList.add('active');
      }
      revealObserver.observe(el);
    });
  }

  // 2. Système de Notifications Toast
  function initToastContainer() {
    let container = document.getElementById('kairo-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'kairo-toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  window.showToast = function(message, type = 'success') {
    const container = initToastContainer();
    const toast = document.createElement('div');
    
    const icon = type === 'success' ? 'check_circle' : 'info';
    const bgClass = type === 'success' 
      ? 'bg-slate-900 text-white border-slate-800' 
      : 'bg-brand-600 text-white border-brand-700';

    toast.className = `toast flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-float border ${bgClass} text-xs font-medium`;
    toast.innerHTML = `
      <span class="material-symbols-outlined text-[18px] text-emerald-400">${icon}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    // Animation d'entrée
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Disparition automatique après 3s
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // 3. Copie dans le presse-papier sécurisée
  window.copyCode = function(text, btnElement) {
    if (!navigator.clipboard) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        handleSuccess();
      } catch (err) {
        console.error('Erreur copie', err);
      }
      document.body.removeChild(textarea);
      return;
    }

    navigator.clipboard.writeText(text).then(handleSuccess).catch(err => {
      console.error('Erreur clipboard API', err);
    });

    function handleSuccess() {
      if (btnElement) {
        const originalContent = btnElement.innerHTML;
        btnElement.innerHTML = `
          <span class="material-symbols-outlined text-[16px] text-emerald-500">check</span>
          <span class="text-emerald-600 font-bold">Copié !</span>
        `;
        setTimeout(() => {
          btnElement.innerHTML = originalContent;
        }, 2000);
      }
      window.showToast(window.kairoI18n ? window.kairoI18n.t('Copié dans le presse-papier !', 'Copied to clipboard!') : 'Copié !');
    }
  };

  // 4. Scroll-Zoom Showcase Kiosque (Apple Pro Fullscreen Takeover)
  let isScrollZoomTicking = false;

  function updateScrollZoom() {
    isScrollZoomTicking = false;
    const stage = document.getElementById('showcase-scroll-stage');
    const windowEl = document.getElementById('kiosk-interactive');
    const navbar = document.querySelector('kairo-navbar');
    if (!stage || !windowEl) return;

    const rect = stage.getBoundingClientRect();
    const stageH = stage.offsetHeight;
    const viewH = window.innerHeight;
    const viewW = window.innerWidth;
    const maxScroll = stageH - viewH;

    if (maxScroll <= 40) return;

    // Progression du scroll dans la section [0 -> 1]
    const scrolled = -rect.top;
    const progress = Math.min(1, Math.max(0, scrolled / maxScroll));

    // Phase 1 : Zoom progressif de 0.0 à 0.38
    // Phase 2 : Plateau Plein écran interactif de 0.38 à 0.82 (Défilement continu des jeux)
    // Phase 3 : Défilement naturel vers le haut à partir de 0.82
    const zoomThreshold = 0.38;
    const zoomProgress = Math.min(1, Math.max(0, progress / zoomThreshold));

    // Easing cubic doux ultra-fluide à la Apple
    const ease = zoomProgress < 0.5 
      ? 4 * zoomProgress * zoomProgress * zoomProgress 
      : 1 - Math.pow(-2 * zoomProgress + 2, 3) / 2;

    const isMobile = viewW < 768;

    // Dimensions initiales de la fenêtre macOS au repos
    const startW = isMobile ? Math.min(viewW - 20, 420) : Math.min(1160, viewW * 0.86);
    const startH = isMobile ? Math.min(viewH * 0.70, 560) : Math.min(viewH * 0.74, 690);
    const startRadius = isMobile ? 18 : 24;

    // Dimensions cibles : 100% plein écran bord à bord
    const targetW = viewW;
    const targetH = viewH;
    const targetRadius = 0;

    // Interpolation millimétrée
    const curW = startW + (targetW - startW) * ease;
    const curH = startH + (targetH - startH) * ease;
    const curRadius = startRadius * (1 - ease);
    const borderAlpha = (1 - ease) * 0.15;
    const shadowAlpha = (1 - ease) * 0.65;

    // Application des styles directs
    windowEl.style.width = `${curW.toFixed(1)}px`;
    windowEl.style.height = `${curH.toFixed(1)}px`;
    windowEl.style.borderRadius = `${curRadius.toFixed(1)}px`;
    windowEl.style.borderWidth = ease > 0.98 ? '0px' : '1px';
    windowEl.style.borderColor = `rgba(255, 255, 255, ${borderAlpha.toFixed(3)})`;
    windowEl.style.boxShadow = ease > 0.98 
      ? 'none' 
      : `0 ${Math.round(35 * (1 - ease))}px ${Math.round(90 * (1 - ease))}px rgba(0, 0, 0, ${shadowAlpha.toFixed(3)})`;

    // Défilement interactif des jeux pendant le plateau plein écran (Suppression de la zone morte)
    const plateauStart = 0.38;
    const plateauEnd = 0.82;
    if (progress >= plateauStart && progress <= plateauEnd) {
      const p = (progress - plateauStart) / (plateauEnd - plateauStart);
      if (typeof window.kairoKioskScrollProgress === 'function') {
        window.kairoKioskScrollProgress(p);
      }
    } else if (progress < plateauStart) {
      if (typeof window.kairoKioskScrollProgress === 'function') {
        window.kairoKioskScrollProgress(0);
      }
    } else if (progress > plateauEnd) {
      if (typeof window.kairoKioskScrollProgress === 'function') {
        window.kairoKioskScrollProgress(1);
      }
    }

    // La barre de navigation reste visible en permanence au-dessus de tout
    if (navbar) {
      navbar.style.opacity = '1';
      navbar.style.pointerEvents = 'auto';
      navbar.style.transform = 'none';
    }
  }

  function onGlobalScroll() {
    if (!isScrollZoomTicking) {
      requestAnimationFrame(updateScrollZoom);
      isScrollZoomTicking = true;
    }
  }

  // Écouteur global unique et permanent (ne dépend pas de la fermeture lexicale)
  if (!window._kairoScrollZoomListenerAttached) {
    window.addEventListener('scroll', onGlobalScroll, { passive: true });
    window.addEventListener('resize', onGlobalScroll, { passive: true });
    window._kairoScrollZoomListenerAttached = true;
  }

  function initScrollZoom() {
    // Déclenchement immédiat du calcul sur les nouveaux éléments du DOM
    requestAnimationFrame(updateScrollZoom);
  }

  // 5. Fonctions de Navigation et Zoom Plein Écran Kiosque
  window.scrollToKioskFullscreen = function(toggle = true) {
    const stage = document.getElementById('showcase-scroll-stage');
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const stageTop = stageRect.top + window.scrollY;
    const stageH = stage.offsetHeight;
    const viewH = window.innerHeight;
    const maxScroll = stageH - viewH;
    const fullscreenScrollY = stageTop + (maxScroll * 0.39);

    const isAlreadyFullscreen = Math.abs(window.scrollY - fullscreenScrollY) < (maxScroll * 0.15);

    if (toggle && isAlreadyFullscreen) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: fullscreenScrollY, behavior: 'smooth' });
    }
  };

  window.scrollToKioskTop = function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 6. Gestionnaire de vitrines interactives Apple « De plus près »
  function initDePlusPres() {
    const containers = document.querySelectorAll('[data-apple-explorer]');
    containers.forEach(container => {
      const pills = container.querySelectorAll('.apple-pill-btn');
      const views = container.querySelectorAll('.apple-explorer-view');
      const descEl = container.querySelector('[data-explorer-desc]');
      const titleEl = container.querySelector('[data-explorer-title]');

      pills.forEach(pill => {
        pill.addEventListener('click', (e) => {
          e.preventDefault();
          const target = pill.getAttribute('data-target');
          if (!target) return;

          // Mise à jour des boutons pilules
          pills.forEach(p => {
            const isTarget = p === pill;
            p.classList.toggle('active', isTarget);
            const iconSpan = p.querySelector('.pill-icon');
            if (iconSpan) {
              iconSpan.innerHTML = isTarget 
                ? '<span class="material-symbols-outlined text-[13px]">check</span>' 
                : '<span class="material-symbols-outlined text-[13px]">add</span>';
            }
          });

          // Transition fluide entre les vues
          views.forEach(v => {
            if (v.getAttribute('data-view') === target) {
              v.classList.remove('hidden', 'opacity-0', 'scale-95');
              v.classList.add('flex', 'opacity-100', 'scale-100');
            } else {
              v.classList.add('hidden', 'opacity-0', 'scale-95');
              v.classList.remove('flex', 'opacity-100', 'scale-100');
            }
          });

          // Mise à jour optionnelle du texte descriptif
          const newDesc = pill.getAttribute('data-desc');
          if (descEl && newDesc) {
            descEl.style.opacity = '0';
            setTimeout(() => {
              descEl.textContent = newDesc;
              descEl.style.opacity = '1';
            }, 120);
          }

          const newTitle = pill.getAttribute('data-title');
          if (titleEl && newTitle) {
            titleEl.style.opacity = '0';
            setTimeout(() => {
              titleEl.textContent = newTitle;
              titleEl.style.opacity = '1';
            }, 120);
          }
        });
      });
    });
  }

  // 6. Gestion globale de l'accordéon FAQ (Infaillible, compatible SPA et DOM dynamiques)
  function initFaqAccordion() {
    // Les écouteurs sont délégués sur le document pour garantir le bon fonctionnement
    // même lors des navigations sans rechargement de page.
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.faq-btn');
    if (!btn) return;
    const item = btn.closest('.faq-item');
    if (!item) return;
    const content = item.querySelector('.faq-content');
    if (!content) return;
    const icon = btn.querySelector('.material-symbols-outlined');

    const isOpen = !content.classList.contains('hidden');

    // Fermer les autres questions pour une présentation épurée (Style Apple)
    document.querySelectorAll('.faq-item').forEach(otherItem => {
      if (otherItem !== item) {
        const otherContent = otherItem.querySelector('.faq-content');
        const otherIcon = otherItem.querySelector('.material-symbols-outlined');
        if (otherContent) otherContent.classList.add('hidden');
        if (otherIcon) otherIcon.style.transform = 'rotate(0deg)';
      }
    });

    // Basculer l'état de la question cliquée
    if (isOpen) {
      content.classList.add('hidden');
      if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
      content.classList.remove('hidden');
      if (icon) icon.style.transform = 'rotate(180deg)';
    }
  });

  // Initialisation au chargement
  window.initScrollReveal = initScrollReveal;
  window.initScrollZoom = initScrollZoom;
  window.initDePlusPres = initDePlusPres;
  window.initFaqAccordion = initFaqAccordion;

  function initAll() {
    initScrollReveal();
    initScrollZoom();
    initDePlusPres();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();

