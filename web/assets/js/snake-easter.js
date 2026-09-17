/**
 * KaïroOS 404 — Easter egg BONUS STAGE : Snake intégré à la borne.
 * Séquence clavier cachée : Haut Bas Gauche Droite Haut Bas Gauche Droite.
 * Le Snake remplace l'écran GAME OVER dans la fenêtre mac (controles clavier + tactile).
 */
(function () {
  'use strict';

  var SEQ = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  var N = 20;            // grille 20x20
  var CELL = 20;         // canvas 400x400
  var BASE_SPEED = 115;  // ms par tick au départ
  var MIN_SPEED = 55;
  var BEST_KEY = 'kairo-404-snake-best';
  var BOARD_KEY = 'kairo-404-snake-board';
  var BOARD_MAX = 8;

  var overlay, canvas, ctx, scoreEl, bestEl, msgEl, closeBtn, stage, home;
  var buf = [];
  var snake, dir, dirQueue, apples, score, best, alive, started, timer;

  function $(id) { return document.getElementById(id); }

  // Mode triche : flag posé par le Konami global (change tout : skin, pommes, score)
  function cheatOn() { return !!(window.__kairoCheatOn); }

  var SKINS = {
    normal: { bg: '#020617', grid: 'rgba(148,163,184,0.08)',
      apple: '#fb7185', appleGlow: '#f43f5e',
      head: [52, 211, 153], tail: [16, 185, 129],
      glow: 'rgba(52,211,153,0.55)', eyes: '#020617' },
    cheat: { bg: '#1e0533', grid: 'rgba(232,121,249,0.14)',
      apple: '#fbbf24', appleGlow: '#f59e0b',
      head: [34, 211, 238], tail: [232, 121, 249],
      glow: 'rgba(232,121,249,0.6)', eyes: '#ff0044' }
  };

  function init() {
    stage = $('snake-stage');
    home = $('gameover-content');
    canvas = $('snake-game');
    if (!stage || !home || !canvas) return;
    overlay = stage;
    ctx = canvas.getContext('2d');
    scoreEl = $('snake-score');
    bestEl = $('snake-best');
    msgEl = $('snake-msg');
    closeBtn = $('snake-close');
    try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; }
    catch (e) { best = 0; }
    bestEl.textContent = best;

    closeBtn.addEventListener('click', closeSnake);
    canvas.addEventListener('click', function () { if (!started || !alive) startGame(); });

    // Tactile : swipe = direction, tap = start
    var tx = 0, ty = 0;
    canvas.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; tx = t.clientX; ty = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
      if (!started || !alive) { startGame(); return; }
      var t = e.changedTouches[0];
      var dx = t.clientX - tx, dy = t.clientY - ty;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
      else queueDir(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
    }, { passive: true });

    document.addEventListener('keydown', onKey);
    resetBoard();
    draw();
  }

  function onKey(e) {
    var k = e.key;
    var open = !overlay.classList.contains('hidden');
    var tag = (document.activeElement && document.activeElement.tagName) || '';

    if (open) {
      if (k === 'Escape') { closeSnake(); return; }
      // Champ pseudo : Entrée publie, le reste (flèches = curseur) est laissé au champ
      if (tag === 'INPUT' && document.activeElement.id === 'snake-pseudo') {
        if (k === 'Enter') publishScore();
        return;
      }
      if (k === 'Enter') { if (!alive) startGame(); return; }
      if (k === 'ArrowUp' || k === 'z' || k === 'Z' || k === 'w' || k === 'W') { e.preventDefault(); queueDir({ x: 0, y: -1 }); }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); queueDir({ x: 0, y: 1 }); }
      else if (k === 'ArrowLeft' || k === 'q' || k === 'Q' || k === 'a' || k === 'A') { e.preventDefault(); queueDir({ x: -1, y: 0 }); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); queueDir({ x: 1, y: 0 }); }
      return;
    }

    // Détection de la séquence easter egg (hors overlay)
    if (SEQ.indexOf(k) !== -1) {
      buf.push(k);
      if (buf.length > SEQ.length) buf.shift();
      if (buf.join(',') === SEQ.join(',')) { buf = []; openSnake(); }
    } else if (k.indexOf('Arrow') === 0) {
      buf = [];
    }
  }

  function isSnakeOpen() {
    return overlay && !overlay.classList.contains('hidden');
  }

  function openSnake() {
    home.classList.add('hidden');
    stage.classList.remove('hidden');
    stage.classList.add('flex');
    startGame(); // démarrage direct, sans appui sur Entrée
  }

  function closeSnake() {
    stopLoop();
    stage.classList.add('hidden');
    stage.classList.remove('flex');
    home.classList.remove('hidden');
  }

  function resetBoard() {
    var c = Math.floor(N / 2);
    snake = [{ x: c, y: c }, { x: c - 1, y: c }, { x: c - 2, y: c }];
    dir = { x: 1, y: 0 };
    dirQueue = [];
    score = 0;
    alive = true;
    started = false;
    scoreEl.textContent = '0';
    apples = [];
    refillApples();
  }

  function startGame() {
    resetBoard();
    started = true;
    hideMsg();
    stopLoop();
    timer = setInterval(tick, BASE_SPEED);
  }

  function stopLoop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function speed() {
    if (cheatOn()) return Math.max(MIN_SPEED, BASE_SPEED - snake.length * 3);
    return Math.max(MIN_SPEED, BASE_SPEED - Math.floor(score / 30) * 6);
  }

  function queueDir(d) {
    if (!started || !alive) return;
    var last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    // Interdit le demi-tour direct
    if (d.x === -last.x && d.y === -last.y) return;
    if (d.x === last.x && d.y === last.y) return;
    if (dirQueue.length < 3) dirQueue.push(d);
  }

  // Pommes : 1 en normal, 8 en rafale infinie en mode triche
  function appleTarget() { return cheatOn() ? 8 : 1; }

  function appleAt(x, y) {
    for (var i = 0; i < apples.length; i++) {
      if (apples[i].x === x && apples[i].y === y) return i;
    }
    return -1;
  }

  function spawnAppleOne() {
    for (var tries = 0; tries < 60; tries++) {
      var p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
      if (hits(p) || appleAt(p.x, p.y) !== -1) continue;
      apples.push(p);
      return;
    }
  }

  function refillApples() {
    var target = appleTarget();
    while (apples.length < target) {
      var before = apples.length;
      spawnAppleOne();
      if (apples.length === before) break; // plateau plein
    }
    if (apples.length > target) apples.length = target;
  }

  function tick() {
    refillApples(); // suit le mode triche même en cours de partie
    if (dirQueue.length) dir = dirQueue.shift();
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Collision murs ou corps
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || hits(head)) {
      return gameOver();
    }
    snake.unshift(head);

    var ai = appleAt(head.x, head.y);
    if (ai !== -1) {
      apples.splice(ai, 1);
      score += cheatOn() ? 1000 : 10; // score illimité, au max en triche
      scoreEl.textContent = String(score);
      if (score > best) {
        best = score;
        bestEl.textContent = String(best);
        try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
      }
      refillApples();
      stopLoop();
      timer = setInterval(tick, speed());
    } else {
      snake.pop();
    }
    draw();
  }

  function hits(p) {
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].x === p.x && snake[i].y === p.y) return true;
    }
    return false;
  }

  function gameOver() {
    alive = false;
    stopLoop();
    renderGameOver();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadBoard() {
    try {
      var b = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]');
      if (!Array.isArray(b)) return [];
      return b.filter(function (e) {
        return e && typeof e.n === 'string' && typeof e.s === 'number';
      }).map(function (e) {
        return { n: e.n, s: e.s, cheat: !!e.cheat };
      }).slice(0, BOARD_MAX);
    } catch (e) { return []; }
  }

  function saveBoard(board) {
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(board.slice(0, BOARD_MAX))); } catch (e) {}
  }

  function boardHtml(board, highlight) {
    if (!board.length) {
      return '<p class="font-mono text-[11px] text-slate-500">Aucun score publié — sois le premier !</p>';
    }
    var html = '<ol class="w-full max-w-[260px] font-mono text-xs space-y-1">';
    for (var i = 0; i < board.length; i++) {
      var e = board[i];
      var hl = !!highlight && e.n.toLowerCase() === highlight.toLowerCase();
      html += '<li class="flex items-center gap-2 px-2.5 py-1 rounded-lg ' +
        (hl ? 'bg-brand-500/25 text-white' : 'bg-white/5 text-slate-300') + '">' +
        '<span class="text-slate-500 w-5">' + (i + 1) + '.</span>' +
        '<span class="flex-1 truncate text-left">' + escapeHtml(e.n) + '</span>' +
        '<span class="font-bold ' + (e.cheat ? 'text-fuchsia-300' : (i === 0 ? 'text-amber-300' : '')) + '">' + (e.cheat ? 'CHEATER · MAX' : e.s) + '</span></li>';
    }
    return html + '</ol>';
  }

  function renderGameOver() {
    var cheat = cheatOn();
    msgEl.innerHTML =
      '<p class="font-display font-extrabold text-2xl sm:text-3xl tracking-tight ' + (cheat ? 'text-fuchsia-300' : 'text-white') + '">' + (cheat ? 'CHEATER' : 'GAME OVER') + '</p>' +
      '<p class="font-mono text-xs text-brand-300 mt-1 mb-3">' + (cheat ? 'SCORE MAX · BEST ' + best : 'SCORE ' + score + ' · BEST ' + best) + '</p>' +
      '<div id="snake-pubzone" class="flex items-center justify-center gap-2 mb-3">' +
        '<input id="snake-pseudo" maxlength="12" placeholder="Ton pseudo" autocomplete="off" ' +
          'class="w-36 bg-white/10 border border-white/20 rounded-lg px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 outline-none focus:border-brand-400" />' +
        '<button id="snake-publish" type="button" ' +
          'class="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs transition-all">PUBLIER</button>' +
      '</div>' +
      '<div id="snake-board" class="flex flex-col items-center mb-3 max-h-32 overflow-y-auto">' +
        boardHtml(loadBoard()) +
      '</div>' +
      '<button id="snake-retry" type="button" ' +
        'class="press-start px-5 py-2.5 rounded-xl bg-white text-slate-950 font-mono font-bold text-xs tracking-widest hover:bg-brand-500 hover:text-white transition-all">REJOUER</button>' +
      '<p class="font-mono text-[10px] text-slate-500 mt-2">ENTRÉE : rejouer · ÉCHAP : retour borne</p>';
    msgEl.classList.remove('hidden');
    $('snake-publish').addEventListener('click', publishScore);
    $('snake-retry').addEventListener('click', startGame);
  }

  function publishScore() {
    var input = $('snake-pseudo');
    var name = ((input && input.value) || '').trim().slice(0, 12) || 'PLAYER1';
    var cheatNow = cheatOn();
    var board = loadBoard();
    var idx = -1;
    for (var i = 0; i < board.length; i++) {
      if (board[i].n.toLowerCase() === name.toLowerCase()) { idx = i; break; }
    }
    if (idx !== -1) board[idx] = { n: board[idx].n, s: score, cheat: cheatNow }; // même pseudo -> remplacé par le nouveau score
    else board.push({ n: name, s: score, cheat: cheatNow });
    board.sort(function (a, b) { return b.s - a.s; });
    saveBoard(board);
    var zone = $('snake-pubzone');
    if (zone) {
      zone.innerHTML = '<p class="font-mono text-[11px] font-bold ' + (cheatNow ? 'text-fuchsia-300' : 'text-emerald-300') + '">✓ ' +
        (cheatNow ? 'CHEATER · SCORE MAX' : 'SCORE PUBLIÉ') + ' · ' + escapeHtml(name).toUpperCase() + '</p>';
    }
    var list = $('snake-board');
    if (list) list.innerHTML = boardHtml(loadBoard(), name);
    var retry = $('snake-retry');
    if (retry && retry.focus) retry.focus();
  }

  function hideMsg() {
    msgEl.classList.add('hidden');
  }

  function draw() {
    var skin = cheatOn() ? SKINS.cheat : SKINS.normal;
    ctx.fillStyle = skin.bg;
    ctx.fillRect(0, 0, N * CELL, N * CELL);

    // Grille discrète
    ctx.strokeStyle = skin.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var g = 1; g < N; g++) {
      ctx.moveTo(g * CELL + 0.5, 0); ctx.lineTo(g * CELL + 0.5, N * CELL);
      ctx.moveTo(0, g * CELL + 0.5); ctx.lineTo(N * CELL, g * CELL + 0.5);
    }
    ctx.stroke();

    // Pommes néon (rafale infinie en triche)
    for (var a = 0; a < apples.length; a++) {
      var ax = apples[a].x * CELL + CELL / 2, ay = apples[a].y * CELL + CELL / 2;
      ctx.save();
      ctx.shadowColor = skin.appleGlow;
      ctx.shadowBlur = 14;
      ctx.fillStyle = skin.apple;
      ctx.beginPath();
      ctx.arc(ax, ay, CELL * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(ax - 3, ay - 3, CELL * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Serpent : tête claire -> queue (skin triche : cyan -> fuchsia)
    for (var i = snake.length - 1; i >= 0; i--) {
      var s = snake[i];
      var t = snake.length <= 1 ? 0 : i / (snake.length - 1);
      var r = Math.floor(skin.head[0] + t * (skin.tail[0] - skin.head[0]));
      var gg = Math.floor(skin.head[1] + t * (skin.tail[1] - skin.head[1]));
      var b = Math.floor(skin.head[2] + t * (skin.tail[2] - skin.head[2]));
      ctx.save();
      ctx.shadowColor = skin.glow;
      ctx.shadowBlur = i === 0 ? 12 : 6;
      ctx.fillStyle = 'rgb(' + r + ',' + gg + ',' + b + ')';
      roundRect(s.x * CELL + 1.5, s.y * CELL + 1.5, CELL - 3, CELL - 3, 5);
      ctx.fill();
      ctx.restore();
    }

    // Yeux de la tête
    var h = snake[0];
    var hx = h.x * CELL, hy = h.y * CELL;
    ctx.fillStyle = skin.eyes;
    var ex = hx + CELL / 2 + dir.x * 4, ey = hy + CELL / 2 + dir.y * 4;
    var px = -dir.y * 4, py = dir.x * 4;
    ctx.beginPath();
    ctx.arc(ex + px, ey + py, 2.4, 0, Math.PI * 2);
    ctx.arc(ex - px, ey - py, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Expose l'état pour la page (garde-fou touche Entrée)
  window.kairoSnake = { isOpen: isSnakeOpen };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
