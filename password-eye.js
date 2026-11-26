/* Agrega un ojito a todos los campos de contraseña de la página (también a los que se creen después). */
(function () {
  'use strict';
  function add(input) {
    if (input.dataset.eye === '1' || input.type !== 'password') return;
    input.dataset.eye = '1';
    var wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.textContent = '👁';
    btn.setAttribute('aria-label', 'Ver contraseña');
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? '🙈' : '👁';
      btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Ver contraseña');
    });
    wrap.appendChild(btn);
  }
  function scan() { document.querySelectorAll('input[type="password"]').forEach(add); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
