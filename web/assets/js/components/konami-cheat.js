/**
 * KaïroOS — Easter egg Konami global (un seul composant pour tout le site).
 * Chargé automatiquement par <kairo-navbar>, présent sur toutes les pages publiques.
 * Séquence : Haut Haut Bas Bas Gauche Droite Gauche Droite B A.
 * Effet : secousse à enveloppe + scramble/slices RGB + pièces multidirectionnelles
 *         + chiptune 8-bit + clics explosifs + combo souris + KAÏRO PANIC
 *         + terminal triche + TOP CHEATERS + HI-SCORE + rumble manette
 *         + titres qui tombent par gravité.
 * Durée illimitée, persistante entre les pages (session) jusqu'à :
 * Échap / START+SELECT / 2e Konami / clic badge. Respecte prefers-reduced-motion.
 * Bonus : les boutons fuient le clic (tombent par gravité), écran tube cathodique
 * bombé aux pixels baveux, et les ronds de curseur tirent un laser qui perce
 * un trou brûlé vers le néant.
 */
(function () {
  'use strict';

  var SEQ = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  var CHEAT_KEY = 'kairo-cheat-on'; // sessionStorage : cheat illimité, persistant entre les pages
  var RM = false;
  try { RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

  var buf = [];
  var active = false;
  var fx = null;
  var coinBox = null;
  var termTimer = null;
  var scoreTimer = null;
  var panicTimer = null;
  var glitchTimer = null;
  var padTimer = null;
  var comboTimer = null;
  var laterTimers = [];
  var scrambleTimers = [];
  var scrambled = [];
  var score = 0;
  var combo = 0;
  var lastMoveT = 0;
  var lastComboUp = 0;
  var mouseX = 0, mouseY = 0;
  var coins = [];
  var coinRun = false;
  var fallers = [];
  var fallRun = false;
  var dodgers = [];
  var dodgeRun = false;
  var trail = [];
  var laserCool = 0;
  var laserHoles = [];
  var musicTimer = null;
  var musicStep = 0;
  var musicNext = 0;

  function lang() {
    try {
      if (window.kairoI18n && typeof window.kairoI18n.getLang === 'function') return window.kairoI18n.getLang();
    } catch (e) {}
    return (document.documentElement.getAttribute('lang') || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr';
  }

  var T = {
    fr: {
      cheatOn: 'CHEAT ACTIVÉ',
      cheatOff: 'CHEAT DÉSACTIVÉ',
      hud: '★ CHEAT MODE · ÉCHAP pour quitter',
      term: ['> KONAMI ACCEPTÉ…', '> +30 VIES DÉBLOQUÉES', '> GRAVITÉ : OFF', '> SCORE ×99', '> FANTÔMES : POTES', '> INVINCIBILITÉ : 30s', '> BOUTONS : PEUREUX', '> CERCLES CURSEUR : ???', '> SAUVEGARDE… OK'],
      top: ['', '— TOP CHEATERS —', '1. TOI — 999990', '2. LE BOSS — 12', '3. FANTÔME — AFK'],
      errors: ['ERREUR 0x1UP : TROP DE VIES', 'ERREUR 404 : 404 INTROUVABLE… ah non', 'ERREUR 0xCAFE : MANQUE DE PIXELS', 'ERREUR 0xBOSS : BOSS ÉVITÉ', 'WARNING : FUN DÉTECTÉ'],
      panic: 'KAÏRO PANIC — TROP DE FUN',
      panicSub: 'reboot…'
    },
    en: {
      cheatOn: 'CHEAT ACTIVATED',
      cheatOff: 'CHEAT DISABLED',
      hud: '★ CHEAT MODE · ESC to quit',
      term: ['> KONAMI ACCEPTED…', '> +30 LIVES UNLOCKED', '> GRAVITY: OFF', '> SCORE ×99', '> GHOSTS: FRIENDLY', '> INVINCIBILITY: 30s', '> BUTTONS: COWARDS', '> CURSOR CIRCLES: ???', '> SAVING… OK'],
      top: ['', '— TOP CHEATERS —', '1. YOU — 999990', '2. THE BOSS — 12', '3. GHOST — AFK'],
      errors: ['ERROR 0x1UP: TOO MANY LIVES', 'ERROR 404: 404 NOT FOUND… wait', 'ERROR 0xCAFE: MISSING PIXELS', 'ERROR 0xBOSS: BOSS SKIPPED', 'WARNING: FUN DETECTED'],
      panic: 'KAÏRO PANIC — TOO MUCH FUN',
      panicSub: 'rebooting…'
    }
  };

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

  /* ---------- CSS ---------- */

  function css() {
    if (document.getElementById('kairo-cheat-css')) return;
    var s = document.createElement('style');
    s.id = 'kairo-cheat-css';
    s.textContent = [
      '#kairo-cheat-fx{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden}',
      '#kc-coins{position:fixed;inset:0;z-index:9998;pointer-events:none;overflow:hidden}',
      '.kc-scan{position:absolute;inset:0;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.05) 0 1px,transparent 1px 4px);mix-blend-mode:overlay}',
      '.kc-vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.5) 100%)}',
      '.kc-sweep{position:absolute;left:0;right:0;height:90px;background:linear-gradient(to bottom,transparent,rgba(34,211,238,.14),transparent);animation:kc-sweep 3.2s linear infinite}',
      '@keyframes kc-sweep{from{top:-90px}to{top:100%}}',
      /* TV cathodique bombée aux pixels baveux */
      'body.kc-crt main{border-radius:26px;filter:saturate(1.3) contrast(1.1) drop-shadow(4px 0 0 rgba(244,63,94,.35)) drop-shadow(-4px 0 0 rgba(34,211,238,.35))}',
      '.kc-glass{position:absolute;inset:0;background:radial-gradient(ellipse 90% 55% at 50% -5%,rgba(255,255,255,.10),transparent 60%)}',
      /* Trou laser vers le néant (bords brûlés + étoiles) */
      '.kc-hole{position:absolute;border-radius:50%;background:radial-gradient(circle,#000 0 42%,#0b0014 55%,#7c2d12 68%,#f59e0b 74%,rgba(245,158,11,.55) 78%,transparent 82%);box-shadow:0 0 34px 8px rgba(249,115,22,.55),inset 0 0 24px #000;transition:opacity .8s;animation:kc-holein .45s ease-out}',
      '.kc-hole::after{content:"";position:absolute;inset:12%;border-radius:50%;background:radial-gradient(1.5px 1.5px at 20% 30%,#fff,transparent),radial-gradient(1px 1px at 60% 20%,#fff,transparent),radial-gradient(2px 2px at 75% 60%,#c4b5fd,transparent),radial-gradient(1px 1px at 35% 70%,#fff,transparent),radial-gradient(1.5px 1.5px at 50% 50%,#fff,transparent)}',
      '@keyframes kc-holein{0%{transform:scale(.1);filter:brightness(3)}60%{transform:scale(1.15)}100%{transform:scale(1)}}',
      '.kc-beam{position:absolute;top:0;width:5px;background:linear-gradient(to bottom,transparent,#fef08a 30%,#fff 50%,#fef08a 70%,transparent);box-shadow:0 0 18px 4px rgba(253,224,71,.9);animation:kc-beamout .35s ease-out forwards}',
      '@keyframes kc-beamout{from{opacity:1}to{opacity:0}}',
      '.kc-flash{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}',
      '.kc-flash span{font-family:"Space Grotesk",system-ui,sans-serif;font-weight:800;font-size:clamp(38px,8vw,96px);letter-spacing:-.02em;color:#fff;animation:kc-glitch .3s steps(2) 8,kc-flashout .4s ease 2.4s forwards;text-shadow:3px 0 #f43f5e,-3px 0 #22d3ee}',
      '@keyframes kc-glitch{0%{transform:translate(0) skewX(0)}25%{transform:translate(-8px,4px) skewX(-5deg)}50%{transform:translate(6px,-5px) skewX(4deg)}75%{transform:translate(-4px,-2px)}100%{transform:translate(0)}}',
      '@keyframes kc-flashout{to{opacity:0;transform:scale(1.4)}}',
      '.kc-hud{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);pointer-events:auto;cursor:pointer;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:.08em;color:#fff;background:rgba(2,6,23,.85);border:1px solid rgba(244,63,94,.6);padding:8px 16px;border-radius:9999px;box-shadow:0 0 24px rgba(244,63,94,.45);white-space:nowrap}',
      '.kc-score{position:absolute;top:86px;right:16px;font-family:monospace;font-size:12px;color:#fbbf24;background:rgba(2,6,23,.85);border:1px solid rgba(251,191,36,.5);padding:6px 12px;border-radius:10px;white-space:nowrap}',
      '.kc-term{position:absolute;left:16px;bottom:22px;max-width:min(340px,70vw);font-family:monospace;font-size:11px;line-height:1.7;color:#6ee7b7;background:rgba(2,6,23,.88);border:1px solid rgba(52,211,153,.4);border-radius:12px;padding:10px 14px}',
      '.kc-err{position:absolute;font-family:monospace;font-size:11px;font-weight:700;color:#fecdd3;background:rgba(80,7,36,.92);border:1px solid #f43f5e;border-radius:10px;padding:8px 12px;animation:kc-errpop .25s ease-out,kc-errout .4s ease 2.6s forwards;box-shadow:0 8px 30px rgba(0,0,0,.5)}',
      '@keyframes kc-errpop{from{transform:scale(.6) rotate(-3deg);opacity:0}}',
      '@keyframes kc-errout{to{opacity:0;transform:translateY(14px)}}',
      '.kc-coin{position:absolute;left:0;top:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fde68a,#f59e0b 55%,#b45309);border:2px solid #78350f;box-shadow:0 0 10px rgba(251,191,36,.85)}',
      '.kc-panic{position:fixed;inset:0;z-index:10000;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-family:monospace}',
      '.kc-panic b{color:#f43f5e;font-size:clamp(20px,4vw,34px);letter-spacing:.06em}',
      '.kc-panic span{color:#64748b;font-size:12px;letter-spacing:.3em}',
      '.kc-bye{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:13px;letter-spacing:.2em;color:#94a3b8;animation:kc-errout .5s ease 1s forwards}',
      /* Secousse à enveloppe : forte au déclenchement, résiduelle pendant le mode */
      'body.kc-burst-hard main{animation:kc-shake-hard .11s linear 9}',
      '@keyframes kc-shake-hard{0%{transform:translate(0) rotate(0)}25%{transform:translate(-9px,4px) rotate(-.5deg)}50%{transform:translate(8px,-6px) rotate(.5deg)}75%{transform:translate(-5px,-4px) rotate(-.3deg)}100%{transform:translate(0)}}',
      'body.kc-burst-soft main{animation:kc-shake-soft 1.6s ease-in-out infinite}',
      '@keyframes kc-shake-soft{0%,100%{transform:translate(0)}25%{transform:translate(-2px,1px)}50%{transform:translate(2px,-1px)}75%{transform:translate(-1px,-1px)}}',
      'body.kc-cheat kairo-navbar img{animation:kc-spin .8s ease 3}',
      '@keyframes kc-spin{to{transform:rotate(360deg)}}',
      /* Slices RGB sur les titres */
      '.kc-tglitch{position:relative;display:inline-block}',
      '.kc-tglitch::before,.kc-tglitch::after{content:attr(data-text);position:absolute;inset:0;overflow:hidden;background:transparent}',
      '.kc-tglitch::before{color:#f43f5e;animation:kc-slice-a .32s steps(2) 6}',
      '.kc-tglitch::after{color:#22d3ee;animation:kc-slice-b .32s steps(2) 6}',
      '@keyframes kc-slice-a{0%{transform:translate(-5px,2px);clip-path:inset(10% 0 60% 0)}50%{transform:translate(4px,-2px);clip-path:inset(55% 0 15% 0)}100%{transform:translate(0);clip-path:inset(30% 0 40% 0)}}',
      '@keyframes kc-slice-b{0%{transform:translate(5px,-2px);clip-path:inset(60% 0 10% 0)}50%{transform:translate(-4px,2px);clip-path:inset(15% 0 65% 0)}100%{transform:translate(0);clip-path:inset(40% 0 35% 0)}}',
      /* Mode calme : coupe les animations */
      'body.kc-calm #kairo-cheat-fx *,body.kc-calm #kc-coins *{animation:none !important}'
    ].join('\n');
    document.head.appendChild(s);
  }

    /* ---------- Audio (WebAudio, aucun fichier) ---------- */

  function actx() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      window.__kcCtx = window.__kcCtx || new AC();
      if (window.__kcCtx.state === 'suspended') window.__kcCtx.resume();
      return window.__kcCtx;
    } catch (e) { return null; }
  }

  function toneAt(freq, when, dur, type, vol) {
    var c = actx();
    if (!c) return;
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, when + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(c.destination);
      o.start(when); o.stop(when + dur + 0.05);
    } catch (e) {}
  }

  function beep(freq, dur, delay, type) {
    var c = actx();
    if (!c) return;
    toneAt(freq, c.currentTime + (delay || 0), dur, type, 0.12);
  }

  function coinSound() { beep(988, 0.09, 0, 'square'); beep(1319, 0.4, 0.09, 'square'); }
  function powerSound() {
    var notes = [523, 659, 784, 1047, 1319];
    for (var i = 0; i < notes.length; i++) beep(notes[i], 0.12, 0.25 + i * 0.09, 'square');
  }
  function panicSound() {
    var c = actx();
    if (!c) return;
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = 'sawtooth';
      var t = c.currentTime;
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.45);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.55);
    } catch (e) {}
  }
  function rumbleSound() {
    var c = actx();
    if (!c) return;
    try {
      var len = Math.floor(c.sampleRate * 0.9);
      var bufN = c.createBuffer(1, len, c.sampleRate);
      var d = bufN.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource();
      src.buffer = bufN;
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 120;
      var g = c.createGain();
      g.gain.value = 0.5;
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start();
    } catch (e) {}
  }
  function blip(comboN) {
    beep(500 + Math.min(comboN, 40) * 22, 0.07, 0, 'square');
  }
  function laserZap() {
    var c = actx();
    if (!c) return;
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = 'square';
      var t = c.currentTime;
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.35);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.45);
    } catch (e) {}
  }
  function sizzleSound() {
    var c = actx();
    if (!c) return;
    try {
      var len = Math.floor(c.sampleRate * 0.4);
      var bufN = c.createBuffer(1, len, c.sampleRate);
      var d = bufN.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource();
      src.buffer = bufN;
      var f = c.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 3000;
      var g = c.createGain();
      g.gain.value = 0.18;
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start();
    } catch (e) {}
  }

  /* Chiptune 8-bit en boucle (lead + basse) */
  var LEAD = [880, 0, 659, 784, 880, 0, 1047, 784, 659, 0, 523, 659, 784, 659, 523, 0];
  var BASS = [110, 0, 0, 0, 131, 0, 0, 0, 98, 0, 0, 0, 147, 0, 131, 0];
  function musicStart() {
    var c = actx();
    if (!c || musicTimer) return;
    musicStep = 0;
    musicNext = c.currentTime + 0.1;
    musicTimer = setInterval(function () {
      if (!active) return;
      var stepDur = 60 / 142 / 2;
      while (musicNext < c.currentTime + 0.18) {
        var lf = LEAD[musicStep % LEAD.length];
        var bf = BASS[musicStep % BASS.length];
        if (lf) toneAt(lf, musicNext, 0.11, 'square', 0.045);
        if (bf) toneAt(bf, musicNext, 0.16, 'triangle', 0.07);
        musicNext += stepDur;
        musicStep++;
      }
    }, 40);
  }
  function musicStop() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  /* ---------- Manette : rumble + sortie START+SELECT ---------- */

  function rumble(ms, strong) {
    try {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i];
        if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
          p.vibrationActuator.playEffect('dual-rumble', {
            duration: ms || 600, strongMagnitude: strong == null ? 1 : strong, weakMagnitude: 0.6
          });
        }
      }
    } catch (e) {}
  }

  function padWatchStart() {
    padWatchStop();
    padTimer = setInterval(function () {
      if (!active) return;
      try {
        var pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (var i = 0; i < pads.length; i++) {
          var p = pads[i];
          if (p && p.buttons && p.buttons[8] && p.buttons[9] && p.buttons[8].pressed && p.buttons[9].pressed) {
            deactivate(true);
            return;
          }
        }
      } catch (e) {}
    }, 250);
  }
  function padWatchStop() {
    if (padTimer) { clearInterval(padTimer); padTimer = null; }
  }

  /* ---------- Helpers DOM ---------- */

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  /* Scramble hacker sur les titres (texte brut uniquement, jamais de markup) */
  function scrambleTitles() {
    if (RM) return;
    var heads = document.querySelectorAll('main h1, main h2');
    var pool = '█▓▒░<>/\\|01$#';
    var count = 0;
    for (var i = 0; i < heads.length && count < 6; i++) {
      (function (elm) {
        if (elm.childElementCount > 0) return;
        var orig = elm.textContent;
        if (!orig || orig.length > 120) return;
        count++;
        scrambled.push({ elm: elm, orig: orig });
        var start = Date.now(), dur = 950;
        var iv = setInterval(function () {
          if (!active) { clearInterval(iv); return; }
          var p = (Date.now() - start) / dur;
          if (p >= 1) { elm.textContent = orig; clearInterval(iv); return; }
          var n = Math.floor(orig.length * p);
          var out = orig.slice(0, n);
          for (var k = n; k < orig.length; k++) {
            out += orig[k] === ' ' ? ' ' : pool[Math.floor(Math.random() * pool.length)];
          }
          elm.textContent = out;
        }, 40);
        scrambleTimers.push(iv);
      })(heads[i]);
    }
  }

  function restoreScrambled() {
    for (var i = 0; i < scrambleTimers.length; i++) clearInterval(scrambleTimers[i]);
    scrambleTimers = [];
    for (var j = 0; j < scrambled.length; j++) {
      try { scrambled[j].elm.textContent = scrambled[j].orig; } catch (e) {}
    }
    scrambled = [];
  }

  /* Slices RGB sur tous les gros titres */
  function sliceTitles() {
    if (RM) return;
    var heads = document.querySelectorAll('main h1, main h2');
    for (var i = 0; i < heads.length && i < 8; i++) {
      (function (elm) {
        var txt = (elm.innerText || elm.textContent || '').trim().slice(0, 80);
        if (!txt) return;
        elm.setAttribute('data-text', txt);
        elm.classList.add('kc-tglitch');
      })(heads[i]);
    }
    glitchTimer = setTimeout(function () {
      var olds = document.querySelectorAll('.kc-tglitch');
      for (var j = 0; j < olds.length; j++) olds[j].classList.remove('kc-tglitch');
    }, 2200);
  }

  /* Titres principaux qui tombent par gravité (puis restaurés à la sortie) */
  function dropTitles() {
    if (!active || RM) return;
    var heads = document.querySelectorAll('main h1, main h2');
    for (var i = 0; i < heads.length && fallers.length < 8; i++) {
      (function (elm) {
        if (elm.__kcFallen) return;
        elm.__kcFallen = true;
        fallers.push({
          el: elm, y: 0, vy: 1.5 + Math.random() * 2.5,
          rot: 0, vr: (Math.random() * 2 - 1) * 1.4,
          max: (window.innerHeight || 700) + 260, done: false
        });
      })(heads[i]);
    }
    fallLoop();
  }

  function fallLoop() {
    if (fallRun) return;
    fallRun = true;
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    (function step() {
      var anyLive = false;
      for (var i = 0; i < fallers.length; i++) {
        var f = fallers[i];
        if (f.done || !active) continue;
        anyLive = true;
        f.vy += 0.6;
        f.y += f.vy;
        f.rot += f.vr;
        if (f.y >= f.max) {
          f.done = true;
          try { f.el.style.opacity = '0'; } catch (e) {}
          continue;
        }
        try {
          f.el.style.transform = 'translateY(' + Math.round(f.y) + 'px) rotate(' + f.rot.toFixed(2) + 'deg)';
          f.el.style.opacity = String(Math.max(0, 1 - f.y / (f.max * 0.85)));
        } catch (e) {}
      }
      if (anyLive && active) raf(step);
      else fallRun = false;
    })();
  }

  function restoreFallen() {
    for (var i = 0; i < fallers.length; i++) {
      try {
        fallers[i].el.style.transform = '';
        fallers[i].el.style.opacity = '';
        delete fallers[i].el.__kcFallen;
      } catch (e) {}
    }
    fallers = [];
  }

  /* Boutons peureux : fuient le clic en tombant par gravité */
  function snakePage() {
    try { return !!document.getElementById('snake-stage'); } catch (e) { return false; }
  }

  function dodgable(t) {
    if (!t || !t.closest) return null;
    var hit = t.closest('a,button');
    if (!hit) return null;
    if (hit.closest('#kairo-cheat-fx,#kc-coins,#snake-stage')) return null;
    return hit;
  }

  function onDodgeDown(e) {
    if (!active || RM) return;
    if (snakePage()) return;
    var hit = dodgable(e.target);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    dropElement(hit);
    blip(combo);
  }

  function onDodgeClick(e) {
    if (!active || RM) return;
    if (snakePage()) return;
    var hit = dodgable(e.target);
    if (hit && hit.__kcDodging) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function dropElement(elm) {
    if (elm.__kcDodging) return;
    try {
      var r = elm.getBoundingClientRect();
      if (!r || r.width === 0) return;
      elm.__kcDodging = true;
      elm.__kcCss = elm.style.cssText;
      elm.style.position = 'fixed';
      elm.style.left = r.left + 'px';
      elm.style.top = r.top + 'px';
      elm.style.width = r.width + 'px';
      elm.style.margin = '0';
      elm.style.zIndex = '9997';
      elm.style.pointerEvents = 'none';
      dodgers.push({ el: elm, y: r.top, vy: 1, rot: 0, vr: (Math.random() * 2 - 1) * 3, max: (window.innerHeight || 700) + 120 });
      dodgeLoop();
      later(function () { restoreDodger(elm); }, 1600);
    } catch (e) {}
  }

  function restoreDodger(elm) {
    try {
      elm.style.cssText = elm.__kcCss || '';
      delete elm.__kcDodging;
      delete elm.__kcCss;
    } catch (e) {}
    dodgers = dodgers.filter(function (d) { return d.el !== elm; });
  }

  function restoreDodgers() {
    var copy = dodgers.slice();
    for (var i = 0; i < copy.length; i++) restoreDodger(copy[i].el);
    dodgers = [];
  }

  function dodgeLoop() {
    if (dodgeRun) return;
    dodgeRun = true;
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    (function step() {
      var anyLive = false;
      for (var i = 0; i < dodgers.length; i++) {
        var d = dodgers[i];
        if (!d.el.__kcDodging || !active) continue;
        anyLive = true;
        d.vy += 0.7;
        d.y += d.vy;
        d.rot += d.vr;
        if (d.y >= d.max) continue; // attend la restauration, invisible sous l'écran
        try {
          d.el.style.top = Math.round(d.y) + 'px';
          d.el.style.transform = 'rotate(' + d.rot.toFixed(2) + 'deg)';
          if (d.y > d.max - 260) d.el.style.opacity = String(Math.max(0, 1 - (d.y - (d.max - 260)) / 260));
        } catch (e) {}
      }
      if (anyLive && active) raf(step);
      else dodgeRun = false;
    })();
  }

  /* Laser : des ronds de curseur percent un trou brûlé vers le néant */
  function fireLaser(x, y) {
    if (!fx) return;
    laserZap();
    sizzleSound();
    score += 500;
    var num = document.getElementById('kc-score-num');
    if (num) num.textContent = String(Math.min(999990, score)).padStart(6, '0');
    if (!RM) {
      var beam = el('div', 'kc-beam');
      beam.style.left = (x - 2) + 'px';
      beam.style.height = y + 'px';
      fx.appendChild(beam);
      setTimeout(function () { if (beam.parentNode) beam.parentNode.removeChild(beam); }, 400);
    }
    var R = 70 + Math.floor(Math.random() * 40);
    var hole = el('div', 'kc-hole');
    hole.style.width = (R * 2) + 'px';
    hole.style.height = (R * 2) + 'px';
    hole.style.left = (x - R) + 'px';
    hole.style.top = (y - R) + 'px';
    fx.appendChild(hole);
    laserHoles.push(hole);
    while (laserHoles.length > 6) {
      var old = laserHoles.shift();
      if (old.parentNode) old.parentNode.removeChild(old);
    }
    setTimeout(function () {
      try { hole.style.opacity = '0'; } catch (e) {}
      setTimeout(function () {
        if (hole.parentNode) hole.parentNode.removeChild(hole);
        laserHoles = laserHoles.filter(function (h) { return h !== hole; });
      }, 850);
    }, 6000);
  }

  function trackCircles(x, y) {
    var now = Date.now();
    trail.push({ x: x, y: y, t: now });
    while (trail.length > 2 && now - trail[0].t > 2500) trail.shift();
    if (trail.length < 8) return;
    var sum = 0;
    var px = trail[0].x, py = trail[0].y, pdx = 0, pdy = 0, hasPrev = false;
    for (var i = 1; i < trail.length; i++) {
      var dx = trail[i].x - px, dy = trail[i].y - py;
      px = trail[i].x; py = trail[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) continue;
      if (hasPrev) {
        var cross = pdx * dy - pdy * dx;
        var dot = pdx * dx + pdy * dy;
        sum += Math.atan2(cross, dot);
      }
      pdx = dx; pdy = dy; hasPrev = true;
    }
    if (Math.abs(sum) >= 5 && now > laserCool) {
      laserCool = now + 1500;
      trail = [];
      fireLaser(x, y);
    }
  }

  /* ---------- Pièces multidirectionnelles (physique simple) ---------- */

  function coinsInit() {
    coinBox = el('div');
    coinBox.id = 'kc-coins';
    document.body.appendChild(coinBox);
  }

  function coinSpawn(x, y, n, power) {
    if (!coinBox) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = power * (0.35 + Math.random() * 0.85);
      var c = el('span', 'kc-coin');
      var s = 8 + Math.random() * 9;
      c.style.width = s + 'px';
      c.style.height = s + 'px';
      coinBox.appendChild(c);
      coins.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - power * 0.35,
        rot: Math.random() * 360,
        vr: (Math.random() * 2 - 1) * 14,
        life: 75 + Math.random() * 45,
        el: c
      });
    }
    coinLoop();
  }

  function coinLoop() {
    if (coinRun) return;
    coinRun = true;
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    (function step() {
      if (!coinBox) { coinRun = false; return; }
      for (var i = coins.length - 1; i >= 0; i--) {
        var p = coins[i];
        p.vy += 0.28;
        p.vx *= 0.985;
        p.x += p.vx; p.y += p.vy;
        p.rot += p.vr;
        p.life--;
        if (p.life <= 0 || p.y > window.innerHeight + 60) {
          if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
          coins.splice(i, 1);
          continue;
        }
        if (p.life < 22) p.el.style.opacity = String(p.life / 22);
        p.el.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px) rotate(' + Math.round(p.rot) + 'deg)';
      }
      if (coins.length > 0) raf(step);
      else coinRun = false;
    })();
  }

  function coinsClear() {
    coins = [];
    if (coinBox && coinBox.parentNode) coinBox.parentNode.removeChild(coinBox);
    coinBox = null;
  }

  /* ---------- Activation / désactivation ---------- */

  function onCheatClick(e) {
    if (!active) return;
    var x = e.clientX == null ? window.innerWidth / 2 : e.clientX;
    var y = e.clientY == null ? 200 : e.clientY;
    if (!RM) coinSpawn(x, y, 14, 7);
    blip(combo);
  }

  function onCheatMove(e) {
    if (!active) return;
    mouseX = e.clientX || 0; mouseY = e.clientY || 0;
    trackCircles(mouseX, mouseY);
    var now = Date.now();
    if (now - lastComboUp > 90) {
      lastComboUp = now;
      combo++;
      var cEl = document.getElementById('kc-combo-num');
      if (cEl) cEl.textContent = '×' + combo;
      if (combo % 10 === 0) {
        if (!RM) coinSpawn(mouseX, mouseY, 22, 8);
        beep(700 + combo * 8, 0.12, 0, 'square');
      }
    }
    lastMoveT = now;
  }

  function comboWatchStart() {
    comboWatchStop();
    lastMoveT = Date.now();
    comboTimer = setInterval(function () {
      if (!active) return;
      if (Date.now() - lastMoveT > 700 && combo > 0) {
        combo = 0;
        var cEl = document.getElementById('kc-combo-num');
        if (cEl) cEl.textContent = '×0';
      }
    }, 300);
  }
  function comboWatchStop() {
    if (comboTimer) { clearInterval(comboTimer); comboTimer = null; }
  }

  function activate() {
    if (active) { deactivate(true); return; }
    active = true;
    window.__kairoCheatOn = true; // le Snake 404 lit ce flag (skin triche)
    try { sessionStorage.setItem(CHEAT_KEY, '1'); } catch (e) {}
    var L = T[lang()];
    css();
    if (RM) document.body.classList.add('kc-calm');
    document.body.classList.add('kc-cheat', 'kc-crt');
    if (!RM) {
      document.body.classList.add('kc-burst-hard');
      later(function () {
        document.body.classList.remove('kc-burst-hard');
        if (active) document.body.classList.add('kc-burst-soft');
      }, 1100);
    }

    fx = el('div');
    fx.id = 'kairo-cheat-fx';
    fx.appendChild(el('div', 'kc-vig'));
    fx.appendChild(el('div', 'kc-scan'));
    fx.appendChild(el('div', 'kc-glass'));
    if (!RM) fx.appendChild(el('div', 'kc-sweep'));

    var flash = el('div', 'kc-flash', '<span>' + L.cheatOn + '</span>');
    fx.appendChild(flash);
    if (RM) later(function () { flash.style.display = 'none'; }, 2600);

    var hud = el('div', 'kc-hud', L.hud);
    hud.addEventListener('click', function () { deactivate(true); });
    fx.appendChild(hud);

    var scoreBox = el('div', 'kc-score', 'HI-SCORE <b id="kc-score-num">000000</b> · COMBO <b id="kc-combo-num">×0</b> · ∞');
    fx.appendChild(scoreBox);

    var term = el('div', 'kc-term');
    fx.appendChild(term);

    var errBox = el('div');
    fx.appendChild(errBox);

    document.body.appendChild(fx);
    coinsInit();

    // Méga explosion de pièces depuis le centre
    if (!RM) {
      later(function () {
        coinSpawn(window.innerWidth / 2, window.innerHeight * 0.42, 130, 11);
      }, 350);
    }

    if (!RM) { rumbleSound(); rumble(900, 1); }
    beep(180, 0.3, 0, 'sawtooth');
    later(coinSound, 250);
    later(powerSound, 600);
    if (!RM) musicStart();

    scrambleTitles();
    sliceTitles();

    // KAÏRO PANIC flash
    if (!RM) {
      panicTimer = setTimeout(function () {
        panicSound();
        var pn = el('div', 'kc-panic', '<b>' + L.panic + '</b><span>' + L.panicSub + '</span>');
        document.body.appendChild(pn);
        setTimeout(function () { if (pn.parentNode) pn.parentNode.removeChild(pn); }, 550);
      }, 1400);
    }

    // Terminal triche + TOP CHEATERS
    var lines = L.term.concat(L.top);
    var li = 0;
    termTimer = setInterval(function () {
      if (!fx || li >= lines.length) { clearInterval(termTimer); termTimer = null; return; }
      if (lines[li] !== '') term.appendChild(el('div', null, lines[li]));
      li++;
    }, 420);

    // Compteur HI-SCORE qui s'emballe
    score = 0;
    combo = 0;
    var num = document.getElementById('kc-score-num');
    scoreTimer = setInterval(function () {
      if (!fx) { clearInterval(scoreTimer); scoreTimer = null; return; }
      score = Math.min(999990, score + 111 + Math.floor(Math.random() * 8888));
      if (num) num.textContent = String(score).padStart(6, '0');
    }, 60);

    // Fausses erreurs qui poppent partout
    for (var i = 0; i < 5; i++) {
      (function (k) {
        later(function () {
          if (!fx) return;
          var e = el('div', 'kc-err', '✖ ' + L.errors[k % L.errors.length]);
          e.style.left = (4 + Math.random() * 62) + 'vw';
          e.style.top = (18 + Math.random() * 55) + 'vh';
          errBox.appendChild(e);
          if (RM) later(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 2600);
          else setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 3200);
        }, 900 + k * 650);
      })(i);
    }

    document.addEventListener('click', onCheatClick, true);
    document.addEventListener('mousemove', onCheatMove);
    document.addEventListener('mousedown', onDodgeDown, true);
    document.addEventListener('click', onDodgeClick, true);
    comboWatchStart();
    padWatchStart();

    // Les titres tombent une fois le show de scramble/glitch passé (illimité ensuite)
    later(dropTitles, 2300);
  }

  function deactivate(silent) {
    if (!active) return;
    active = false;
    window.__kairoCheatOn = false;
    var L = T[lang()];
    if (termTimer) { clearInterval(termTimer); termTimer = null; }
    if (scoreTimer) { clearInterval(scoreTimer); scoreTimer = null; }
    if (panicTimer) { clearTimeout(panicTimer); panicTimer = null; }
    if (glitchTimer) { clearTimeout(glitchTimer); glitchTimer = null; }
    clearLater();
    musicStop();
    padWatchStop();
    comboWatchStop();
    restoreScrambled();
    restoreFallen();
    restoreDodgers();
    trail = [];
    laserHoles = [];
    try { sessionStorage.removeItem(CHEAT_KEY); } catch (e) {}
    var olds = document.querySelectorAll('.kc-tglitch');
    for (var j = 0; j < olds.length; j++) olds[j].classList.remove('kc-tglitch');
    document.removeEventListener('click', onCheatClick, true);
    document.removeEventListener('mousemove', onCheatMove);
    document.removeEventListener('mousedown', onDodgeDown, true);
    document.removeEventListener('click', onDodgeClick, true);
    try { rumble(200, 0.5); } catch (e) {}
    document.body.classList.remove('kc-cheat', 'kc-crt', 'kc-burst-hard', 'kc-burst-soft', 'kc-calm');
    if (fx && fx.parentNode) fx.parentNode.removeChild(fx);
    fx = null;
    coinsClear();
    if (!silent) return;
    try {
      var bye = el('div');
      bye.id = 'kairo-cheat-fx';
      bye.appendChild(el('div', 'kc-bye', L.cheatOff));
      document.body.appendChild(bye);
      setTimeout(function () { if (bye.parentNode) bye.parentNode.removeChild(bye); }, 1700);
    } catch (e) {}
  }

  // Navigation SPA : les nouveaux titres glitchent puis tombent aussi
  document.addEventListener('kairo:page-ready', function () {
    if (!active || RM) return;
    scrambleTitles();
    sliceTitles();
    later(dropTitles, 1200);
  });

  // Rechargement de page : le cheat illimité reprend
  try {
    if (sessionStorage.getItem(CHEAT_KEY) === '1') activate();
  } catch (e) {}

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && active) { deactivate(true); return; }
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
      if (buf.join(',') === SEQ.join(',')) { buf = []; activate(); }
    } else if (k.indexOf('arrow') === 0) {
      buf = [];
    }
  });
})();
