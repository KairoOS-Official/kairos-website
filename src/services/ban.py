from datetime import datetime, timezone
from src.data.db import get_db

def is_ip_completely_banned(client_ip):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM banned_ips WHERE ip_address = ?", (client_ip,))
    ban = cursor.fetchone()
    if not ban:
        conn.close()
        return False, None
    ban_dict = dict(ban)
    if ban_dict.get('ban_type') == 'temp' and ban_dict.get('expires_at'):
        try:
            exp_str = ban_dict['expires_at'].replace('Z', '+00:00')
            exp_dt = datetime.fromisoformat(exp_str)
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            if now >= exp_dt:
                cursor.execute("DELETE FROM banned_ips WHERE id = ?", (ban_dict['id'],))
                conn.commit()
                conn.close()
                return False, None
        except Exception:
            pass
    conn.close()
    if ban_dict.get('block_all') == 1:
        return True, ban_dict
    return False, None

def check_ip_ban(client_ip, action_type='all'):
    """
    action_type: 'vote', 'proposal', 'suggestion', or 'all'
    returns: (is_banned: bool, ban_info: dict or None)
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM banned_ips WHERE ip_address = ?", (client_ip,))
    ban = cursor.fetchone()
    if not ban:
        conn.close()
        return False, None

    ban_dict = dict(ban)
    if ban_dict.get('ban_type') == 'temp' and ban_dict.get('expires_at'):
        try:
            exp_str = ban_dict['expires_at'].replace('Z', '+00:00')
            exp_dt = datetime.fromisoformat(exp_str)
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            if now >= exp_dt:
                cursor.execute("DELETE FROM banned_ips WHERE id = ?", (ban_dict['id'],))
                conn.commit()
                conn.close()
                return False, None
        except Exception:
            pass

    is_blocked = False
    if ban_dict.get('block_all') == 1:
        is_blocked = True
    elif action_type == 'vote' and ban_dict.get('block_vote') == 1:
        is_blocked = True
    elif action_type == 'proposal' and ban_dict.get('block_proposal') == 1:
        is_blocked = True
    elif action_type == 'suggestion' and ban_dict.get('block_suggestion') == 1:
        is_blocked = True

    conn.close()
    if is_blocked:
        return True, ban_dict
    return False, None

def get_banned_page_html(client_ip, ban_info):
    reason = ban_info.get('reason') or "Infraction aux conditions d'utilisation."
    expires = ban_info.get('expires_at') or 'Bannissement permanent'
    html = '''<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>403 - Accès Refusé | KaïroOS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4 font-sans">
  <div class="max-w-md w-full bg-slate-900 border border-rose-900/50 rounded-3xl p-8 text-center shadow-2xl space-y-5">
    <div class="w-16 h-16 rounded-2xl bg-rose-950/80 text-rose-500 flex items-center justify-center mx-auto text-3xl font-bold border border-rose-800">
      🚫
    </div>
    <div>
      <h1 class="text-2xl font-bold text-white tracking-tight">Accès Totalement Interdit</h1>
      <p class="text-xs text-rose-400 font-mono mt-1">Vous avez été sanctionné par l'administration</p>
    </div>
    <div class="bg-slate-950/80 rounded-2xl p-4 text-xs font-mono text-left border border-slate-800 space-y-2">
      <div class="text-slate-400">Adresse IP : <span class="text-white font-bold">{{CLIENT_IP}}</span></div>
      <div class="text-slate-400">Motif : <span class="text-rose-400 font-sans">{{REASON}}</span></div>
      <div class="text-slate-400">Expiration : <span class="text-amber-400">{{EXPIRES}}</span></div>
    </div>
    <p class="text-xs text-slate-400 leading-relaxed">
      L'accès à l'ensemble du site web et à ses services a été bloqué pour votre adresse IP.
    </p>

    <!-- FORMULAIRE DE RECOURS / OPPOSITION DIRECTE AU BANNISSEMENT -->
    <div class="border-t border-slate-800 pt-4 text-left space-y-3">
      <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
        <span>⚖️ S'opposer au ban / Faire une réclamation</span>
      </h3>
      <p class="text-[11px] text-amber-300/90 leading-relaxed bg-amber-950/40 border border-amber-800/50 rounded-xl p-2.5">
        <strong>Attention :</strong> en contestant, si la sanction s'avère justifiée et que la contestation est abusive, la sanction pourra être aggravée jusqu'au blocage total du site ou au bannissement à vie.
      </p>
      <form id="appeal-form" class="space-y-2.5">
        <input type="email" id="appeal-email" required placeholder="Votre email de contact (obligatoire, 5 recours max / 12h)" class="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500">
        <textarea id="appeal-message" rows="3" required placeholder="Expliquez pourquoi vous contestez cette sanction..." class="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"></textarea>
        <button type="submit" id="btn-submit-appeal" class="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg cursor-pointer transition-colors">
          Envoyer mon recours à l'administrateur
        </button>
        <div id="appeal-feedback" class="hidden p-3 rounded-xl text-xs font-mono text-center"></div>
      </form>
    </div>

    <!-- DISCUSSION INSTANTANÉE AVEC L'ADMINISTRATEUR -->
    <div id="ban-chat-box" class="hidden border-t border-slate-800 pt-4 text-left space-y-3">
      <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>Discussion avec l'administrateur</span>
      </h3>
      <div id="ban-chat-list" class="space-y-2 max-h-64 overflow-y-auto text-xs"></div>
      <form id="ban-chat-form" class="flex items-center gap-2">
        <input id="ban-chat-input" type="text" maxlength="2000" placeholder="Répondre à l'administrateur..." class="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500">
        <button type="submit" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 cursor-pointer">Envoyer</button>
      </form>
      <p class="text-[10px] text-slate-500 font-mono">Les nouveaux messages arrivent automatiquement, sans recharger la page.</p>
    </div>
  </div>

  <script>
    document.getElementById('appeal-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('appeal-email').value.trim();
      const msg = document.getElementById('appeal-message').value.trim();
      const fb = document.getElementById('appeal-feedback');
      const btn = document.getElementById('btn-submit-appeal');
      btn.disabled = true;
      btn.textContent = 'Envoi du recours...';

      fetch('/api/ban/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, message: msg })
      })
      .then(r => r.json())
      .then(res => {
        fb.classList.remove('hidden');
        if (res.status === 'ok') {
          fb.className = 'p-3 rounded-xl text-xs font-mono bg-emerald-950/60 border border-emerald-800 text-emerald-300';
          fb.textContent = '✓ ' + res.message;
          btn.classList.add('hidden');
        } else {
          fb.className = 'p-3 rounded-xl text-xs font-mono bg-rose-950/60 border border-rose-800 text-rose-300';
          fb.textContent = 'Erreur : ' + (res.message || 'Échec de l\'envoi');
          btn.disabled = false;
          btn.textContent = 'Réessayer';
        }
      })
      .catch(() => {
        fb.classList.remove('hidden');
        fb.className = 'p-3 rounded-xl text-xs font-mono bg-rose-950/60 border border-rose-800 text-rose-300';
        fb.textContent = 'Erreur réseau de communication.';
        btn.disabled = false;
        btn.textContent = 'Réessayer';
      });
    });

    function paintBanChat(msgs) {
      const list = document.getElementById('ban-chat-list');
      if (!list) return;
      list.innerHTML = '';
      msgs.forEach((m) => {
        const mine = m.sender === 'visitor';
        const div = document.createElement('div');
        div.className = 'flex ' + (mine ? 'justify-end' : 'justify-start');
        div.innerHTML = '<div class="max-w-[85%] px-3 py-2 rounded-2xl leading-relaxed ' + (mine ? 'bg-rose-600 text-white rounded-br-md' : 'bg-slate-800 text-slate-100 rounded-bl-md border border-slate-700') + '">' + m.message + '</div>';
        list.appendChild(div);
      });
      list.scrollTop = list.scrollHeight;
    }
    function fetchBanChat() {
      fetch('/api/user/chat')
        .then((r) => r.json())
        .then((data) => {
          if (!data.has_thread) return;
          document.getElementById('ban-chat-box').classList.remove('hidden');
          paintBanChat(data.messages || []);
        })
        .catch(() => {});
    }
    document.getElementById('ban-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = document.getElementById('ban-chat-input');
      const msg = inp.value.trim();
      if (!msg) return;
      fetch('/api/user/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      })
      .then((r) => r.json())
      .then(() => { inp.value = ''; fetchBanChat(); });
    });
    fetchBanChat();
    setInterval(fetchBanChat, 10000);
  </script>
</body>
</html>'''
    return html.replace('{{CLIENT_IP}}', client_ip).replace('{{REASON}}', reason).replace('{{EXPIRES}}', expires)
