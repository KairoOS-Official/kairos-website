/**
 * KaïroOS 404 — Mode attract : festin de Pac-Man (vrais sprites arcade).
 * Après 20 s de présence sur la page (même souris en mouvement), Pac-Man
 * reste dans la borne : il erre, gobe les petits points du 404, puis dévore
 * les gros éléments de la page un par un en grossissant à chaque bouchée,
 * toujours suivi à distance par Blinky (ne le colle jamais).
 * Le festin boucle tant que personne ne touche rien ; la moindre activité
 * restaure la page instantanément. Respecte prefers-reduced-motion.
 */
(function () {
  'use strict';

  var PRESENCE_MS = window.__pacPresenceMs || window.__pacIdleMs || 20000;
  var GRACE_MS = 3000; // le show démarre même si la souris bouge encore
  var SPEED = window.__pacSpeed || 135; // px/s
  var REGROW = window.__pacRegrow || 1500; // délai mini avant repousse (ms)
  var BIG_EVERY = window.__pacBigEvery || 15; // points avant chaque gros élément
  var IMG = '/assets/img/pacman/';
  var PAC_FRAMES = [IMG + 'pac-full.png', IMG + 'pac-mid.png', IMG + 'pac-narrow.png', IMG + 'pac-mid.png'];
  var GHOST_FRAMES = [IMG + 'blinky-0.png', IMG + 'blinky-1.png'];
  var RM = false;
  try { RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

  var pageT0 = Date.now(); // horloge de présence (20 s sur la page, activité ou non)
  var runStartT = 0;
  var running = false;
  var audioCtx = null;
  var lastWaka = 0;
  var wakaHigh = false;

  // État du festin
  var screen = null, layer = null, pacPos = null, pacImg = null, ghostPos = null, ghostImg = null;
  var fx = null, list = [], ox = 0, oy = 0, srw = 0, srh = 0;
  var px = 0, py = 0, pvx = 0, pvy = 0, gx = 0, gy = 0, travAng = 0;
  var pacSize = 1, dotBites = 0, lastBigAt = 0;
  var targets = [], eatenEl = [];
  var chompTimer = null, feetTimer = null, frameI = 0, feetI = 0;

  try {
    PAC_FRAMES.concat(GHOST_FRAMES).forEach(function (src) { var im = new Image(); im.src = src; });
  } catch (e) {}

  function css() {
    if (document.getElementById('km-pac-css')) return;
    var s = document.createElement('style');
    s.id = 'km-pac-css';
    s.textContent = [
      '.km-run{position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden}',
      '.km-pos{position:absolute;left:0;top:0;transform:translate(-50%,-50%);pointer-events:none}',
      '.km-sprite{image-rendering:pixelated;image-rendering:crisp-edges;display:block}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function markActive() {
    // La présence suffit : on n'interrompt que passé le délai de grâce
    if (running && Date.now() - runStartT > GRACE_MS) abortRun(); // on touche : la page se restaure aussitôt
    try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
  }

  function unlockAudio() {
    if (audioCtx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    } catch (e) { audioCtx = null; }
  }

  ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (t) {
    try { document.addEventListener(t, markActive, { passive: true }); } catch (e) { document.addEventListener(t, markActive); }
  });
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (t) {
    try { document.addEventListener(t, unlockAudio); } catch (e) {}
  });
  try {
    document.addEventListener('visibilitychange', function () { if (!document.hidden) markActive(); });
    document.addEventListener('kairo:page-ready', function () { if (running) abortRun(); });
  } catch (e) {}

  function tone(freq, dur, vol) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state !== 'running') return;
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      var t = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) {}
  }

  function waka() {
    var now = Date.now();
    if (now - lastWaka < 110) return;
    lastWaka = now;
    wakaHigh = !wakaHigh;
    tone(wakaHigh ? 540 : 330, 0.09);
  }

  function bigChomp() {
    tone(170, 0.16, 0.1);
    setTimeout(function () { tone(95, 0.22, 0.1); }, 110);
  }

  function screenOf(canvas) {
    try {
      var s = canvas.parentNode;
      while (s) {
        if (s.classList && s.classList.contains && s.classList.contains('crt')) return s;
        s = s.parentNode;
      }
    } catch (e) {}
    try { return canvas.parentNode || document.body; } catch (e2) { return null; }
  }

  function collectTargets() {
    targets = [];
    try {
      var found = screen.querySelectorAll('h1, p, a');
      var small = [];
      for (var i = 0; i < found.length; i++) {
        var elm = found[i];
        if (!elm || elm.id === 'particles-404') continue;
        if (elm.style && elm.style.visibility === 'hidden') continue;
        if (/^h1$/i.test(elm.tagName || '')) targets.push(elm); // boss final en dernier
        else small.push(elm);
      }
      targets = small.concat(targets);
    } catch (e) { targets = []; }
  }

  function setPacSize(s) {
    pacSize = s;
    var w = Math.round(34 * s);
    try {
      pacImg.width = w; pacImg.height = w;
      pacImg.style.width = w + 'px'; pacImg.style.height = w + 'px';
    } catch (e) {}
  }

  function orientPac() {
    var o;
    if (Math.abs(pvx) >= Math.abs(pvy)) o = pvx >= 0 ? '' : 'scaleX(-1)';
    else o = pvy >= 0 ? 'rotate(90deg)' : 'rotate(-90deg)';
    try { if (pacImg._ori !== o) { pacImg._ori = o; pacImg.style.transform = o; } } catch (e) {}
  }

  function nearestDot() {
    var best = null, bd = 1e12;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.eaten) continue;
      var dx = (ox + p.x) - px, dy = (oy + p.y) - py;
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: ox + p.x, y: oy + p.y }; }
    }
    return best;
  }

  function eatNextBig() {
    var elm = null;
    while (targets.length) {
      var cand = targets.shift();
      try {
        if (cand.style && cand.style.visibility === 'hidden') continue;
      } catch (e) {}
      elm = cand;
      break;
    }
    if (!elm) { endCycle(); return; }
    bigChomp();
    try {
      elm.__kcCss = elm.style.cssText || '';
      elm.style.transition = 'transform .35s ease-in, opacity .35s ease-in';
      elm.style.transform = 'scale(.1)';
      elm.style.opacity = '0';
    } catch (e) {}
    elm.__kcBite = (elm.__kcBite || 0) + 1;
    (function (node, myBite) {
      setTimeout(function () {
        if (!running) return;
        if (node.__kcBite !== myBite) return; // restauré entre-temps : bouchée périmée
        try {
          node.style.transition = '';
          node.style.transform = '';
          node.style.opacity = '';
          node.style.visibility = 'hidden';
        } catch (e2) {}
      }, 380);
    })(elm, elm.__kcBite);
    eatenEl.push(elm);
    setPacSize(Math.min(2.4, pacSize + 0.22));
  }

  function endCycle() {
    // Tout est mangé : pause digestive puis nouveau festin
    setTimeout(function () {
      if (!running) return;
      restoreAll();
      collectTargets();
      setPacSize(1);
      dotBites = 0;
      lastBigAt = 0;
    }, 2000);
  }

  function restoreAll() {
    for (var i = 0; i < eatenEl.length; i++) {
      try { eatenEl[i].style.cssText = eatenEl[i].__kcCss || ''; } catch (e) {}
      try { eatenEl[i].__kcBite = (eatenEl[i].__kcBite || 0) + 1; } catch (e2) {} // périme les timeouts en vol
    }
    eatenEl = [];
    try {
      for (var j = 0; j < list.length; j++) list[j].eaten = false;
    } catch (e) {}
  }

  function abortRun() {
    if (!running) return;
    running = false;
    if (chompTimer) { clearInterval(chompTimer); chompTimer = null; }
    if (feetTimer) { clearInterval(feetTimer); feetTimer = null; }
    restoreAll();
    try { if (layer && layer.parentNode) layer.parentNode.removeChild(layer); } catch (e) {}
    layer = null;
    pageT0 = Date.now(); // réarme : prochain festin dans 20 s de présence
  }

  function run() {
    if (running || RM || document.hidden) return;
    try { fx = window.__kairoFx; } catch (e) { fx = null; }
    if (!fx || !fx.list || !fx.list.length || !fx.canvas) return;
    try {
      if (window.kairoSnake && window.kairoSnake.isOpen && window.kairoSnake.isOpen()) return;
    } catch (e) {}
    screen = screenOf(fx.canvas);
    if (!screen) return;
    var sr, cr;
    try {
      sr = screen.getBoundingClientRect();
      cr = fx.canvas.getBoundingClientRect();
    } catch (e) { return; }
    if (!cr.width || !sr.width) return;

    css();
    list = fx.list;
    ox = cr.left - sr.left; oy = cr.top - sr.top;
    srw = sr.width; srh = sr.height;

    layer = document.createElement('div');
    layer.className = 'km-run';
    pacPos = document.createElement('div');
    pacPos.className = 'km-pos';
    pacImg = document.createElement('img');
    try { pacImg.setAttribute('src', PAC_FRAMES[0]); } catch (e) { pacImg.src = PAC_FRAMES[0]; }
    try { pacImg.setAttribute('alt', 'Pac-Man'); } catch (e2) {}
    pacImg.className = 'km-sprite';
    pacPos.appendChild(pacImg);
    ghostPos = document.createElement('div');
    ghostPos.className = 'km-pos';
    ghostImg = document.createElement('img');
    try { ghostImg.setAttribute('src', GHOST_FRAMES[0]); } catch (e3) { ghostImg.src = GHOST_FRAMES[0]; }
    try { ghostImg.setAttribute('alt', 'Blinky'); } catch (e4) {}
    ghostImg.className = 'km-sprite';
    ghostPos.appendChild(ghostImg);
    layer.appendChild(pacPos);
    layer.appendChild(ghostPos);
    screen.appendChild(layer);

    collectTargets();
    setPacSize(1);
    dotBites = 0;
    lastBigAt = 0;
    px = srw * 0.5; py = srh * 0.5;
    var a0 = Math.random() * Math.PI * 2;
    pvx = Math.cos(a0) * SPEED; pvy = Math.sin(a0) * SPEED;
    travAng = a0;
    gx = px - 90; gy = py;

    running = true;
    runStartT = Date.now();
    frameI = 0; feetI = 0;
    chompTimer = setInterval(function () {
      if (!running) return;
      frameI = (frameI + 1) % PAC_FRAMES.length;
      try { pacImg.src = PAC_FRAMES[frameI]; } catch (e) {}
    }, 130);
    feetTimer = setInterval(function () {
      if (!running) return;
      feetI = 1 - feetI;
      try { ghostImg.src = GHOST_FRAMES[feetI]; } catch (e) {}
    }, 220);

    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    var last = null;
    var eatR = 0;
    function frame(now) {
      if (!running) return;
      try {
        if (!screen.isConnected && screen.parentNode == null) { abortRun(); return; }
      } catch (e) {}
      if (now == null) now = Date.now();
      if (last == null) last = now;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Erre : cap vers le point le plus proche + zigzag, rebond aux bords
      var ang = Math.atan2(pvy, pvx);
      var nd = nearestDot();
      if (nd && Math.random() < 0.4) {
        var ta = Math.atan2(nd.y - py, nd.x - px);
        var diff = ta - ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ang += diff * 0.35;
      }
      if (Math.random() < 0.02) ang += (Math.random() - 0.5) * 1.8;
      pvx = Math.cos(ang) * SPEED; pvy = Math.sin(ang) * SPEED;
      travAng = ang;
      var m = 26;
      px += pvx * dt; py += pvy * dt;
      if (px < m) { px = m; pvx = Math.abs(pvx); }
      if (px > srw - m) { px = srw - m; pvx = -Math.abs(pvx); }
      if (py < m) { py = m; pvy = Math.abs(pvy); }
      if (py > srh - m) { py = srh - m; pvy = -Math.abs(pvy); }
      orientPac();
      pacPos.style.left = px + 'px';
      pacPos.style.top = py + 'px';

      // Blinky suit à distance (reste derrière, ne colle jamais Pac-Man)
      var bx = px - Math.cos(travAng) * 95, by = py - Math.sin(travAng) * 95;
      var gdx = bx - gx, gdy = by - gy;
      var gd = Math.sqrt(gdx * gdx + gdy * gdy);
      if (gd > 8) {
        gx += (gdx / gd) * SPEED * 0.85 * dt;
        gy += (gdy / gd) * SPEED * 0.85 * dt;
      }
      var gm = 16;
      if (gx < gm) gx = gm;
      if (gx > srw - gm) gx = srw - gm;
      if (gy < gm) gy = gm;
      if (gy > srh - gm) gy = srh - gm;
      ghostPos.style.left = gx + 'px';
      ghostPos.style.top = (gy + Math.sin(now / 130) * 3) + 'px';
      var gw = Math.round(30 * (0.7 + pacSize * 0.3));
      try { ghostImg.style.width = gw + 'px'; ghostImg.style.height = Math.round(gw * 1.06) + 'px'; } catch (e) {}

      // Festin de points
      eatR = 18 + 12 * pacSize;
      var tSec = fx.time;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p.eaten) continue;
        var dx = (ox + p.x) - px, dy = (oy + p.y) - py;
        if (dx * dx + dy * dy < eatR * eatR) {
          p.eaten = true;
          p.regrowAt = tSec + (REGROW + Math.random() * 1500) / 1000;
          dotBites++;
          setPacSize(Math.min(2.4, pacSize + 0.012));
          waka();
          if (dotBites - lastBigAt >= BIG_EVERY) {
            lastBigAt = dotBites;
            eatNextBig();
          }
        }
      }
      raf(frame);
    }
    raf(frame);
  }

  setInterval(function () {
    if (!running && !document.hidden && Date.now() - pageT0 > PRESENCE_MS) run();
  }, 1000);

  try {
    window.__pacMan = {
      run: run,
      abort: abortRun,
      get running() { return running; }
    };
  } catch (e) {}
})();
