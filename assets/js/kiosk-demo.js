/**
 * KaïroOS — Kiosk Demo Interactif
 * Gère le rayonnage de jeux, la sélection fluide, la navigation au clavier (Flèches, Entrée),
 * les boutons Précédent/Suivant (flottants et dans le rayonnage),
 * les gestes de glissement / swipe tactile et drag souris,
 * le défilement interactif des jeux au scroll vertical (suppression de la zone morte),
 * et le bouton orange/vert de zoom de la fenêtre macOS vers le plein écran.
 */

(function() {
  function initKioskDemo() {
    const shelf = document.getElementById('shelf');
    const kioskBg = document.getElementById('kiosk-bg');
    const gameTitle = document.getElementById('game-title');
    const gameTag = document.getElementById('game-tag');
    const gameGenre = document.getElementById('game-genre');
    const gameDesc = document.getElementById('game-desc');
    const gameCards = Array.from(document.querySelectorAll('.game-card'));
    const kioskScreen = document.getElementById('kiosk-stage-screen');
    const kioskInteractive = document.getElementById('kiosk-interactive');
    const counterEl = document.getElementById('kiosk-counter');

    if (!shelf || !gameCards.length) return;

    let currentIndex = 0;
    let hasDragged = false;
    let isMouseDown = false;
    let isManualNavigating = false;
    let manualNavTimer = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let wheelDebounce = false;

    // 1. Sélection d'un jeu
    function selectGame(index, animateScroll = true) {
      if (index < 0 || index >= gameCards.length) return;
      currentIndex = index;
      const card = gameCards[index];

      // Mise à jour visuelle des cartes du rayonnage
      gameCards.forEach((c, idx) => {
        const titleEl = c.querySelector('.card-title');
        const subEl = c.querySelector('.card-sub');
        const imgContainer = c.querySelector('.card-img-wrap') || c.querySelector('[class*="aspect-"]');

        if (idx === index) {
          // Carte active : ZOOM, halo lumineux et z-index au premier plan
          c.classList.add(
            'border-brand-400',
            'border-2',
            'scale-110',
            'sm:scale-115',
            '-translate-y-3',
            'shadow-[0_20px_45px_rgba(99,102,241,0.45)]',
            'opacity-100',
            'bg-white/15',
            'z-20'
          );
          c.classList.remove('border-white/10', 'scale-100', 'translate-y-0', 'opacity-65', 'bg-white/5', 'z-10');

          // Texte agrandi et contrasté
          if (titleEl) {
            titleEl.className = 'card-title font-bold text-xs sm:text-sm truncate text-white transition-all scale-105 origin-left';
          }
          if (subEl) {
            subEl.className = 'card-sub text-[10px] font-mono text-brand-300 font-semibold transition-all';
          }

          if (imgContainer && !imgContainer.querySelector('.active-badge')) {
            const activeBadge = document.createElement('span');
            activeBadge.className = 'active-badge absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-brand-600 text-white font-mono text-[9px] font-bold shadow-md tracking-wider';
            activeBadge.textContent = 'ACTIF';
            imgContainer.appendChild(activeBadge);
          }
        } else {
          // Cartes inactives : DÉZOOM à la taille de base avec texte compact
          c.classList.remove(
            'border-brand-400',
            'border-2',
            'scale-110',
            'sm:scale-115',
            '-translate-y-3',
            'shadow-[0_20px_45px_rgba(99,102,241,0.45)]',
            'opacity-100',
            'bg-white/15',
            'z-20'
          );
          c.classList.add('border-white/10', 'scale-100', 'translate-y-0', 'opacity-65', 'bg-white/5', 'z-10');

          // Texte réduit au dézoom
          if (titleEl) {
            titleEl.className = 'card-title font-semibold text-[10px] sm:text-[11px] truncate text-slate-400 transition-all';
          }
          if (subEl) {
            subEl.className = 'card-sub text-[9px] font-mono text-slate-500 transition-all';
          }

          const badge = c.querySelector('.active-badge');
          if (badge) badge.remove();
        }
      });

      // Mise à jour du compteur dynamique (ex: 1 / 8)
      if (counterEl) {
        counterEl.textContent = `${index + 1} / ${gameCards.length}`;
      }

      // Défilement horizontal fluide à l'intérieur du rayonnage uniquement si demandé
      if (animateScroll && shelf && shelf.scrollTo) {
        const scrollOffset = card.offsetLeft - (shelf.clientWidth / 2) + (card.offsetWidth / 2);
        shelf.scrollTo({ left: Math.max(0, scrollOffset), behavior: 'smooth' });
      }

      // Mise à jour des informations avec micro-transition
      const currentLang = window.kairoI18n ? window.kairoI18n.getLang() : 'fr';
      
      if (gameTitle) {
        gameTitle.style.transition = 'opacity 0.12s ease, transform 0.12s ease';
        gameTitle.style.opacity = '0.3';
        gameTitle.style.transform = 'translateY(2px)';
        setTimeout(() => {
          gameTitle.textContent = card.getAttribute('data-title');
          gameTitle.style.opacity = '1';
          gameTitle.style.transform = 'translateY(0)';
        }, 80);
      }

      if (gameTag) gameTag.textContent = card.getAttribute('data-tag');
      if (gameGenre) gameGenre.textContent = card.getAttribute('data-genre');
      if (gameDesc) gameDesc.textContent = card.getAttribute('data-desc-' + currentLang);

      // Fond dynamique
      const newBg = card.getAttribute('data-bg');
      if (kioskBg && newBg) {
        kioskBg.style.transition = 'opacity 0.2s ease';
        kioskBg.style.opacity = '0.15';
        setTimeout(() => {
          kioskBg.style.backgroundImage = `url("${newBg}")`;
          kioskBg.style.opacity = '0.4';
        }, 120);
      }
    }

    // Gestion de la navigation manuelle (pause le sync scroll pour éviter tout conflit)
    function triggerManualSelection(idx) {
      isManualNavigating = true;
      clearTimeout(manualNavTimer);
      manualNavTimer = setTimeout(() => {
        isManualNavigating = false;
      }, 550);
      selectGame(idx, true);
    }

    function nextGame() {
      const nextIdx = (currentIndex + 1) % gameCards.length;
      triggerManualSelection(nextIdx);
    }

    function prevGame() {
      const prevIdx = (currentIndex - 1 + gameCards.length) % gameCards.length;
      triggerManualSelection(prevIdx);
    }

    // 2. Défilement interactif des jeux au Scroll de la page (Suppression de la zone morte)
    window.kairoKioskScrollProgress = function(p) {
      if (isManualNavigating) return;
      if (!shelf || !gameCards.length) return;

      const clampedP = Math.min(1, Math.max(0, p));
      const maxShelfScroll = shelf.scrollWidth - shelf.clientWidth;

      // Défilement continu physique du rayonnage
      if (maxShelfScroll > 0) {
        shelf.scrollLeft = clampedP * maxShelfScroll;
      }

      // Sélection du jeu le plus proche du centre de la vue
      const shelfCenter = shelf.scrollLeft + (shelf.clientWidth / 2);
      let bestIdx = 0;
      let minDiff = Infinity;

      gameCards.forEach((c, idx) => {
        const cardCenter = c.offsetLeft + (c.offsetWidth / 2);
        const diff = Math.abs(cardCenter - shelfCenter);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = idx;
        }
      });

      if (bestIdx !== currentIndex) {
        selectGame(bestIdx, false);
      }
    };

    // 3. Clic sur les cartes
    gameCards.forEach((card, idx) => {
      card.addEventListener('click', (e) => {
        if (hasDragged) return;
        triggerManualSelection(idx);
      });
    });

    // 4. Boutons de navigation (Rayonnage & Flottants latéraux)
    const btnPrev = document.getElementById('btn-prev-game');
    const btnNext = document.getElementById('btn-next-game');
    const btnFloatPrev = document.getElementById('btn-float-prev');
    const btnFloatNext = document.getElementById('btn-float-next');

    if (btnPrev) btnPrev.addEventListener('click', (e) => { e.stopPropagation(); prevGame(); });
    if (btnNext) btnNext.addEventListener('click', (e) => { e.stopPropagation(); nextGame(); });
    if (btnFloatPrev) btnFloatPrev.addEventListener('click', (e) => { e.stopPropagation(); prevGame(); });
    if (btnFloatNext) btnFloatNext.addEventListener('click', (e) => { e.stopPropagation(); nextGame(); });

    // 5. Gestes de Glissement (Slide / Swipe Tactile & Souris)
    const gestureTargets = [kioskScreen, shelf, kioskInteractive].filter(Boolean);

    // Événements Tactiles (Mobile / Tablettes / Écrans tactiles)
    gestureTargets.forEach(target => {
      target.addEventListener('touchstart', (e) => {
        if (!e.touches || !e.touches[0]) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      target.addEventListener('touchend', (e) => {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;

        if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 0.8) {
          if (deltaX < 0) {
            nextGame();
          } else {
            prevGame();
          }
        }
      }, { passive: true });
    });

    // Événements Souris Drag & Drop (Desktop)
    if (kioskScreen) {
      kioskScreen.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        isMouseDown = true;
        hasDragged = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
      });

      window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        const dist = Math.abs(e.clientX - dragStartX);
        if (dist > 8) {
          hasDragged = true;
        }
      });

      window.addEventListener('mouseup', (e) => {
        if (!isMouseDown) return;
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        if (hasDragged && Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 0.7) {
          if (deltaX < 0) {
            nextGame();
          } else {
            prevGame();
          }
        }
        isMouseDown = false;
        setTimeout(() => { hasDragged = false; }, 80);
      });
    }

    // Défilement horizontal au pavé tactile (Wheel / Trackpad)
    gestureTargets.forEach(target => {
      target.addEventListener('wheel', (e) => {
        if (wheelDebounce) return;
        if (Math.abs(e.deltaX) > 25 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          wheelDebounce = true;
          if (e.deltaX > 0) {
            nextGame();
          } else {
            prevGame();
          }
          setTimeout(() => { wheelDebounce = false; }, 320);
        }
      }, { passive: true });
    });

    // 6. Boutons de Contrôle de Fenêtre macOS (Traffic Lights)
    const macBtnClose = document.getElementById('mac-btn-close');
    const macBtnZoom = document.getElementById('mac-btn-zoom');
    const macBtnFullscreen = document.getElementById('mac-btn-fullscreen');

    function handleZoomToFullscreen(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (typeof window.scrollToKioskFullscreen === 'function') {
        window.scrollToKioskFullscreen(true);
      } else {
        const stage = document.getElementById('showcase-scroll-stage');
        if (stage) {
          const rect = stage.getBoundingClientRect();
          const target = window.scrollY + rect.top + (stage.offsetHeight - window.innerHeight) * 0.39;
          window.scrollTo({ top: target, behavior: 'smooth' });
        }
      }
    }

    if (macBtnZoom) {
      macBtnZoom.addEventListener('click', handleZoomToFullscreen);
    }
    if (macBtnFullscreen) {
      macBtnFullscreen.addEventListener('click', handleZoomToFullscreen);
    }
    if (macBtnClose) {
      macBtnClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.scrollToKioskTop === 'function') {
          window.scrollToKioskTop();
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    // 7. Navigation au clavier
    if (!window._kairoKioskKeyBound) {
      window.addEventListener('keydown', (e) => {
        const kioskEl = document.getElementById('kiosk-interactive');
        if (!kioskEl) return;
        const rect = kioskEl.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

        if (isVisible) {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextGame();
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevGame();
          } else if (e.key === 'Enter') {
            const currentCard = gameCards[currentIndex];
            const title = currentCard ? currentCard.getAttribute('data-title') : 'Jeu';
            if (window.showToast) {
              window.showToast(`🎮 Lancement simulé de ${title} en plein écran 60 FPS...`, 'info');
            }
          }
        }
      });
      window._kairoKioskKeyBound = true;
    }

    // 8. Écoute des changements de langue i18n
    if (window.kairoI18n && !window._kairoKioskI18nBound) {
      window.kairoI18n.onChange((lang) => {
        const activeCard = gameCards[currentIndex];
        if (activeCard && gameDesc) {
          gameDesc.textContent = activeCard.getAttribute('data-desc-' + lang);
        }
      });
      window._kairoKioskI18nBound = true;
    }

    // 9. Sélection initiale silencieuse
    selectGame(0, false);
  }

  window.initKioskDemo = initKioskDemo;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKioskDemo);
  } else {
    initKioskDemo();
  }
})();
