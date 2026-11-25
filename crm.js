(() => {
  'use strict';
  const apiBase = String(window.CIRCULA_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
  const $ = (s, root = document) => root.querySelector(s);
  const tokenKey = 'circula_crm_token';
  const state = { token: sessionStorage.getItem(tokenKey) || '', user: null, permissions: new Set(), cases: [], selectedCase: null, team: [], selectedThread: null, selectedListing: null, imageUrls: [], timer: null };
  const safe = (x) => String(x ?? '');
  const roleName = { superadministrador:'Superadministrador', manager_general:'Manager general', administrador:'Administrador', coordinador:'Coordinador', broker:'Broker' };
  const statusName = { disponible:'Disponible', descanso:'Descanso', bano:'Baño', capacitacion:'Capacitación', offline:'Desconectado' };

  async function api(path, options = {}) {
    if (!apiBase) throw new Error('No está configurada la dirección del servidor de CIRCULA.');
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type':'application/json', ...(state.token ? { Authorization:`Bearer ${state.token}` } : {}), ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `No se pudo completar la acción (${response.status}).`);
    return payload;
  }
  function message(text, target = $('#global-message')) { target.textContent = text || ''; }
  function node(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function button(text, action, cls = 'button subtle') { const b = node('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; }
  function has(permission) { return state.user?.rol === 'superadministrador' || state.permissions.has('*') || state.permissions.has(permission); }
  function tab(name) {
    $$('.tab-panel').forEach(p => p.hidden = p.id !== `tab-${name}`);
    $$('#tabs [data-tab]').forEach(b => b.classList.toggle('selected', b.dataset.tab === name));
    if (name === 'casos') refreshCases();
    if (name === 'inicio') refreshDashboard();
    if (name === 'equipo') refreshTeam();
    if (name === 'usuarios') refreshUsers();
    if (name === 'buzon') refreshInbox();
    if (name === 'permisos') refreshPermissions();
    if (name === 'moderacion') refreshListings();
  }
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  function showApp(user, permissions = []) {
    state.user = user; state.permissions = new Set(permissions);
    $('#login-card').hidden = true; $('#crm-app').hidden = false;
    $('#staff-name').textContent = user.nombre; $('#staff-role').textContent = roleName[user.rol] || user.rol;
    $('#welcome-name').textContent = user.nombre.split(' ')[0]; $('#staff-status').value = user.estado || 'offline';
    $$('#tabs [data-permission]').forEach(b => b.hidden = !has(b.dataset.permission));
    $$('#tabs [data-role]').forEach(b => b.hidden = user.rol !== b.dataset.role);
    const first = has('ver_dashboard') ? 'inicio' : 'casos';
    tab(first);
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (!$('#crm-app').hidden) {
        refreshCases(true);
        if (has('ver_dashboard')) refreshDashboard();
        if (!$('#tab-buzon').hidden) refreshInbox(true);
        if (!$('#tab-moderacion').hidden) refreshListings(true);
        if (state.selectedCase && !$('#tab-casos').hidden) openCase(state.selectedCase, true);
      }
    }, 7000);
  }
  async function restore() {
    if (!state.token) return;
    try { const data = await api('/crm/me'); showApp(data.usuario, data.permisos || []); }
    catch (_) { sessionStorage.removeItem(tokenKey); state.token = ''; }
  }
  async function refreshDashboard() {
    if (!has('ver_dashboard')) return;
    try {
      const data = await api('/crm/dashboard');
      $('#active-count').textContent = data.casos_activos;
      $('#unassigned-count').textContent = data.casos_sin_asignar;
      $('#team-count').textContent = (data.brokers || []).length;
      if (data.brokers?.length) {
        $('#recent-cases').replaceChildren(...data.brokers.slice(0, 5).map(person => {
          const row = node('div', undefined, 'case-row');
          row.append(node('strong', person.nombre), node('small', `${roleName[person.rol] || person.rol} · ${statusName[person.estado] || person.estado}`));
          return row;
        }));
      }
    } catch (error) { message(error.message); }
  }
  async function refreshCases(silent = false) {
    try {
      const filter = $('#case-filter')?.value || 'activos';
      const data = await api(`/crm/casos?estado=${encodeURIComponent(filter)}&limite=80`);
      state.cases = data.items || [];
      const list = $('#case-list');
      const recent = $('#recent-cases');
      if (list) list.replaceChildren(...state.cases.map(c => caseButton(c)));
      if (recent && state.cases.length) recent.replaceChildren(...state.cases.slice(0, 5).map(c => caseButton(c)));
      if (state.selectedCase && !state.cases.some(c => c.id === state.selectedCase)) state.selectedCase = null;
    } catch (error) { if (!silent) message(error.message); }
  }
  function caseButton(c) {
    const b = node('button', undefined, `case-row${state.selectedCase === c.id ? ' selected' : ''}`); b.type = 'button';
    b.append(node('strong', `Caso #${c.id} · ${c.motivo || c.tipo || 'Atención'}`));
    b.append(node('small', `${c.codigo_usuario || 'Usuario'} · ${c.canal || 'Canal'} · ${c.broker_nombre || 'Sin asignar'}`));
    b.append(node('span', c.estado, 'badge'));
    b.addEventListener('click', () => { state.selectedCase = c.id; openCase(c.id); });
    return b;
  }
  async function openCase(id, silent = false) {
    try {
      const c = await api(`/crm/casos/${id}`); state.selectedCase = id;
      const detail = $('#case-detail'); detail.replaceChildren();
      detail.append(node('h2', `Caso #${c.id} · ${c.motivo || c.tipo || 'Atención'}`));
      detail.append(node('p', `${c.codigo_usuario || 'Usuario'} · ${c.canal} · ${c.estado} · ${c.broker_nombre}`, 'detail-meta'));
      if (c.resumen) detail.append(node('p', c.resumen, 'muted'));
      const msgs = node('div', undefined, 'messages');
      (c.mensajes || []).forEach(m => { const bubble = node('div', undefined, ['broker','coordinador','administrador'].includes(m.autor) || String(m.autor).startsWith('broker→') ? 'message staff' : 'message'); bubble.append(node('span', m.texto)); bubble.append(node('small', `${m.autor} · ${m.fecha}`)); msgs.append(bubble); });
      detail.append(msgs);
      if (c.estado !== 'Cerrado' && has('tomar_casos')) {
        const actions = node('div', undefined, 'inline');
        if (!c.broker_id && state.user.rol === 'broker') actions.append(button('Tomar caso', async () => { try { await api(`/crm/casos/${id}/tomar`, { method:'POST', body:{} }); await openCase(id); await refreshCases(true); } catch(e) { message(e.message); } }));
        if (has('asignar_casos')) {
          const select = node('select'); select.setAttribute('aria-label','Asignar a broker');
          state.team.filter(x => x.rol === 'broker' && x.activo).forEach(p => { const o=node('option',p.nombre);o.value=p.id;select.append(o); });
          if (select.options.length) actions.append(select, button('Asignar', async () => { try { await api(`/crm/casos/${id}/asignar`, {method:'POST',body:{staff_id:Number(select.value)}}); await openCase(id); await refreshCases(true); } catch(e) { message(e.message); } }));
        }
        detail.append(actions);
        const targets = node('select'); targets.setAttribute('aria-label','Destinatario');
        const client = node('option','Responder al cliente'); client.value='cliente';targets.append(client);
        (c.partes || []).forEach(p=>{const o=node('option',`Responder a contraparte ${p.codigo}`);o.value=p.codigo;targets.append(o);});
        const text = node('textarea'); text.maxLength=2000;text.placeholder='Escribe una respuesta clara y amable…';
        const send = button('Enviar respuesta', async () => { if(!text.value.trim())return;send.disabled=true;try{await api(`/crm/casos/${id}/mensaje`,{method:'POST',body:{texto:text.value,destino:targets.value}});text.value='';await openCase(id);message('Respuesta enviada.');}catch(e){message(e.message);}finally{send.disabled=false;} },'button primary');
        const reply=node('div',undefined,'reply-box');reply.append(targets,text,send);
        if (has('trasladar_casos')) {
          const code=node('input');code.placeholder='Código CIRCULA del vendedor/proveedor';code.maxLength=40;
          const transferText=node('textarea');transferText.placeholder='Necesidad que vas a trasladar';transferText.maxLength=2000;
          const transfer=button('Trasladar al vendedor',async()=>{try{const r=await api(`/crm/casos/${id}/trasladar`,{method:'POST',body:{codigo:code.value,texto:transferText.value}});message(r.mensaje||'Necesidad trasladada.');await openCase(id);}catch(e){message(e.message);}},'button subtle');
          reply.append(node('small','Canaliza la necesidad sin compartir datos personales.'),code,transferText,transfer);
        }
        if (has('cerrar_casos')) reply.append(button('Cerrar caso',async()=>{try{await api(`/crm/casos/${id}/cerrar`,{method:'POST',body:{}});await refreshCases(true);await openCase(id); }catch(e){message(e.message);}},'button subtle'));
        detail.append(reply);
      }
    } catch (error) { if (!silent) message(error.message); }
  }
  async function refreshTeam() {
    try {
      const data=await api('/crm/personal');state.team=data.items||[];
      $('#team-rows').replaceChildren(...state.team.map(p=>{const tr=node('tr');[p.nombre,roleName[p.rol]||p.rol,statusName[p.estado]||p.estado,p.actualizado||'—'].forEach(v=>tr.append(node('td',v)));return tr;}));
      $('#team-count').textContent=state.team.filter(p=>p.rol==='broker').length;
    } catch(error){message(error.message);}
  }
  async function refreshUsers(){
    try{const data=await api('/crm/usuarios');$('#user-list').replaceChildren(...(data.items||[]).map(p=>{const row=node('div',undefined,'case-row');row.append(node('strong',p.nombre),node('small',`${p.email} · ${roleName[p.rol]||p.rol} · ${statusName[p.estado]||p.estado}`));return row;}));}
    catch(error){message(error.message);}
  }
  async function refreshPermissions(){
    try{const data=await api('/crm/permisos');const roles=(data.roles||[]).filter(r=>r!=='superadministrador');$('#permission-role').replaceChildren(...roles.map(r=>{const o=node('option',roleName[r]||r);o.value=r;return o;}));const all=[...new Set(Object.values(data.base||{}).flat().filter(x=>x!=='*'))].sort();$('#permission-name').replaceChildren(...all.map(p=>{const o=node('option',p);o.value=p;return o;}));const mat=$('#permission-matrix');mat.replaceChildren(node('h2','Permisos predeterminados'),node('p','El superadministrador mantiene acceso total y no puede ser restringido desde esta matriz.'));for(const [r,perms] of Object.entries(data.base||{})){const row=node('p',undefined,'matrix-row');row.append(node('strong',roleName[r]||r),node('code',perms.join(', ')));mat.append(row);}for(const x of data.cambios||[]){const row=node('p',undefined,'matrix-row');row.append(node('strong',roleName[x.rol]||x.rol),node('code',`${x.permiso}: ${x.permitido?'permitido':'denegado'}`));mat.append(row);}}
    catch(error){message(error.message);}
  }
  async function refreshInbox(silent=false){
    try{const data=await api('/crm/buzon/hilos');const list=$('#inbox-list');list.replaceChildren(...(data.items||[]).map(h=>{const b=node('button',undefined,`case-row${state.selectedThread===h.id?' selected':''}`);b.type='button';b.append(node('strong',`Usuario ${h.codigo_usuario}`),node('small',h.ultimo_mensaje||'Sin mensajes'),node('span',h.estado,'badge'));b.addEventListener('click',()=>openThread(h.id));return b;}));}
    catch(error){if(!silent)message(error.message);}
  }
  async function openThread(id){
    try{state.selectedThread=id;const h=await api(`/crm/buzon/hilos/${id}`);const detail=$('#inbox-detail');detail.replaceChildren(node('h2',`Buzón · ${h.codigo_usuario}`),node('p','Conversación interna con el usuario.','detail-meta'));const msgs=node('div',undefined,'messages');(h.mensajes||[]).forEach(m=>{const b=node('div',undefined,m.autor_tipo==='usuario'?'message':'message staff');b.append(node('span',m.texto),node('small',`${m.autor_tipo} · ${m.fecha}`));msgs.append(b);});detail.append(msgs);const text=node('textarea');text.maxLength=2000;text.placeholder='Escribe una respuesta al usuario…';const send=button('Responder',async()=>{try{await api(`/crm/buzon/hilos/${id}/mensaje`,{method:'POST',body:{texto:text.value}});text.value='';await openThread(id);}catch(e){message(e.message);}},'button primary');const box=node('div',undefined,'reply-box');box.append(text,send);detail.append(box);}
    catch(error){message(error.message);}
  }
  async function refreshListings(silent=false){
    if(!has('moderar_publicaciones'))return;
    try{const data=await api('/crm/publicaciones/pendientes');const list=$('#listing-review-list');list.replaceChildren(...(data.items||[]).map(item=>{const b=node('button',undefined,`case-row${state.selectedListing===item.id?' selected':''}`);b.type='button';b.append(node('strong',`#${item.id} · ${item.title}`),node('small',`${item.type} · ${item.city||'Ubicación por confirmar'} · ${item.plan}`),node('span',`${item.image_count} imagen${item.image_count===1?'':'es'}`,'badge'));b.addEventListener('click',()=>openListing(item.id));return b;}));if(!data.items?.length)list.append(node('p','No hay publicaciones pendientes de revisión.','empty'));}
    catch(error){if(!silent)message(error.message);}
  }
  async function openListing(id){
    try{state.selectedListing=id;const data=await api('/crm/publicaciones/pendientes');const item=(data.items||[]).find(x=>x.id===id);if(!item)return;const detail=$('#listing-review-detail');detail.replaceChildren(node('h2',item.title),node('p',`${item.type} · ${item.category} · ${item.city||'Ubicación por confirmar'} · Plan ${item.plan}`,'detail-meta'));if(item.description)detail.append(node('p',item.description));detail.append(node('p',`Precio: ${item.price_label||'Consultar'} · Código de cuenta: ${item.cuenta_codigo}`,'muted'));const gallery=node('div',undefined,'review-gallery');state.imageUrls.forEach(url=>URL.revokeObjectURL(url));state.imageUrls=[];for(let n=1;n<=Number(item.image_count||0);n++){const response=await fetch(`${apiBase}/crm/publicaciones/${id}/imagen/${n}`,{headers:{Authorization:`Bearer ${state.token}`}});if(!response.ok)continue;const url=URL.createObjectURL(await response.blob());state.imageUrls.push(url);const image=node('img');image.src=url;image.alt=`Foto ${n} de ${item.title}`;gallery.append(image);}if(gallery.childElementCount)detail.append(gallery);else detail.append(node('p','Esta publicación no tiene fotos para mostrar.','muted'));const reason=node('textarea');reason.maxLength=500;reason.placeholder='Motivo si la rechazas (requerido para rechazar).';const actions=node('div',undefined,'inline');actions.append(button('Aprobar publicación',async()=>{try{await api(`/crm/publicaciones/${id}/decision`,{method:'POST',body:{decision:'aprobar'}});state.selectedListing=null;await refreshListings();detail.replaceChildren(node('p','Publicación aprobada. Ya puede aparecer en las vitrinas.','empty'));}catch(e){message(e.message);}},'button primary'));actions.append(button('Rechazar',async()=>{if(!reason.value.trim()){reason.focus();message('Escribe el motivo del rechazo.');return;}try{await api(`/crm/publicaciones/${id}/decision`,{method:'POST',body:{decision:'rechazar',motivo:reason.value}});state.selectedListing=null;await refreshListings();detail.replaceChildren(node('p','Publicación rechazada y registrada.','empty'));}catch(e){message(e.message);}},'button subtle'));detail.append(reason,actions);}
    catch(error){message(error.message);}
  }
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));message('Verificando acceso…',$('#login-message'));try{const result=await api('/crm/login',{method:'POST',body:data});state.token=result.token;sessionStorage.setItem(tokenKey,state.token);const me=await api('/crm/me');showApp(me.usuario,me.permisos||[]);}catch(error){message(error.message,$('#login-message'));}});
  $('#logout').addEventListener('click',async()=>{try{await api('/crm/logout',{method:'POST',body:{}});}catch(_){}clearInterval(state.timer);state.token='';sessionStorage.removeItem(tokenKey);$('#crm-app').hidden=true;$('#login-card').hidden=false;});
  $('#staff-status').addEventListener('change',async e=>{try{const r=await api('/crm/estado',{method:'POST',body:{estado:e.target.value}});state.user=r.usuario;message(`Estado actualizado: ${statusName[r.usuario.estado]||r.usuario.estado}.`);await refreshDashboard();await refreshTeam();}catch(error){message(error.message);}});
  $$('#tabs [data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
  $$('[data-open-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.openTab)));
  $('#case-filter').addEventListener('change',()=>refreshCases());$('#refresh-team').addEventListener('click',refreshTeam);$('#refresh-inbox').addEventListener('click',refreshInbox);
  $('#refresh-listings').addEventListener('click',()=>refreshListings());
  $('#create-user-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));if(d.telegram_id&&!/^\d+$/.test(d.telegram_id)){message('El Telegram ID debe contener solo números.',$('#create-user-message'));return;}try{await api('/crm/usuarios',{method:'POST',body:{...d,telegram_id:d.telegram_id?Number(d.telegram_id):null}});e.currentTarget.reset();message('Usuario creado correctamente.',$('#create-user-message'));refreshUsers();}catch(error){message(error.message,$('#create-user-message'));}});
  $('#permission-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));try{await api('/crm/permisos',{method:'PUT',body:{...d,permitido:d.permitido==='true'}});message('Permiso guardado.',$('#permission-message'));await refreshPermissions();}catch(error){message(error.message,$('#permission-message'));}});
  restore();
})();
