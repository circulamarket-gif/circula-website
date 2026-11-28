/* CIRCULA · Vincular Telegram y WhatsApp con un código temporal. Se carga DESPUÉS de app.js.
   Solo usa textContent (nada de innerHTML con datos del servidor) y solo abre enlaces https de t.me / wa.me. */
(function () {
  'use strict';
  const cfg = window.CIRCULA_CONFIG || {};
  const base = String(cfg.apiBaseUrl || '').replace(/\/$/, '');
  const NOMBRES = { telegram: 'Telegram', whatsapp: 'WhatsApp' };
  let temporizador = null, sondeo = null, vence = 0;

  const token = () => { try { return sessionStorage.getItem('circula_access_token'); } catch (_) { return null; } };

  async function llamar(ruta, metodo, cuerpo) {
    const r = await fetch(base + '/vinculacion' + ruta, {
      method: metodo || 'GET',
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    let datos = {};
    try { datos = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(datos.error || 'No se pudo completar la acción.');
    return datos;
  }

  const el = (tag, props, ...hijos) => {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    hijos.forEach(h => e.append(h));
    return e;
  };

  const enlaceSeguro = (url, dominios) => {
    try { const u = new URL(url); return u.protocol === 'https:' && dominios.includes(u.hostname) ? u.href : null; }
    catch (_) { return null; }
  };

  function montar(vista) {
    if (!token() || vista.querySelector('#vinculacion-panel') || !vista.querySelector('#logout')) return;
    const panel = el('section', { id: 'vinculacion-panel', className: 'account-requests' });
    const lista = el('ul'), caja = el('div'), estado = el('p', { className: 'status-note', role: 'status' });
    const boton = el('button', { className: 'button primary', type: 'button', textContent: 'Generar código' });
    panel.append(el('h3', { textContent: 'Vincular Telegram y WhatsApp' }),
      el('p', { textContent: 'Genera un código y envíalo a nuestro bot: así recibes tus avisos y negociaciones en todos los canales.' }),
      lista, boton, caja, estado);
    vista.querySelector('#logout').before(panel);

    async function refrescar() {
      try {
        const { canales } = await llamar('/canales');
        lista.replaceChildren(...canales.map(c => {
          const li = el('li');
          li.append(el('strong', { textContent: NOMBRES[c.canal] || c.canal }),
            document.createTextNode(c.vinculado ? ' · ✅ vinculado' + (c.etiqueta ? ' (' + c.etiqueta + ')' : '') : ' · sin vincular'));
          if (c.vinculado && !c.nativo) {
            const q = el('button', { className: 'button soft', type: 'button', textContent: 'Quitar' });
            q.onclick = async () => {
              if (!confirm('¿Quitar ' + (NOMBRES[c.canal] || c.canal) + ' de tu cuenta?')) return;
              try { await llamar('/desvincular', 'POST', { canal: c.canal }); estado.textContent = ''; refrescar(); }
              catch (e) { estado.textContent = e.message; }
            };
            li.append(' ', q);
          }
          return li;
        }));
        if (caja.childNodes.length && canales.every(c => c.vinculado)) { parar(); caja.replaceChildren(); }
      } catch (e) { estado.textContent = e.message; }
    }

    function parar() { clearInterval(temporizador); clearInterval(sondeo); temporizador = sondeo = null; }

    function mostrar(r) {
      parar();
      vence = Date.now() + r.segundos * 1000;
      const codigo = el('strong', { textContent: r.codigo, style: 'font-size:1.6rem;letter-spacing:.15em' });
      const cuenta = el('small');
      const copiar = el('button', { className: 'button soft', type: 'button', textContent: 'Copiar' });
      copiar.onclick = async () => { try { await navigator.clipboard.writeText(r.codigo); copiar.textContent = '¡Copiado!'; } catch (_) { copiar.textContent = 'Cópialo a mano'; } };
      const enlaces = el('p');
      const tg = enlaceSeguro((r.enlaces || {}).telegram, ['t.me']);
      const wa = enlaceSeguro((r.enlaces || {}).whatsapp, ['wa.me']);
      if (tg) enlaces.append(el('a', { href: tg, target: '_blank', rel: 'noopener noreferrer', textContent: 'Abrir Telegram', className: 'button soft' }), ' ');
      if (wa) enlaces.append(el('a', { href: wa, target: '_blank', rel: 'noopener noreferrer', textContent: 'Abrir WhatsApp', className: 'button soft' }));
      caja.replaceChildren(codigo, ' ', copiar, el('br'), cuenta,
        el('p', { textContent: 'También puedes escribirle al bot: vincular ' + r.codigo }), enlaces);
      const tic = () => {
        const s = Math.max(0, Math.round((vence - Date.now()) / 1000));
        cuenta.textContent = s ? 'Vence en ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : 'El código venció. Genera uno nuevo.';
        if (!s) parar();
      };
      tic(); temporizador = setInterval(tic, 1000); sondeo = setInterval(refrescar, 4000);
    }

    boton.onclick = async () => {
      estado.textContent = ''; boton.disabled = true;
      try { mostrar(await llamar('/codigo', 'POST')); } catch (e) { estado.textContent = e.message; }
      setTimeout(() => { boton.disabled = false; }, 3000);
    };
    refrescar();
  }

  function iniciar() {
    const vista = document.getElementById('profile-view');
    if (!vista) return;
    new MutationObserver(() => { if (!vista.hidden) montar(vista); }).observe(vista, { childList: true });
    window.addEventListener('circula:logout', parar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
