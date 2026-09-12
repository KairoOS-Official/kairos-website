/**
 * KairoOS Admin Live Toolbar & In-Page Editor
 * Active l'édition visuelle en direct sur la page pour les administrateurs connectés.
 */
(function() {
  const token = localStorage.getItem('kairo_admin_token');
  if (!token) return;

  // Vérifier la validité du jeton
  fetch('/api/auth/check', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.authenticated) {
      localStorage.removeItem('kairo_admin_token');
      return;
    }
    initToolbar();
  })
  .catch(() => {});

  function initToolbar() {
    let isEditMode = false;

    // Créer la barre flottante discrète
    const bar = document.createElement('div');
    bar.id = 'kairo-admin-toolbar';
    bar.className = 'fixed bottom-5 right-5 z-50 flex items-center gap-2.5 p-2 bg-slate-900/90 text-white rounded-full shadow-2xl border border-slate-700/80 backdrop-blur-md text-xs font-sans select-none transition-all duration-300';
    bar.innerHTML = `
      <div class="flex items-center gap-1.5 pl-3 pr-1 text-slate-300 font-bold font-mono">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>ADMIN</span>
      </div>
      <button id="kairo-toggle-edit-btn" type="button" class="px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer">
        <span class="material-symbols-outlined text-sm">edit</span>
        <span id="kairo-edit-status">Édition : OFF</span>
      </button>
      <button id="kairo-save-content-btn" type="button" class="hidden px-3.5 py-1.5 rounded-full bg-brand-600 hover:bg-brand-500 text-white font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer">
        <span class="material-symbols-outlined text-sm">save</span>
        <span>Sauvegarder</span>
      </button>
      <a href="/admin" class="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">dashboard</span>
        <span>Dashboard</span>
      </a>
      <button id="kairo-logout-btn" title="Déconnexion" type="button" class="w-7 h-7 rounded-full bg-slate-800 hover:bg-rose-900/50 hover:text-rose-400 text-slate-400 flex items-center justify-center transition-colors">
        <span class="material-symbols-outlined text-sm">logout</span>
      </button>
    `;
    document.body.appendChild(bar);

    const toggleBtn = document.getElementById('kairo-toggle-edit-btn');
    const statusText = document.getElementById('kairo-edit-status');
    const saveBtn = document.getElementById('kairo-save-content-btn');
    const logoutBtn = document.getElementById('kairo-logout-btn');

    // Basculer le mode édition
    toggleBtn.addEventListener('click', () => {
      isEditMode = !isEditMode;
      statusText.innerText = isEditMode ? 'Édition : ACTIVE' : 'Édition : OFF';
      toggleBtn.className = isEditMode
        ? 'px-3 py-1.5 rounded-full bg-amber-500 text-slate-950 font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow'
        : 'px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer';

      if (isEditMode) {
        saveBtn.classList.remove('hidden');
      } else {
        saveBtn.classList.add('hidden');
      }

      document.querySelectorAll('[data-content-key]').forEach(el => {
        el.contentEditable = isEditMode ? "true" : "false";
        if (isEditMode) {
          el.classList.add('ring-2', 'ring-amber-400/70', 'ring-offset-2', 'rounded', 'p-0.5', 'bg-amber-400/5');
        } else {
          el.classList.remove('ring-2', 'ring-amber-400/70', 'ring-offset-2', 'rounded', 'p-0.5', 'bg-amber-400/5');
        }
      });

      if (window.showToast) {
        window.showToast(isEditMode ? 'Mode édition en direct activé. Cliquez sur un texte pour le modifier.' : 'Mode édition désactivé.');
      }
    });

    // Sauvegarder les modifications
    saveBtn.addEventListener('click', () => {
      const updates = {};
      document.querySelectorAll('[data-content-key]').forEach(el => {
        const key = el.getAttribute('data-content-key');
        updates[key] = el.innerText.trim();
      });

      saveBtn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">refresh</span> Enregistrement...`;
      saveBtn.disabled = true;

      fetch('/api/content/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ content: updates })
      })
      .then(res => res.json())
      .then(data => {
        saveBtn.innerHTML = `<span class="material-symbols-outlined text-sm">check</span> Sauvegardé !`;
        setTimeout(() => {
          saveBtn.innerHTML = `<span class="material-symbols-outlined text-sm">save</span> Sauvegarder`;
          saveBtn.disabled = false;
        }, 1500);

        if (window.showToast) {
          window.showToast('✅ Tous les textes ont été enregistrés dans la base de données !');
        }
      })
      .catch(() => {
        saveBtn.innerHTML = `<span class="material-symbols-outlined text-sm">error</span> Erreur`;
        saveBtn.disabled = false;
      });
    });

    // Déconnexion
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('kairo_admin_token');
      bar.remove();
      document.querySelectorAll('[data-content-key]').forEach(el => {
        el.contentEditable = "false";
        el.classList.remove('ring-2', 'ring-amber-400/70', 'ring-offset-2', 'rounded', 'p-0.5', 'bg-amber-400/5');
      });
      if (window.showToast) {
        window.showToast('Session admin fermée.');
      }
    });
  }
})();
