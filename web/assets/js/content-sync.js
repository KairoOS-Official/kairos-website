/**
 * KaïroOS Content Synchronizer Multilingue
 * Charge le contenu dynamique (Textes, Jeux, FAQ, Vitrines) depuis l'API SQLite
 * selon la langue active (FR / EN).
 */
(function() {
  function applyContent(data) {
    if (!data) return;

    // 1. Textes génériques éditables (data-content-key)
    if (data.content) {
      document.querySelectorAll('[data-content-key]').forEach(el => {
        const key = el.getAttribute('data-content-key');
        const val = data.content[key] ??
                    data.content['home_' + key] ??
                    data.content['themes_' + key] ??
                    data.content['plugins_' + key] ??
                    data.content['roadmap_' + key] ??
                    data.content[key.replace(/^(home|themes|plugins|roadmap)_/, '')];
        if (val !== undefined && val !== null) {
          el.innerHTML = val;
        }
      });
    }

    // 2. Jeux du Kiosque d'Arcade (si sur la page avec #shelf)
    const shelf = document.getElementById('shelf');
    if (shelf && data.games && data.games.length > 0) {
      const currentCards = shelf.querySelectorAll('.game-card');
      const currentIds = Array.from(currentCards).map(c => c.getAttribute('data-title')).join('|');
      const newIds = data.games.map(g => g.title).join('|');

      if (currentIds !== newIds) {
        shelf.innerHTML = '';
        data.games.forEach((game, idx) => {
          const btn = document.createElement('button');
          btn.className = `game-card flex-none relative rounded-2xl overflow-hidden aspect-[3/4] w-36 sm:w-44 lg:w-48 transition-all duration-300 transform select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 border border-white/10 ${idx === 0 ? 'scale-105 shadow-2xl ring-2 ring-white/50 z-20' : 'opacity-70 hover:opacity-100 hover:scale-100'}`;
          btn.setAttribute('data-index', idx);
          btn.setAttribute('data-id', game.id || idx);
          btn.setAttribute('data-title', game.title);
          btn.setAttribute('data-tag', game.genre || 'Arcade');
          btn.setAttribute('data-genre', `${game.genre || 'Arcade'} · ${game.year || 'Retro'}`);
          btn.setAttribute('data-desc-fr', game.desc_fr || `${game.title} optimisé pour KaïroOS.`);
          btn.setAttribute('data-desc-en', game.desc_en || `${game.title} optimized for KaïroOS.`);
          btn.setAttribute('data-bg', game.bg_image || 'assets/img/wallpapers/bg-mario.jpg');
          btn.setAttribute('type', 'button');

          btn.innerHTML = `
            <img src="${game.image || 'assets/img/games/mario.png'}" alt="${game.title}" class="w-full h-full object-cover pointer-events-none transform transition-transform duration-500 group-hover:scale-105" loading="lazy">
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-3 pointer-events-none">
              <span class="text-white font-display font-bold text-xs sm:text-sm truncate drop-shadow">${game.title}</span>
              <span class="text-white/60 text-[10px] font-mono">${game.year || 'Arcade'}</span>
            </div>
          `;
          shelf.appendChild(btn);
        });

        if (typeof window.initKioskDemo === 'function') {
          window.initKioskDemo();
        }
      }
    }

    // 3. Questions Fréquentes (FAQ)
    const faqContainer = document.getElementById('faq-accordion-container');
    if (faqContainer && data.faq && data.faq.length > 0) {
      const currentFaqQuestions = Array.from(faqContainer.querySelectorAll('.faq-btn span.font-bold')).map(s => s.innerText.trim()).join('|');
      const newFaqQuestions = data.faq.map(f => (f.question || f.question_fr || '').trim()).join('|');

      if (currentFaqQuestions !== newFaqQuestions) {
        faqContainer.innerHTML = '';
        data.faq.forEach((item, idx) => {
          const q = item.question || item.question_fr || '';
          const a = item.answer || item.answer_fr || '';
          const div = document.createElement('div');
          div.className = 'faq-item bg-white rounded-2xl border border-slate-200/80 shadow-subtle overflow-hidden';
          div.setAttribute('data-faq-id', item.id || idx);
          div.innerHTML = `
            <button type="button" class="faq-btn w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-display font-bold text-sm text-heading" data-track="faq_toggle_${item.id || idx}">
              <span>${q}</span>
              <span class="material-symbols-outlined text-slate-400 transition-transform duration-200" style="transform: rotate(0deg);">expand_more</span>
            </button>
            <div class="faq-content px-4 sm:px-5 pb-4 sm:pb-5 text-xs text-muted border-t border-slate-100 pt-3 leading-relaxed hidden">
              <p>${a}</p>
            </div>
          `;
          faqContainer.appendChild(div);
        });
      }
    }
  }

  function fetchContentForLang(lang) {
    fetch('/api/content?lang=' + (lang || 'fr'))
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'ok') {
          applyContent(data);
          try {
            localStorage.setItem('kairo_cached_content_' + lang, JSON.stringify(data));
          } catch(e) {}
        }
      })
      .catch(() => {});
  }

  // Écouter les changements de langue
  if (window.kairoI18n) {
    window.kairoI18n.onChange(lang => {
      // Charger le cache immédiat de cette langue si dispo
      try {
        const cached = localStorage.getItem('kairo_cached_content_' + lang);
        if (cached) applyContent(JSON.parse(cached));
      } catch(e) {}
      fetchContentForLang(lang);
    });
  } else {
    fetchContentForLang('fr');
  }

  window.kairoApplyContent = applyContent;
})();
