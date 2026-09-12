/**
 * KaïroOS — Visualiseur de Manette Interactif (Gamepad Visualizer)
 * Prise en charge native de la Web Gamepad API + simulation au clic souris
 */

(function() {
  function initGamepadVisualizer() {
    const visualizer = document.getElementById('gamepad-visualizer');
    if (!visualizer) return;

    const statusBadge = document.getElementById('gamepad-status-badge');
    const statusText = document.getElementById('gamepad-status-text');

    // Mapping des éléments SVG
    const svgElements = {
      btnA: visualizer.querySelector('#pad-btn-a'),
      btnB: visualizer.querySelector('#pad-btn-b'),
      btnX: visualizer.querySelector('#pad-btn-x'),
      btnY: visualizer.querySelector('#pad-btn-y'),
      dpadUp: visualizer.querySelector('#pad-dpad-up'),
      dpadDown: visualizer.querySelector('#pad-dpad-down'),
      dpadLeft: visualizer.querySelector('#pad-dpad-left'),
      dpadRight: visualizer.querySelector('#pad-dpad-right'),
      stickLeft: visualizer.querySelector('#pad-stick-left'),
      stickRight: visualizer.querySelector('#pad-stick-right'),
      btnStart: visualizer.querySelector('#pad-btn-start'),
      btnSelect: visualizer.querySelector('#pad-btn-select'),
    };

    // Animation flash d'un bouton au clic souris ou appui manette
    function pulseButton(el, activeColor = '#6366f1') {
      if (!el) return;
      const originalFill = el.getAttribute('data-original-fill') || el.getAttribute('fill');
      if (!el.getAttribute('data-original-fill')) {
        el.setAttribute('data-original-fill', originalFill);
      }

      el.setAttribute('fill', activeColor);
      el.style.filter = 'drop-shadow(0 0 6px ' + activeColor + ')';
      el.style.transform = 'scale(1.15)';
      el.style.transformOrigin = 'center';
      el.style.transition = 'transform 0.15s ease, filter 0.15s ease';

      setTimeout(() => {
        el.setAttribute('fill', originalFill);
        el.style.filter = 'none';
        el.style.transform = 'scale(1)';
      }, 250);
    }

    // Gestion du clic direct sur les éléments SVG
    Object.entries(svgElements).forEach(([name, el]) => {
      if (!el) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        pulseButton(el, '#10b981');
      });
    });

    // Écoute des raccourcis cliquables sous la manette
    document.querySelectorAll('[data-pad-trigger]').forEach(trigger => {
      trigger.addEventListener('click', () => {
        const targetBtn = trigger.getAttribute('data-pad-trigger');
        if (svgElements[targetBtn]) {
          pulseButton(svgElements[targetBtn], '#f43f5e');
        }
      });
    });

    // Prise en charge de la Web Gamepad API
    let gamepadIndex = null;

    window.addEventListener("gamepadconnected", (e) => {
      gamepadIndex = e.gamepad.index;
      if (statusBadge && statusText) {
        statusBadge.classList.remove('bg-slate-100', 'text-slate-600');
        statusBadge.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
        statusText.textContent = `🎮 ${e.gamepad.id.split('(')[0].trim()} connecté`;
      }
      pollGamepad();
    });

    window.addEventListener("gamepaddisconnected", () => {
      gamepadIndex = null;
      if (statusBadge && statusText) {
        statusBadge.classList.add('bg-slate-100', 'text-slate-600');
        statusBadge.classList.remove('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
        statusText.textContent = 'XInput / DirectInput Prêt';
      }
    });

    function pollGamepad() {
      if (gamepadIndex === null) return;
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[gamepadIndex];

      if (gp) {
        // Boutons standards standard gamepad mapping : 0: A, 1: B, 2: X, 3: Y
        if (gp.buttons[0] && gp.buttons[0].pressed) pulseButton(svgElements.btnA, '#10b981');
        if (gp.buttons[1] && gp.buttons[1].pressed) pulseButton(svgElements.btnB, '#6366f1');
        if (gp.buttons[2] && gp.buttons[2].pressed) pulseButton(svgElements.btnX, '#f59e0b');
        if (gp.buttons[3] && gp.buttons[3].pressed) pulseButton(svgElements.btnY, '#f43f5e');

        // D-Pad : 12: Up, 13: Down, 14: Left, 15: Right
        if (gp.buttons[12] && gp.buttons[12].pressed) pulseButton(svgElements.dpadUp, '#38bdf8');
        if (gp.buttons[13] && gp.buttons[13].pressed) pulseButton(svgElements.dpadDown, '#38bdf8');
        if (gp.buttons[14] && gp.buttons[14].pressed) pulseButton(svgElements.dpadLeft, '#38bdf8');
        if (gp.buttons[15] && gp.buttons[15].pressed) pulseButton(svgElements.dpadRight, '#38bdf8');

        // Start & Select : 8: Select/Back, 9: Start
        if (gp.buttons[8] && gp.buttons[8].pressed) pulseButton(svgElements.btnSelect, '#cbd5e1');
        if (gp.buttons[9] && gp.buttons[9].pressed) pulseButton(svgElements.btnStart, '#cbd5e1');

        requestAnimationFrame(pollGamepad);
      }
    }
  }

  window.initGamepadVisualizer = initGamepadVisualizer;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGamepadVisualizer);
  } else {
    initGamepadVisualizer();
  }
})();
