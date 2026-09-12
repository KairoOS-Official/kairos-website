// assets/js/ban-system.js — KaïroOS Sanctions & Appeals System
(function() {
  let userBanInfo = null;

  // 1. Vérifier le statut de sanction de l'IP dès le chargement de la page
  fetch('/api/user/ban-status')
    .then(r => r.json())
    .then(data => {
      if (data.is_banned) {
        userBanInfo = data;
        renderBanWarningBanner(data);
        setupBanInterceptors(data);
      }
    })
    .catch(() => {});

  // 2. Bannière bas de page si l'IP est sanctionnée (taille moyenne, non fermable sans recours)
  function renderBanWarningBanner(ban) {
    if (document.getElementById('ban-warning-banner')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'ban-warning-banner';
    wrapper.className = 'fixed bottom-4 inset-x-0 z-[80] px-4 pointer-events-none flex justify-center';

    const banner = document.createElement('div');
    banner.className = 'pointer-events-auto w-full max-w-xl bg-rose-600 text-white rounded-2xl shadow-2xl border-2 border-rose-400 overflow-hidden';

    let restrictions = [];
    if (ban.block_all) restrictions.push('Accès global');
    if (ban.block_vote) restrictions.push('Votes bloqués');
    if (ban.block_proposal) restrictions.push('Boîte à idées bloquée');
    if (ban.block_suggestion) restrictions.push('Compléments bloqués');

    const expText = ban.expires_at ? ` (Expire le ${ban.expires_at.replace('T', ' ').substring(0, 16)})` : ' (Définitif)';

    banner.innerHTML = `
      <div class="p-4 flex items-start gap-3">
        <span class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-xl font-bold">🚫</span>
        <div class="flex-1 min-w-0">
          <strong class="font-display font-bold text-sm">Sanction active sur votre adresse IP (${ban.ip})</strong>
          <div class="text-xs text-rose-100 leading-relaxed mt-0.5">${restrictions.join(', ')} — Motif : <em class="not-italic font-semibold text-white">${ban.reason || 'Non respect des règles'}</em>${expText}</div>
        </div>
      </div>
      <div class="px-4 pb-4">
        <button id="btn-open-appeal-banner" type="button" class="w-full py-2 rounded-xl bg-white text-rose-700 hover:bg-rose-50 font-bold text-xs shadow cursor-pointer transition-all">
          ⚖️ Contester cette sanction / Recours (seul moyen de la retirer)
        </button>
      </div>
    `;

    wrapper.appendChild(banner);
    document.body.appendChild(wrapper);
    document.body.style.paddingBottom = ((parseInt(document.body.style.paddingBottom) || 0) + 120) + 'px';

    document.getElementById('btn-open-appeal-banner')?.addEventListener('click', () => {
      openAppealModal(ban);
    });
  }

  // 3. Modale d'interdiction explicite lorsqu'une action sanctionnée est tentée
  window.triggerSanctionAlert = function(actionName = 'cette action', customBan = null) {
    const ban = customBan || userBanInfo || {
      ip: 'votre adresse IP',
      reason: 'Sanction appliquée par l\'administration suite à une infraction aux règles',
      expires_at: null
    };
    openSanctionAlertModal(actionName, ban);
    return true;
  };

  function openSanctionAlertModal(actionName, ban) {
    let existingModal = document.getElementById('modal-sanction-blocked');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-sanction-blocked';
    modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
      <div class="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-rose-200 text-center space-y-4">
        <div class="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-3xl font-bold border border-rose-100">
          🚫
        </div>
        <div>
          <h3 class="font-display font-bold text-xl text-slate-900">Vous ne pouvez pas faire ça</h3>
          <p class="text-xs text-rose-600 font-mono font-bold mt-1">Vous avez été sanctionné par l'administration</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-2xl text-left border border-slate-200/80 text-xs font-mono space-y-1.5 text-slate-600">
          <div>Action bloquée : <strong class="text-slate-900">${actionName}</strong></div>
          <div>Votre IP : <strong class="text-slate-900">${ban.ip}</strong></div>
          <div>Motif : <strong class="text-rose-600 font-sans">${ban.reason || 'Non respect des règles de la communauté'}</strong></div>
          <div>Durée : <strong class="text-slate-700">${ban.expires_at ? 'Expire le ' + ban.expires_at.replace('T', ' ').substring(0, 16) : 'Bannissement permanent'}</strong></div>
        </div>
        <p class="text-xs text-slate-500 leading-relaxed">
          Tant que cette sanction est active, votre adresse IP ne peut pas interagir avec cette fonctionnalité.
        </p>
        <div class="pt-2 flex flex-col sm:flex-row gap-2">
          <button id="btn-close-sanction-modal" type="button" class="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer">
            Fermer
          </button>
          <button id="btn-contest-from-sanction" type="button" class="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow cursor-pointer">
            ⚖️ S'opposer au ban
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-close-sanction-modal')?.addEventListener('click', () => modal.remove());
    document.getElementById('btn-contest-from-sanction')?.addEventListener('click', () => {
      modal.remove();
      openAppealModal(ban);
    });
  }

  // 4. Modale de Recours / Réclamation
  function openAppealModal(ban) {
    let existingAppeal = document.getElementById('modal-appeal-dialog');
    if (existingAppeal) existingAppeal.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-appeal-dialog';
    modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
      <div class="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-2xl">⚖️</span>
            <div>
              <h3 class="font-display font-bold text-base text-slate-900">Contester la sanction</h3>
              <p class="text-[11px] text-muted font-mono">Adresse IP : ${ban.ip}</p>
            </div>
          </div>
          <button id="btn-close-appeal-dialog" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center">
            ✕
          </button>
        </div>

        <p class="text-xs text-slate-600 leading-relaxed">
          Si vous estimez que cette sanction est injustifiée (adresse IP partagée, mauvaise interprétation, etc.), vous pouvez soumettre un recours direct à l'administrateur.
        </p>
        <p class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
          <strong>Attention :</strong> en contestant, si la sanction s'avère justifiée et que la contestation est abusive, la sanction pourra être aggravée jusqu'au blocage total du site ou au bannissement à vie.
        </p>

        <form id="form-submit-appeal" class="space-y-3 text-xs">
          <div>
            <label class="block font-mono font-bold text-slate-700 uppercase mb-1">Votre Email * (obligatoire, 5 recours max / 12h)</label>
            <input type="email" id="inp-appeal-email" required placeholder="nom@exemple.com" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-brand-500">
          </div>
          <div>
            <label class="block font-mono font-bold text-slate-700 uppercase mb-1">Explication de votre contestation *</label>
            <textarea id="inp-appeal-message" rows="4" required placeholder="Expliquez calmement la situation et pourquoi la sanction devrait être levée..." class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-brand-500 leading-relaxed"></textarea>
          </div>
          <p class="text-[10px] text-slate-500 font-mono leading-tight">
            <strong>RGPD :</strong> Votre email, adresse IP et message sont traités sous notre intérêt légitime exclusivement pour l'instruction de votre recours (conservation 1 an max). Consultez notre <a href="/legal/confidentialite" target="_blank" class="underline text-brand-600">politique de confidentialité</a>.
          </p>
          <div id="appeal-dialog-feedback" class="hidden p-3 rounded-xl text-xs font-mono text-center"></div>
          <button type="submit" id="btn-send-appeal" class="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md cursor-pointer transition-colors">
            Envoyer ma réclamation à l'administrateur
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-close-appeal-dialog')?.addEventListener('click', () => modal.remove());

    document.getElementById('form-submit-appeal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('inp-appeal-email').value.trim();
      const msg = document.getElementById('inp-appeal-message').value.trim();
      const fb = document.getElementById('appeal-dialog-feedback');
      const btn = document.getElementById('btn-send-appeal');
      fb.classList.remove('hidden');
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        fb.className = 'p-3 rounded-xl text-xs font-mono bg-rose-50 border border-rose-200 text-rose-800';
        fb.textContent = 'Erreur : l\u2019adresse email est obligatoire.';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Transmission en cours...';

      fetch('/api/ban/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, message: msg })
      })
      .then(r => r.json())
      .then(res => {
        fb.classList.remove('hidden');
        if (res.status === 'ok') {
          fb.className = 'p-3 rounded-xl text-xs font-mono bg-emerald-50 border border-emerald-200 text-emerald-800';
          fb.textContent = '✓ ' + res.message;
          btn.classList.add('hidden');
          setTimeout(() => modal.remove(), 4000);
        } else {
          fb.className = 'p-3 rounded-xl text-xs font-mono bg-rose-50 border border-rose-200 text-rose-800';
          fb.textContent = 'Erreur : ' + (res.message || 'Impossible d\'envoyer');
          btn.disabled = false;
          btn.textContent = 'Réessayer';
        }
      })
      .catch(() => {
        fb.classList.remove('hidden');
        fb.className = 'p-3 rounded-xl text-xs font-mono bg-rose-50 border border-rose-200 text-rose-800';
        fb.textContent = 'Erreur réseau.';
        btn.disabled = false;
        btn.textContent = 'Réessayer';
      });
    });
  }

  // 5. Intercepter les clics sur les boutons de vote et formulaires si l'IP est sanctionnée
  function setupBanInterceptors(ban) {
    document.addEventListener('click', (e) => {
      const voteBtn = e.target.closest('.btn-submit-vote');
      if (voteBtn && (ban.block_all || ban.block_vote)) {
        e.preventDefault();
        e.stopPropagation();
        openSanctionAlertModal('Voter pour une fonctionnalité', ban);
      }
    }, true);

    const propForm = document.getElementById('form-community-proposal');
    if (propForm && (ban.block_all || ban.block_proposal)) {
      propForm.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSanctionAlertModal('Proposer une idée de fonctionnalité', ban);
      }, true);
    }
  }

  // 6. Discussion instantanée visiteur <-> admin (bulle en bas à droite si l'admin a ouvert un chat)
  let chatKnownIds = new Set();
  let chatPanelOpen = false;
  let chatPollTimer = null;

  function renderChatBubble() {
    if (document.getElementById('kairo-chat-bubble')) return;
    const bubble = document.createElement('div');
    bubble.id = 'kairo-chat-bubble';
    bubble.className = 'fixed bottom-4 right-4 z-[85] font-sans';
    bubble.innerHTML = `
      <div id="kairo-chat-panel" class="hidden mb-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span class="font-bold text-xs">Discussion avec l'administrateur</span>
          </div>
          <button id="kairo-chat-close" type="button" class="text-slate-300 hover:text-white text-sm px-1">✕</button>
        </div>
        <div id="kairo-chat-list" class="p-3 space-y-2 max-h-64 overflow-y-auto text-xs"></div>
        <form id="kairo-chat-form" class="p-2 border-t border-slate-100 flex items-center gap-2">
          <input id="kairo-chat-input" type="text" maxlength="2000" placeholder="Répondre..." class="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none">
          <button type="submit" class="px-3 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs">Envoyer</button>
        </form>
      </div>
      <button id="kairo-chat-toggle" type="button" class="relative w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xl flex items-center justify-center text-xl">
        💬
        <span id="kairo-chat-badge" class="hidden absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold items-center justify-center">!</span>
      </button>
    `;
    document.body.appendChild(bubble);
    document.getElementById('kairo-chat-toggle').addEventListener('click', () => {
      chatPanelOpen = !chatPanelOpen;
      document.getElementById('kairo-chat-panel').classList.toggle('hidden', !chatPanelOpen);
      if (chatPanelOpen) {
        document.getElementById('kairo-chat-badge').classList.add('hidden');
        fetchChat();
      }
    });
    document.getElementById('kairo-chat-close').addEventListener('click', () => {
      chatPanelOpen = false;
      document.getElementById('kairo-chat-panel').classList.add('hidden');
    });
    document.getElementById('kairo-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = document.getElementById('kairo-chat-input');
      const msg = inp.value.trim();
      if (!msg) return;
      fetch('/api/user/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      })
      .then(r => r.json())
      .then(() => { inp.value = ''; fetchChat(); });
    });
  }

  function paintChatMessages(msgs) {
    const list = document.getElementById('kairo-chat-list');
    if (!list) return;
    list.innerHTML = '';
    msgs.forEach(m => {
      const mine = m.sender === 'visitor';
      const div = document.createElement('div');
      div.className = 'flex ' + (mine ? 'justify-end' : 'justify-start');
      div.innerHTML = `<div class="max-w-[85%] px-3 py-2 rounded-2xl leading-relaxed ${mine ? 'bg-slate-900 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}">${m.message}</div>`;
      list.appendChild(div);
    });
    list.scrollTop = list.scrollHeight;
  }

  function fetchChat() {
    fetch('/api/user/chat')
      .then(r => r.json())
      .then(data => {
        if (!data.has_thread) return;
        renderChatBubble();
        const msgs = data.messages || [];
        let hasNewAdmin = false;
        msgs.forEach(m => {
          if (m.sender === 'admin' && !chatKnownIds.has(m.id)) hasNewAdmin = true;
          chatKnownIds.add(m.id);
        });
        paintChatMessages(msgs);
        if (hasNewAdmin && !chatPanelOpen) {
          const badge = document.getElementById('kairo-chat-badge');
          if (badge) { badge.classList.remove('hidden'); badge.classList.add('flex'); }
        }
      })
      .catch(() => {});
  }

  fetchChat();
  chatPollTimer = setInterval(fetchChat, 10000);

})();
