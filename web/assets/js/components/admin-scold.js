/**
 * KaïroOS — Easter egg HONTE (page admin uniquement, 100% cosmétique).
 * Fichier autonome : ne partage rien avec le Konami fête du site public.
 * Chargé directement par web/admin/index.html.
 * Séquence : Haut Haut Bas Bas Gauche Droite Gauche Droite B A.
 * Effet : la page tourne, vire rouge sang qui coule, NON NON NON + sermon,
 * doigt qui fait non + voix robot, formulaire d'auto-blâme aux boutons qui
 * fuient, faux God Mode Analytics (BOOST TRAFIC), verrou à 3 pièces et
 * compteur de honte persistant.
 * Échap / 2e Konami / bouton = retour au travail. Respecte prefers-reduced-motion.
 * Rien n'est signalé, loggé ou sanctionné pour de vrai.
 */
(function () {
  'use strict';

  var SEQ = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  var SCOLD_KEY = 'kairo-scold-tries'; // compteur de tentatives (cosmétique)
  var RM = false;
  try { RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

  var buf = [];
  var adminActive = false;
  var adminFx = null;
  var adminTermTimer = null;
  var termEl = null;
  var exitEl = null;
  var blameModal = null;
  var fleeBtns = [];
  var dodges = 0;
  var godPanel = null;
  var godNums = [];
  var godFoot = null;
  var boostTimer = null;
  var boosting = false;
  var lockVeil = null;
  var lockGot = 0;
  var blameT0 = 0;
  var energyTimer = null;
  var escCount = 0;
  var escToast = null;
  var godShown = false;
  var bugTimer = null;
  var laterTimers = [];

  function lang() {
    try {
      if (window.kairoI18n && typeof window.kairoI18n.getLang === 'function') return window.kairoI18n.getLang();
    } catch (e) {}
    return (document.documentElement.getAttribute('lang') || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr';
  }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function later(fn, ms) {
    var t = setTimeout(function () {
      laterTimers = laterTimers.filter(function (x) { return x !== t; });
      fn();
    }, ms);
    laterTimers.push(t);
    return t;
  }

  function clearLater() {
    for (var i = 0; i < laterTimers.length; i++) clearTimeout(laterTimers[i]);
    laterTimers = [];
  }

  function actx() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      window.__kaCtx = window.__kaCtx || new AC();
      if (window.__kaCtx.state === 'suspended') window.__kaCtx.resume();
      return window.__kaCtx;
    } catch (e) { return null; }
  }

  function beep(freq, dur, delay, type) {
    var c = actx();
    if (!c) return;
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      var t = c.currentTime + (delay || 0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }

  function sweep(f0, f1, dur, type, vol) {
    var c = actx();
    if (!c) return;
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sawtooth';
      var t = c.currentTime;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(vol || 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }

  function voiceSay(text) {
    try {
      var synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR'; u.rate = 0.95; u.pitch = 0.55;
      synth.speak(u);
    } catch (e) {}
  }

  function stopVoice() {
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }

  function cssAdmin() {
    if (document.getElementById('kairo-admin-css')) return;
    var s = document.createElement('style');
    s.id = 'kairo-admin-css';
    s.textContent = [
      '#kairo-admin-fx{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden}',
      '.ka-vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.5) 100%)}',
      '.ka-blood{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(127,29,29,.28) 0%,rgba(127,29,29,.6) 70%,rgba(69,10,10,.85) 100%)}',
      '.ka-frame{position:absolute;inset:10px;border:3px solid rgba(239,68,68,.85);border-radius:18px;box-shadow:0 0 34px rgba(239,68,68,.6),inset 0 0 34px rgba(239,68,68,.28);animation:ka-alarm 1s ease-in-out infinite,ka-heart 1.15s ease-in-out infinite}',
      '@keyframes ka-alarm{0%,100%{opacity:1}50%{opacity:.3}}',
      '@keyframes ka-heart{0%,100%{transform:scale(1)}14%{transform:scale(1.02)}28%{transform:scale(1)}}',
      '.ka-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 24px}',
      '.ka-non{font-family:"Space Grotesk",system-ui,sans-serif;font-weight:800;font-size:clamp(44px,9vw,110px);letter-spacing:-.02em;color:#fecaca;text-shadow:0 0 34px #ef4444,4px 0 #7f1d1d,-4px 0 #450a0a;animation:ka-glitch .3s steps(2) 6}',
      '@keyframes ka-glitch{0%{transform:translate(0) skewX(0)}25%{transform:translate(-8px,4px) skewX(-5deg)}50%{transform:translate(6px,-5px) skewX(4deg)}75%{transform:translate(-4px,-2px)}100%{transform:translate(0)}}',
      '.ka-sub{margin-top:14px;font-family:monospace;font-weight:700;font-size:clamp(13px,2.4vw,20px);letter-spacing:.1em;color:#fecaca}',
      '.ka-suben{margin-top:6px;font-family:monospace;font-size:11px;letter-spacing:.2em;color:#f87171}',
      '.ka-term{position:absolute;left:16px;bottom:22px;max-width:min(360px,72vw);font-family:monospace;font-size:11px;line-height:1.7;color:#fecaca;background:rgba(69,10,10,.9);border:1px solid rgba(239,68,68,.55);border-radius:12px;padding:10px 14px}',
      '.ka-exit{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:6px}',
      '.ka-btn{font-family:monospace;font-size:12px;font-weight:700;letter-spacing:.08em;color:#fff;background:#b91c1c;border:1px solid #fca5a5;padding:9px 20px;border-radius:9999px;box-shadow:0 0 24px rgba(239,68,68,.6);white-space:nowrap}',
      '.ka-hint{font-family:monospace;font-size:10px;letter-spacing:.15em;color:#fca5a5}',
      '.ka-bye{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:13px;letter-spacing:.2em;color:#fca5a5;animation:ka-byefade .5s ease 1s forwards}',
      '@keyframes ka-byefade{to{opacity:0;transform:translateY(14px)}}',
      '.ka-glove{width:104px;height:auto;margin-bottom:2px;filter:drop-shadow(0 0 18px rgba(239,68,68,.7));animation:ka-wag .5s ease-in-out infinite}',
      '@keyframes ka-wag{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(18deg)}}',
      '.ka-blame{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(430px,92vw);background:#1c0a0a;border:2px solid #ef4444;border-radius:16px;padding:18px;pointer-events:auto;box-shadow:0 0 44px rgba(239,68,68,.5)}',
      '.ka-blame-t{font-family:monospace;font-weight:700;font-size:13px;letter-spacing:.1em;color:#fecaca;text-align:center}',
      '.ka-blame-s{font-family:monospace;font-size:11px;color:#f87171;text-align:center;margin-top:4px}',
      '.ka-dodge{font-family:monospace;font-size:10px;letter-spacing:.15em;color:#fca5a5;text-align:center;margin-top:6px}',
      '.ka-field{position:relative;height:150px;margin-top:10px}',
      '.ka-flee{position:absolute;font-family:monospace;font-size:11px;font-weight:700;color:#fff;background:#7f1d1d;border:1px solid #fca5a5;padding:9px 14px;border-radius:10px;white-space:nowrap;transition:left .1s,top .1s}',
      '.ka-god{position:absolute;right:16px;top:50%;transform:translateY(-50%);width:272px;background:rgba(20,4,4,.96);border:1px solid #f59e0b;border-radius:14px;padding:16px;pointer-events:auto;box-shadow:0 0 30px rgba(245,158,11,.35)}',
      '.ka-god-t{font-family:monospace;font-weight:700;font-size:12px;letter-spacing:.08em;color:#fde68a;text-align:center}',
      '.ka-god-r{display:flex;justify-content:space-between;font-family:monospace;font-size:11px;color:#fca5a5;margin-top:8px}',
      '.ka-god-r b{color:#fff}',
      '.ka-boost{display:block;width:100%;margin-top:12px;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:.06em;color:#451a03;background:linear-gradient(to bottom,#fde68a,#f59e0b);border:none;padding:12px;border-radius:12px}',
      '.ka-godfoot{font-family:monospace;font-size:10px;color:#f87171;text-align:center;margin-top:8px}',
      '.ka-lock{position:absolute;inset:0;background:rgba(10,2,2,.86);pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px;text-align:center}',
      '.ka-lock-t{font-family:monospace;font-weight:700;font-size:15px;letter-spacing:.1em;color:#fecaca}',
      '.ka-lock-s{font-family:monospace;font-size:11px;color:#f87171}',
      '.ka-lock-n{font-family:monospace;font-size:12px;font-weight:700;color:#fde68a}',
      '.ka-coin{position:absolute;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fde68a,#f59e0b 55%,#b45309);border:2px solid #78350f;box-shadow:0 0 14px rgba(251,191,36,.9);pointer-events:auto;cursor:pointer}',
      '.ka-escerr{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);font-family:monospace;font-size:14px;font-weight:700;color:#fecaca;background:rgba(69,10,10,.96);border:2px solid #ef4444;border-radius:12px;padding:14px 22px;box-shadow:0 0 34px rgba(239,68,68,.7);animation:ka-escshake .3s linear 3;white-space:nowrap}',
      '@keyframes ka-escshake{0%,100%{transform:translate(-50%,-50%)}25%{transform:translate(calc(-50% - 8px),-50%)}75%{transform:translate(calc(-50% + 8px),-50%)}}',
      '#ka-shame{position:fixed;right:12px;bottom:12px;z-index:9990;font-family:monospace;font-size:10px;color:#fca5a5;background:rgba(69,10,10,.92);border:1px solid rgba(239,68,68,.5);padding:5px 10px;border-radius:9999px;cursor:pointer}',
      'body.kc-admin{background:#140404 !important}',
      'body.kc-admin main{filter:saturate(.6) hue-rotate(-50deg) brightness(.85) contrast(1.06)}',
      'body.kc-admin main h1,body.kc-admin main h2,body.kc-admin main h3{color:#fca5a5 !important}',
      'body.kc-admin main .bg-white{background-color:#200a0a !important}',
      'body.kc-admin main [class*="border"]{border-color:rgba(239,68,68,.45) !important}',
      'body.kc-admin main p,body.kc-admin main span,body.kc-admin main td,body.kc-admin main th,body.kc-admin main label,body.kc-admin main a,body.kc-admin main button{color:#fca5a5 !important}',
      '#kairo-blood-canvas{position:fixed;inset:0;z-index:9998;pointer-events:none}',
      'body.kc-admin-spin main{animation:ka-spin360 1.3s ease 1,ka-shake .13s linear 10}',
      '@keyframes ka-spin360{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
      '@keyframes ka-shake{0%{transform:translate(0)}25%{transform:translate(-10px,5px)}50%{transform:translate(9px,-7px)}75%{transform:translate(-6px,-5px)}100%{transform:translate(0)}}',
      'body.kc-calm #kairo-admin-fx *{animation:none !important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function adminTries() {
    var n = 0;
    try {
      n = parseInt(sessionStorage.getItem(SCOLD_KEY) || '0', 10) || 0;
      n++;
      sessionStorage.setItem(SCOLD_KEY, String(n));
    } catch (e) { n++; }
    return n;
  }

  function adminScold() {
    if (adminActive) { adminLeave(true); return; }
    adminActive = true;
    var n = adminTries();
    var L = lang();
    cssAdmin();
    document.body.classList.add('kc-admin');
    if (!RM) {
      document.body.classList.add('kc-admin-spin');
      later(function () { document.body.classList.remove('kc-admin-spin'); }, 1700);
    } else {
      document.body.classList.add('kc-calm');
    }

    adminFx = el('div');
    adminFx.id = 'kairo-admin-fx';
    adminFx.appendChild(el('div', 'ka-vig'));
    adminFx.appendChild(el('div', 'ka-blood'));
    adminFx.appendChild(el('div', 'ka-frame'));

    var center = el('div', 'ka-center');
    var glove = el('img', 'ka-glove');
    try { glove.setAttribute('src', '/assets/img/cursors/glove-pointer.png'); } catch (e) {}
    try { glove.setAttribute('alt', 'Doigt qui fait non'); } catch (e) {}
    center.appendChild(glove);
    var nonEl = el('div', 'ka-non', 'NON.');
    center.appendChild(nonEl);
    var sub = el('div', 'ka-sub', 'UN ADMINISTRATEUR NE DEVRAIT PAS CHEATER.');
    sub.style.display = 'none';
    center.appendChild(sub);
    var subEn = el('div', 'ka-suben', 'AN ADMINISTRATOR SHOULD NOT CHEAT.');
    subEn.style.display = 'none';
    center.appendChild(subEn);
    adminFx.appendChild(center);

    later(function () { if (adminActive) nonEl.textContent = 'NON !!'; }, 650);
    later(function () { if (adminActive) nonEl.textContent = 'NON NON NON !!'; }, 1300);
    later(function () {
      if (!adminActive) return;
      sub.style.display = '';
      subEn.style.display = '';
      voiceSay("Alerte. Tentative d'auto-corruption détectée. Merci de retourner bosser.");
    }, 2100);

    if (!RM) {
      for (var i = 0; i < 3; i++) {
        beep(660, 0.22, 0.2 + i * 0.5, 'square');
        beep(520, 0.22, 0.2 + i * 0.5 + 0.25, 'square');
      }
    }

    var lines = L === 'en' ? [
      '> CHEAT ATTEMPT DETECTED',
      '> SEQUENCE: KONAMI (NICE TRY)',
      '> ATTEMPT Nº ' + n,
      n > 1 ? '> STILL NO.' : '> VERDICT: NO.',
      '> IP WRITTEN ON A POST-IT',
      '> SUPERADMIN NOTIFIED… HE DOES NOT CARE',
      '> SHAME: +100'
    ] : [
      '> TENTATIVE DE TRICHE DÉTECTÉE',
      '> SÉQUENCE : KONAMI (BIEN ESSAYÉ)',
      '> TENTATIVE Nº ' + n,
      n > 1 ? '> TOUJOURS NON.' : '> VERDICT : NON.',
      '> IP NOTÉE SUR UN POST-IT',
      '> SUPERADMIN PRÉVENU… IL S\u2019EN FICHE',
      '> HONTE : +100'
    ];
    var term = el('div', 'ka-term');
    termEl = term;
    adminFx.appendChild(term);
    var li = 0;
    adminTermTimer = setInterval(function () {
      if (!adminFx || li >= lines.length) {
        if (adminTermTimer) { clearInterval(adminTermTimer); adminTermTimer = null; }
        return;
      }
      term.appendChild(el('div', null, lines[li]));
      li++;
    }, 500);

    var exit = el('div', 'ka-exit');
    var btn = el('button', 'ka-btn', L === 'en' ? 'BACK TO WORK →' : 'RETOUR AU TRAVAIL →');
    btn.setAttribute('type', 'button');
    btn.addEventListener('click', function () { adminLeave(true); });
    exit.appendChild(btn);
    exit.appendChild(el('div', 'ka-hint', L === 'en' ? 'ESC: GET BACK TO WORK' : 'ÉCHAP : REPRENDRE LE BOULOT'));
    adminFx.appendChild(exit);
    exitEl = exit;

    document.body.appendChild(adminFx);
    bloodStart();

    // Chorégraphie : blame tôt (clic -> mini-jeu -> god bugué + boost auto)
    escCount = 0;
    later(showBlame, 3000);
  }

  /* Formulaire d'auto-blâme aux boutons qui fuient le curseur */
  function termLine(text) {
    if (!adminActive || !termEl) return;
    termEl.appendChild(el('div', null, text));
  }

  var GARBAGE = ['NaN', 'undefined', '???', '∞', '404', '-12', '###', '1E99', 'zzz', '0101'];

  function startBug() {
    stopBug();
    bugTimer = setInterval(function () {
      if (!adminActive || !godPanel) { stopBug(); return; }
      for (var i = 0; i < godNums.length; i++) {
        godNums[i].textContent = GARBAGE[Math.floor(Math.random() * GARBAGE.length)];
      }
    }, 130);
  }

  function stopBug() {
    if (bugTimer) { clearInterval(bugTimer); bugTimer = null; }
  }

  function energyStart() {
    energyStop();
    energyTimer = setInterval(function () {
      if (!adminActive || !blameModal) { energyStop(); return; }
      var p = Math.max(0, Math.round(100 * (1 - (Date.now() - blameT0) / 30000)));
      var c = null;
      try { c = document.getElementById('ka-dodgen'); } catch (e) {}
      if (c) c.textContent = p > 0 ? ('ESQUIVES : ' + dodges + ' · ÉNERGIE : ' + p + '%') : 'ÉNERGIE ÉPUISÉE... vas-y, clique.';
    }, 500);
  }

  function energyStop() {
    if (energyTimer) { clearInterval(energyTimer); energyTimer = null; }
  }

  function sanctionChoisie(label) {
    if (!adminActive) return;
    closeBlame();
    termLine('> SANCTION ACCEPTÉE : ' + String(label || '').slice(0, 40));
    termLine('> MAINTENANT, PROUVE-TOI. (3 pièces)');
    showLock();
  }

  function escDenied(n) {
    if (escToast && escToast.parentNode) escToast.parentNode.removeChild(escToast);
    escToast = el('div', 'ka-escerr', n === 1 ? '✖ ÉCHAP REFUSÉ. FINI D’ABORD.' : '✖ TENTATIVE D’ÉVASION Nº2 DÉTECTÉE.');
    adminFx.appendChild(escToast);
    sweep(300, 90, 0.4, 'sawtooth', 0.12);
    later(function () { if (escToast && escToast.parentNode) escToast.parentNode.removeChild(escToast); }, 1600);
  }

  function showBlame() {
    if (!adminActive || blameModal) return;
    var L = lang();
    blameModal = el('div', 'ka-blame');
    blameModal.id = 'ka-blame';
    blameModal.appendChild(el('div', 'ka-blame-t', L === 'en' ? 'SELF-BLAME FORM' : "FORMULAIRE D'AUTO-BLÂME"));
    blameModal.appendChild(el('div', 'ka-blame-s', L === 'en' ? 'Pick your punishment (good luck clicking)' : 'Choisis ta sanction (bon courage pour cliquer)'));
    var counter = el('div', 'ka-dodge', 'ESQUIVES : 0');
    counter.id = 'ka-dodgen';
    blameModal.appendChild(counter);
    var field = el('div', 'ka-field');
    var b1 = el('button', 'ka-flee', L === 'en' ? 'I apologize to the server' : "Je m'excuse auprès du serveur");
    var b2 = el('button', 'ka-flee', L === 'en' ? 'Lower my own salary' : 'Diminuer mon propre salaire');
    try {
      b1.setAttribute('type', 'button');
      b2.setAttribute('type', 'button');
    } catch (e) {}
    b1.style.left = '16px'; b1.style.top = '36px';
    b2.style.left = '200px'; b2.style.top = '88px';
    field.appendChild(b1);
    field.appendChild(b2);
    blameModal.appendChild(field);
    adminFx.appendChild(blameModal);
    if (exitEl) adminFx.appendChild(exitEl); // sortie toujours cliquable
    fleeBtns = [b1, b2];
    dodges = 0;
    blameT0 = Date.now();
    energyStart();
    var mkCaught = function (btn) { return function () { sanctionChoisie(btn.textContent || ''); }; };
    b1.addEventListener('click', mkCaught(b1));
    b2.addEventListener('click', mkCaught(b2));
    if (RM) {
      var done = function () {
        closeBlame();
        termLine(L === 'en' ? '> SANCTION RECORDED. (not.)' : '> SANCTION ENREGISTRÉE. (non.)');
      };
      b1.addEventListener('click', done);
      b2.addEventListener('click', done);
    } else {
      document.addEventListener('mousemove', onFleeMove);
    }
  }

  function onFleeMove(e) {
    if (!adminActive || !blameModal) return;
    var nowT = Date.now();
    var stamina = Math.max(0, 1 - (nowT - blameT0) / 30000);
    var cx = e.clientX == null ? -9999 : e.clientX;
    var cy = e.clientY == null ? -9999 : e.clientY;
    for (var i = 0; i < fleeBtns.length; i++) {
      (function (btn) {
        var r;
        try { r = btn.getBoundingClientRect(); } catch (err) { return; }
        if (!r) return;
        var dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
        if (Math.sqrt(dx * dx + dy * dy) > 110) return;
        if (btn.__coolUntil && nowT < btn.__coolUntil) return;
        var f = null;
        try { f = btn.parentNode.getBoundingClientRect(); } catch (err2) {}
        var maxX = (f && f.width > 130 ? f.width - 120 : 260);
        var maxY = (f && f.height > 60 ? f.height - 50 : 100);
        btn.style.left = (10 + Math.random() * Math.max(20, maxX)) + 'px';
        btn.style.top = (8 + Math.random() * Math.max(20, maxY)) + 'px';
        btn.__coolUntil = nowT + (1 - stamina) * 900;
        dodges++;
        var c = document.getElementById('ka-dodgen');
        if (c) c.textContent = 'ESQUIVES : ' + dodges;
        beep(1200 + dodges * 40, 0.05, 0, 'square');
      })(fleeBtns[i]);
    }
  }

  function closeBlame() {
    try { document.removeEventListener('mousemove', onFleeMove); } catch (e) {}
    energyStop();
    fleeBtns = [];
    if (blameModal && blameModal.parentNode) blameModal.parentNode.removeChild(blameModal);
    blameModal = null;
  }

  /* Faux God Mode Analytics */
  function showGod() {
    closeBlame();
    if (!adminActive || godPanel) return;
    var L = lang();
    godPanel = el('div', 'ka-god');
    godPanel.id = 'ka-god';
    godShown = true;
    godPanel.appendChild(el('div', 'ka-god-t', '⚡ GOD MODE ANALYTICS (cosmique)'));
    godNums = [];
    var rows = L === 'en' ? [
      ['TRAFFIC', '×1'], ['UNIQUE VISITORS', '1 (it\u2019s you)'],
      ['CONVERSION', '999%'], ['TOP BROWSER', 'Netscape 100%'], ['TOP COUNTRY', 'The Moon']
    ] : [
      ['TRAFIC', '×1'], ['VISITEURS UNIQUES', '1 (c\u2019est vous)'],
      ['CONVERSION', '999%'], ['NAVIGATEUR Nº1', 'Netscape 100%'], ['PAYS Nº1', 'La Lune']
    ];
    for (var i = 0; i < rows.length; i++) {
      var row = el('div', 'ka-god-r');
      row.appendChild(el('span', null, rows[i][0]));
      var val = el('b', null, rows[i][1]);
      row.appendChild(val);
      godPanel.appendChild(row);
      if (i < 2) godNums.push(val);
    }
    var boost = el('button', 'ka-boost', '🚀 BOOST TRAFIC ×100');
    try { boost.setAttribute('type', 'button'); } catch (e) {}
    boost.id = 'ka-boost';
    boost.addEventListener('click', onBoost);
    godPanel.appendChild(boost);
    godFoot = el('div', 'ka-godfoot', L === 'en' ? '(Data 100% faked for your own pleasure)' : '(Données 100% falsifiées pour votre propre plaisir)');
    godFoot.id = 'ka-godfoot';
    godFoot.style.display = 'none';
    godPanel.appendChild(godFoot);
    adminFx.appendChild(godPanel);
    if (exitEl) adminFx.appendChild(exitEl);
    godShown = true;
    // Panel 100% factice : on cache le bouton, les chiffres buguent puis le boost part tout seul
    for (var _bi = godPanel.children.length - 1; _bi >= 0; _bi--) {
      var _bc = godPanel.children[_bi];
      if (((_bc.tag || _bc.tagName) || '').toUpperCase() === 'BUTTON') _bc.style.display = 'none';
    }
    startBug();
    later(function () { onBoost(); }, 2600);
  }

  function setNum(i, txt) {
    if (godNums[i]) godNums[i].textContent = txt;
  }

  function onBoost() {
    if (boosting || !godPanel || !adminActive) return;
    stopBug();
    boosting = true;
    sweep(90, 900, 1.8, 'sawtooth', 0.1);
    beep(1568, 0.4, 1.9, 'square');
    document.body.classList.add('kc-admin-spin');
    later(function () { document.body.classList.remove('kc-admin-spin'); }, 1300);
    var t0 = Date.now();
    boostTimer = setInterval(function () {
      if (!adminActive || !godPanel) { boostDone(false); return; }
      var p = Math.min(1, (Date.now() - t0) / 2200);
      setNum(0, '×' + Math.floor(1 + p * 99));
      setNum(1, String(Math.floor(1 + p * p * 999998)));
      if (p >= 1) boostDone(true);
    }, 50);
  }

  function boostDone(finished) {
    if (boostTimer) { clearInterval(boostTimer); boostTimer = null; }
    if (!finished || !godPanel) { boosting = false; return; }
    setNum(0, '×1');
    setNum(1, '1');
    if (godFoot) godFoot.style.display = '';
    sweep(700, 80, 0.5, 'sawtooth', 0.1);
    boosting = false;
  }

  function closeGod() {
    if (boostTimer) { clearInterval(boostTimer); boostTimer = null; }
    stopBug();
    boosting = false;
    godNums = [];
    godFoot = null;
    if (godPanel && godPanel.parentNode) godPanel.parentNode.removeChild(godPanel);
    godPanel = null;
  }

  /* Verrou anti-triche : 3 pièces à attraper pour débloquer */
  function showLock() {
    closeGod();
    if (!adminActive || lockVeil) return;
    var L = lang();
    lockVeil = el('div', 'ka-lock');
    lockVeil.id = 'ka-lock';
    lockVeil.appendChild(el('div', 'ka-lock-t', '🔒 PROTOCOLE ANTI-TRICHE'));
    lockVeil.appendChild(el('div', 'ka-lock-s', L === 'en' ? 'Dashboard locked — catch 3 coins to unlock' : 'Dashboard verrouillé — attrape 3 pièces pour débloquer'));
    var n = el('div', 'ka-lock-n', 'PIÈCES : 0/3');
    n.id = 'ka-lock-n';
    lockVeil.appendChild(n);
    lockGot = 0;
    for (var i = 0; i < 3; i++) {
      (function () {
        var c = el('div', 'ka-coin');
        c.style.left = (8 + Math.random() * 80) + '%';
        c.style.top = (24 + Math.random() * 58) + '%';
        c.addEventListener('click', function () {
          if (!adminActive || !lockVeil) return;
          beep(1568, 0.12, 0, 'square');
          if (c.parentNode) c.parentNode.removeChild(c);
          lockGot++;
          var nn = document.getElementById('ka-lock-n');
          if (nn) nn.textContent = 'PIÈCES : ' + lockGot + '/3';
          if (lockGot >= 3) {
            lockVeil.innerHTML = '';
            lockVeil.appendChild(el('div', 'ka-lock-t', L === 'en' ? 'ACCESS RESTORED. (That was easy.)' : 'ACCÈS RESTAURÉ. (C’était facile.)'));
            later(function () { closeLock(); if (!godShown) showGod(); }, 1400);
          }
        });
        lockVeil.appendChild(c);
      })();
    }
    adminFx.appendChild(lockVeil);
    if (exitEl) adminFx.appendChild(exitEl);
  }

  function closeLock() {
    if (lockVeil && lockVeil.parentNode) lockVeil.parentNode.removeChild(lockVeil);
    lockVeil = null;
  }

  /* Compteur de honte persistant (reste après le cheat, reclicable) */
  function shameCount() {
    try { return parseInt(sessionStorage.getItem('kairo-scold-tries') || '0', 10) || 0; }
    catch (e) { return 0; }
  }

  function shameBadge() {
    if (document.getElementById('ka-shame')) return;
    var n = shameCount();
    if (!n) return;
    var b = el('div', null, '🍷 Tentatives de triche : ' + n + ' (Honte : +' + (n * 100) + ')');
    b.id = 'ka-shame';
    b.addEventListener('click', function () { if (!adminActive) adminScold(); });
    document.body.appendChild(b);
  }

  function adminLeave(silent) {
    if (!adminActive) return;
    adminActive = false;
    if (adminTermTimer) { clearInterval(adminTermTimer); adminTermTimer = null; }
    clearLater();
    bloodStop();
    closeBlame();
    closeGod();
    closeLock();
    stopVoice();
    document.body.classList.remove('kc-admin', 'kc-admin-spin', 'kc-calm');
    if (adminFx && adminFx.parentNode) adminFx.parentNode.removeChild(adminFx);
    adminFx = null;
    termEl = null;
    exitEl = null;
    shameBadge();
    if (!silent) return;
    try {
      var bye = el('div');
      bye.id = 'kairo-admin-fx';
      bye.appendChild(el('div', 'ka-bye', lang() === 'en' ? 'BACK TO WORK.' : 'RETOUR AU TRAVAIL.'));
      document.body.appendChild(bye);
      setTimeout(function () { if (bye.parentNode) bye.parentNode.removeChild(bye); }, 1700);
    } catch (e) {}
  }

  /* Sang qui coule du haut de la page (canvas 100% rouge, sans filtre) */
  var bloodCv = null, bloodCtx = null, bloodRun = false;
  var drips = [], drops = [], splats = [];

  function bloodSize() {
    if (!bloodCv) return;
    bloodCv.width = window.innerWidth || 1024;
    bloodCv.height = window.innerHeight || 768;
  }

  function newDrip(anywhere) {
    var W = bloodCv ? bloodCv.width : 1024;
    drips.push({
      x: Math.random() * W,
      w: 7 + Math.random() * 15,
      len: anywhere ? 20 + Math.random() * 160 : 15 + Math.random() * 40,
      growth: 0.25 + Math.random() * 0.7,
      max: 130 + Math.random() * 220
    });
  }

  function bloodStart() {
    if (RM || bloodCv) return;
    bloodCv = document.createElement('canvas');
    bloodCv.id = 'kairo-blood-canvas';
    document.body.appendChild(bloodCv);
    bloodSize();
    try { bloodCtx = bloodCv.getContext('2d'); } catch (e) { bloodCtx = null; }
    if (!bloodCtx) return;
    drips = []; drops = []; splats = [];
    for (var i = 0; i < 14; i++) newDrip(true);
    try { window.addEventListener('resize', bloodSize); } catch (e) {}
    bloodRun = true;
    bloodLoop();
  }

  function bloodLoop() {
    if (!bloodRun || !bloodCtx || !bloodCv) return;
    var W = bloodCv.width, H = bloodCv.height, i, d;
    bloodCtx.clearRect(0, 0, W, H);
    // Nappes qui s'allongent depuis le haut
    for (i = 0; i < drips.length; i++) {
      d = drips[i];
      d.len += d.growth;
      if (d.len >= d.max) {
        drops.push({ x: d.x, y: d.len, vy: 1.5 + Math.random() * 2, r: d.w * 0.32 });
        d.len = 15 + Math.random() * 40;
        d.max = 130 + Math.random() * 220;
        d.x = Math.random() * W;
      }
      bloodCtx.fillStyle = '#7f1d1d';
      bloodCtx.fillRect(d.x - d.w / 2, 0, d.w, d.len);
      bloodCtx.fillStyle = 'rgba(239,68,68,.5)';
      bloodCtx.fillRect(d.x - d.w / 2 + 1.5, 0, Math.max(1.5, d.w * 0.25), d.len);
      bloodCtx.beginPath();
      bloodCtx.fillStyle = '#991b1b';
      bloodCtx.arc(d.x, d.len, d.w / 2, 0, Math.PI * 2);
      bloodCtx.fill();
    }
    if (drips.length < 14 && Math.random() < 0.05) newDrip(false);
    // Gouttes qui tombent
    for (i = drops.length - 1; i >= 0; i--) {
      d = drops[i];
      d.vy += 0.45; d.y += d.vy;
      bloodCtx.beginPath();
      bloodCtx.fillStyle = '#b91c1c';
      bloodCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      bloodCtx.fill();
      if (d.y > H - 4) {
        splats.push({ x: d.x, y: H - 6 - Math.random() * 30, r: d.r * (1.6 + Math.random()), life: 240 });
        drops.splice(i, 1);
      }
    }
    // Éclaboussures qui s'estompent
    for (i = splats.length - 1; i >= 0; i--) {
      var s = splats[i];
      s.life--;
      if (s.life <= 0) { splats.splice(i, 1); continue; }
      bloodCtx.beginPath();
      bloodCtx.fillStyle = 'rgba(127,29,29,' + Math.min(0.55, s.life / 240 * 0.55).toFixed(3) + ')';
      bloodCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      bloodCtx.fill();
    }
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    raf(bloodLoop);
  }

  function bloodStop() {
    bloodRun = false;
    try { window.removeEventListener('resize', bloodSize); } catch (e) {}
    drips = []; drops = []; splats = [];
    try { if (bloodCv && bloodCv.parentNode) bloodCv.parentNode.removeChild(bloodCv); } catch (e) {}
    bloodCv = null; bloodCtx = null;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && adminActive) {
      escCount++;
      if (escCount < 3) { escDenied(escCount); return; }
      adminLeave(true); return;
    }
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
      buf = [];
      return;
    }
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = (e.key || '').toLowerCase();
    if (SEQ.indexOf(k) !== -1) {
      buf.push(k);
      if (buf.length > SEQ.length) buf.shift();
      if (buf.join(',') === SEQ.join(',')) {
        buf = [];
        if (adminActive) adminLeave(true); else adminScold();
      }
    } else if (k.indexOf('arrow') === 0) {
      buf = [];
    }
  });

  // Compteur de honte déjà gagné ? Il reste affiché (et recliquable).
  try { shameBadge(); } catch (e) {}
})();
