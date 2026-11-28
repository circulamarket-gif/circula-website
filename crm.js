(() => {
  'use strict';
  const apiBase = String(window.CIRCULA_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
  const $ = (s, root = document) => root.querySelector(s);
  const tokenKey = 'circula_crm_token';
  const state = { token: sessionStorage.getItem(tokenKey) || '', user: null, permissions: new Set(), cases: [], selectedCase: null, team: [], selectedThread: null, selectedListing: null, imageUrls: [], timer: null };
  const safe = (x) => String(x ?? '');
  const roleName = { superadministrador:'Superadministrador', manager_general:'Manager general', administrador:'Administrador', coordinador:'Coordinador', broker:'Broker', tecnico_inspector:'Técnico inspector', logistica:'Logística' };
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
  let _msgTimer;
  function message(text, target = $('#global-message')) { target.textContent = text || ''; if (target.id === 'global-message') { clearTimeout(_msgTimer); if (text) _msgTimer = setTimeout(() => { target.textContent = ''; }, 6000); } }
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
    if (name === 'embajadores') refreshEmb();
    if (name === 'moderacion') refreshListings();
    if (name === 'salas') refreshSalas();
  }
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  function showApp(user, permissions = []) {
    state.user = user; state.permissions = new Set(permissions);
    $('#login-card').hidden = true; $('#crm-app').hidden = false;
    $('#staff-name').textContent = user.nombre; $('#staff-role').textContent = roleName[user.rol] || user.rol;
    $('#welcome-name').textContent = user.nombre.split(' ')[0]; $('#staff-status').value = user.estado || 'offline';
    $$('#tabs [data-permission]').forEach(b => b.hidden = !has(b.dataset.permission));
    $$('#tabs [data-any]').forEach(b => b.hidden = !b.dataset.any.split(',').some(has));
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
        if (!$('#tab-salas').hidden && sl.sub === 'salas') listSalas();
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
    try{
      const data=await api('/crm/usuarios');
      $('#user-rows').replaceChildren(...(data.items||[]).map(p=>{
        const tr=node('tr');
        const td=node('td');const b=button(p.nombre,()=>openDrawer(p.id),'link-button');td.append(b);
        if(p.excepciones)td.append(node('small',` · ${p.excepciones} excepción(es)`));
        tr.append(td,node('td',p.email||'—'),node('td',roleName[p.rol]||p.rol),node('td',p.activo===false?'Suspendido':(statusName[p.estado]||p.estado||'—')));
        const acc=node('td');
        if(data.puede_suspender&&p.activo!==false&&p.editable)acc.append(button('Suspender',async()=>{if(!confirm('¿Suspender a '+p.nombre+'?'))return;try{await api(`/crm/usuarios/${p.id}/desactivar`,{method:'POST',body:{}});refreshUsers();}catch(e){message(e.message);}}));
        tr.append(acc);return tr;
      }));
      $('#audit-panel').hidden=!data.puede_auditar;
      if(data.puede_auditar)refreshAudit();
    }catch(error){message(error.message);}
  }
  async function refreshAudit(){
    try{const d=await api('/crm/auditoria?limite=40');$('#audit-list').replaceChildren(...(d.items||[]).map(a=>{const r=node('div',undefined,'case-row');r.append(node('strong',`${a.actor_nombre} → ${a.objetivo_nombre}`),node('small',`${a.accion}${a.permiso?' · '+a.permiso:''} · ${a.fecha}`));return r;}));}catch(e){message(e.message);}
  }
  let drawerUser=null;
  function closeDrawer(){$('#drawer').hidden=true;$('#drawer-bg').hidden=true;drawerUser=null;}
  async function openDrawer(id){
    try{drawerUser=id;const d=await api(`/crm/usuarios/${id}/permisos`);renderDrawer(d);$('#drawer').hidden=false;$('#drawer-bg').hidden=false;}catch(e){message(e.message);}
  }
  function renderDrawer(d){
    $('#drawer-name').textContent=d.usuario.nombre;
    $('#drawer-sub').textContent=`${d.usuario.email||''} · ${roleName[d.usuario.rol]||d.usuario.rol}`;
    $('#drawer-note').textContent=d.editable?'🔒 = obligatorio del rol (no se puede quitar). Lo demás lo puedes ajustar; cada cambio queda en la auditoría.':(d.motivo||'Solo lectura.');
    $('#drawer-restore').hidden=!d.editable;
    const datos=node('section',undefined,'perm-module');datos.append(node('h3','Datos de contacto'));
    const campos=[['nombre','Nombre',d.usuario.nombre],['email','Correo',d.usuario.email],['telegram_id','ID de Telegram',d.usuario.telegram_id],['whatsapp','WhatsApp (solo números, con código de país)',d.usuario.whatsapp]];
    const inputs={};
    campos.forEach(([k,t,v])=>{const l=node('label',undefined,'field');l.append(node('span',t));const i=node('input');i.value=v==null?'':v;i.disabled=!d.editable_datos;inputs[k]=i;l.append(i);datos.append(l);});
    if(d.editable_datos)datos.append(button('Guardar datos',async()=>{try{const body={};Object.keys(inputs).forEach(k=>body[k]=inputs[k].value);await api(`/crm/usuarios/${drawerUser}`,{method:'POST',body});message('Datos guardados.');openDrawer(drawerUser);refreshUsers();}catch(e){message(e.message);}},'button primary'));
    $('#drawer-body').replaceChildren(datos,...d.modulos.map(m=>{
      const box=node('section',undefined,'perm-module');box.append(node('h3',m.titulo));
      m.permisos.forEach(p=>{
        const row=node('label',undefined,'perm-row'+(p.personalizado?' custom':''));
        const cb=node('input');cb.type='checkbox';cb.checked=!!p.concedido;
        cb.disabled=!d.editable||p.obligatorio||p.reservado;
        cb.addEventListener('change',async()=>{
          cb.disabled=true;
          try{const r=await api(`/crm/usuarios/${drawerUser}/permisos`,{method:'PUT',body:{permiso:p.slug,concedido:cb.checked}});renderDrawer(r);refreshUsers();}
          catch(e){cb.checked=!cb.checked;cb.disabled=false;message(e.message);}
        });
        const txt=node('span');txt.append(node('strong',(p.obligatorio?'🔒 ':'')+p.descripcion),node('small',p.slug+(p.personalizado?' · personalizado':'')));
        row.append(cb,txt);box.append(row);
      });
      return box;
    }));
  }
  $('#drawer-close').addEventListener('click',closeDrawer);$('#drawer-bg').addEventListener('click',closeDrawer);
  $('#drawer-restore').addEventListener('click',async()=>{if(!drawerUser||!confirm('¿Volver a los permisos por defecto del rol?'))return;try{renderDrawer(await api(`/crm/usuarios/${drawerUser}/permisos/restaurar`,{method:'POST',body:{}}));refreshUsers();}catch(e){message(e.message);}});
  // ---------------- Embajadores
  const money=n=>'$'+Math.round(Number(n||0)).toLocaleString('es-CO');
  async function refreshEmb(){
    try{
      const d=await api('/crm/embajadores');
      $('#emb-rows').replaceChildren(...(d.items||[]).map(e=>{
        const tr=node('tr');
        [e.codigo,e.nombre||'—',e.estado,e.contrato_firmado?('Firmado '+(e.contrato_fecha||'').slice(0,10)):'Sin firmar',(e.datos_faltantes||[]).join(', ')||'—',e.vinculados,e.ventas_mes].forEach(v=>tr.append(node('td',v)));
        const acc=node('td');
        if(e.estado==='activo')acc.append(button('Suspender',()=>embEstado(e.codigo,'suspendido')));
        else acc.append(button(e.estado==='suspendido'?'Reactivar':'Activar',()=>embEstado(e.codigo,'activo')));
        tr.append(acc);return tr;
      }));
      if(!$('#liq-periodo').value){const n=new Date();n.setMonth(n.getMonth()-1);$('#liq-periodo').value=n.toISOString().slice(0,7);}
      $('#liq-cerrar').hidden=state.user?.rol!=='superadministrador';
      $('#emb-config-panel').hidden=state.user?.rol!=='superadministrador';
      if(state.user?.rol==='superadministrador')loadEmbConfig();
    }catch(e){message(e.message);}
  }
  async function embEstado(codigo,estado){try{await api(`/crm/embajadores/${codigo}/estado`,{method:'POST',body:{estado}});message('Estado actualizado.');refreshEmb();}catch(e){message(e.message);}}
  async function verLiq(cerrar){
    const periodo=$('#liq-periodo').value.trim();
    try{
      const r=cerrar?await api('/crm/embajadores/liquidar',{method:'POST',body:{periodo}}):await api(`/crm/embajadores/liquidacion?periodo=${encodeURIComponent(periodo)}`);
      $('#liq-message').textContent=`Periodo ${r.periodo} · Fecha de pago: ${r.fecha_pago} · Total bruto ${money(r.total_bruto)} · Total neto ${money(r.total_neto)}${r.aviso?' · '+r.aviso:''}${r.exportado_en?' · Cerrado y exportado.':''}`;
      const t=node('table');t.innerHTML='<thead><tr><th>Embajador</th><th>Bruto</th><th>Retefuente</th><th>Reteica</th><th>Neto</th><th>Pausado</th><th>Estado</th></tr></thead>';
      const tb=node('tbody');(r.filas||[]).forEach(f=>{const tr=node('tr');[f.embajador_codigo||f.codigo,money(f.bruto_pagable),money(f.retefuente),money(f.reteica),money(f.neto),money(f.pausado),f.cerrada?'Cerrada':'Provisional'].forEach(v=>tr.append(node('td',v)));tb.append(tr);});
      t.append(tb);$('#liq-result').replaceChildren(t);
    }catch(e){$('#liq-message').textContent=e.message;}
  }
  async function loadEmbConfig(){
    try{const c=await api('/crm/embajadores/config');const box=$('#emb-config');box.replaceChildren(...Object.entries(c).map(([k,v])=>{const row=node('div',undefined,'inline');const inp=node('input');inp.value=v;row.append(node('code',k),inp,button('Guardar',async()=>{try{await api('/crm/embajadores/config',{method:'PUT',body:{clave:k,valor:inp.value}});message('Regla guardada.');}catch(e){message(e.message);}}));return row;}));}catch(e){message(e.message);}
  }
  $('#refresh-emb').addEventListener('click',refreshEmb);
  $('#liq-ver').addEventListener('click',()=>verLiq(false));
  $('#liq-cerrar').addEventListener('click',()=>{if(confirm('Cerrar el mes es definitivo. ¿Continuar?'))verLiq(true);});
  $('#emb-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));try{const r=await api('/crm/embajadores',{method:'POST',body:d});e.currentTarget.reset();message(`Creado. Queda PENDIENTE hasta que complete datos y firme su contrato. Su enlace de referido: ${r.ref}`,$('#emb-message'));refreshEmb();}catch(err){message(err.message,$('#emb-message'));}});
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

  // ---------------- Salas y coincidencias + asesor virtual
  const sl={sala:null,sub:'salas'};
  const cap=s=>String(s||'').replace(/_/g,' ');
  async function refreshSalas(){
    try{
      const r=await api('/crm/salas/resumen');
      const bx=$('#salas-resumen');const sa=r.salas||{},co=r.coincidencias||{};
      const card=(t,v)=>{const a=node('article');a.append(node('small',t),node('strong',String(v)));return a;};
      bx.replaceChildren(card('Salas esperando asesor',sa.Esperando_broker||0),card('Salas activas',sa.Activa||0),card('Coincidencias nuevas',co.Nueva||0),card(r.humanos_conectados?'Asesores conectados':'Nadie conectado',r.broker_virtual_activo?'Virtual activo':'Virtual apagado'));
      $('#bv-estado').textContent=r.broker_virtual_activo?'Estado: ENCENDIDO. '+(r.humanos_conectados?'Hay personas conectadas: el asesor virtual está en reposo.':'No hay personas conectadas: el asesor virtual está atendiendo.'):'Estado: APAGADO (variable CIRCULA_BROKER_VIRTUAL_ACTIVO=0).';
    }catch(e){message(e.message);}
    if(sl.sub==='salas')await listSalas();else if(sl.sub==='coinc')await listCoinc();else await listBv();
  }
  async function listSalas(){
    try{
      const d=await api('/crm/salas'+($('#salas-cerradas').checked?'?todas=1':''));
      const box=$('#salas-list');
      if(!d.items.length){box.replaceChildren(node('p','No hay salas.','empty'));return;}
      box.replaceChildren(...d.items.map(s=>{const b=node('button',undefined,'case-row'+(sl.sala===s.id?' selected':''));b.type='button';
        b.append(node('strong','Sala #'+s.id+' · '+s.titulo),node('small',(s.estado==='Esperando_broker'?'Esperando asesor':s.estado)+' · '+(s.broker||'sin asesor')));
        if(s.atiende_virtual)b.append(node('span','🤖 atiende el asesor virtual','badge'));
        if(s.requiere_humano)b.append(node('span','⚠️ requiere a una persona: '+s.motivo_escalada,'badge'));
        b.addEventListener('click',()=>openSala(s.id));return b;}));
    }catch(e){message(e.message);}
  }
  async function openSala(id){
    sl.sala=id;
    try{
      const d=await api('/crm/salas/'+id);const s=d.sala;const box=$('#sala-detail');
      const head=node('div');head.append(node('h2','Sala #'+s.id+' · '+s.titulo),node('p',s.estado+(s.broker?' · Asesor: '+s.broker:'')+(s.resultado?' · '+s.resultado:''),'detail-meta'));
      if(s.requiere_humano)head.append(node('p','⚠️ El asesor virtual pidió a una persona: '+s.motivo_escalada,'notice'));
      const acts=node('div',undefined,'inline');
      if(s.estado!=='Cerrada'){
        if(has('tomar_casos')&&(!s.broker_id||s.atiende_virtual))acts.append(button(s.atiende_virtual?'Quitarle la sala al asesor virtual':'Tomar sala',async()=>{try{await api(`/crm/salas/${id}/tomar`,{method:'POST',body:{}});message('Sala tomada.');openSala(id);listSalas();}catch(e){message(e.message);}},'button primary'));
        if(has('cerrar_casos')&&s.broker_id){
          acts.append(button('Cerrar con acuerdo',()=>cerrarSala(id,'Acuerdo'),'button primary'),button('Cerrar sin acuerdo',()=>cerrarSala(id,'Sin_acuerdo')));}
      }
      const cols=node('div',undefined,'form-grid');
      cols.append(hiloCol(s,'comprador','Comprador',d.comprador),hiloCol(s,'vendedor','Vendedor',d.vendedor));
      box.replaceChildren(head,acts,cols);
    }catch(e){message(e.message);}
  }
  async function cerrarSala(id,resultado){const motivo=prompt(resultado==='Acuerdo'?'Nota del cierre (opcional):':'Motivo (opcional):')||'';if(!confirm('¿Cerrar la sala #'+id+' ('+cap(resultado)+')? Se avisa a las dos partes.'))return;try{await api(`/crm/salas/${id}/cerrar`,{method:'POST',body:{resultado,motivo}});message('Sala cerrada.');openSala(id);listSalas();}catch(e){message(e.message);}}
  function hiloCol(s,hilo,titulo,msgs){
    const col=node('div');col.append(node('h3',titulo+' ('+s[hilo]+')'));
    const ms=node('div',undefined,'messages');
    msgs.forEach(m=>{const el=node('div',m.texto,'message'+(m.autor==='broker'?' staff':''));const who=m.autor==='broker'?(m.virtual?'🤖 asesor virtual':'asesor'):cap(m.autor);el.append(node('small',who+' · '+(m.fecha||'')));
      if(m.autor!=='broker'&&m.autor!=='sistema'&&s.estado!=='Cerrada'&&has('responder_casos')&&s.broker_id)el.append(button('Pasar a la otra parte',async()=>{try{await api(`/crm/salas/${s.id}/retransmitir`,{method:'POST',body:{mensaje_id:m.id}});message('Enviado a la otra parte.');openSala(s.id);}catch(e){message(e.message);}}));
      ms.append(el);});
    col.append(ms);
    if(s.estado!=='Cerrada'&&has('responder_casos')&&s.broker_id){
      const sug=node('div',undefined,'case-list');
      const ta=node('textarea');ta.placeholder='Escribe solo al '+hilo+'…';ta.rows=3;ta.maxLength=1500;
      let rid=null;
      col.append(button('💡 Sugerencias del asesor virtual',async()=>{try{const r=await api(`/crm/salas/${s.id}/sugerencias?hilo=${hilo}`);sug.replaceChildren(node('small','Intención detectada: '+cap(r.intencion||'—')),...r.sugerencias.map(x=>{const b=node('button',x.texto,'case-row');b.type='button';b.append(node('span',cap(x.categoria)+' · '+x.fuente,'badge'));b.addEventListener('click',()=>{ta.value=x.texto;rid=x.id;});const ok=button('👍 útil',async e=>{e.stopPropagation();try{await api('/crm/broker-virtual/biblioteca/'+x.id+'/util',{method:'POST',body:{}});message('Gracias, queda marcada como útil.');}catch(er){message(er.message);}});const w=node('div');w.append(b);if(x.id)w.append(ok);return w;}),...(r.apoyos||[]).map(x=>{const b=node('button',x.texto,'case-row');b.type='button';b.append(node('span','apoyo de cierre','badge'));b.addEventListener('click',()=>{ta.value=x.texto;rid=null;});return b;}));}catch(e){message(e.message);}}),sug);
      col.append(ta,button('Enviar al '+hilo,async()=>{if(!ta.value.trim())return;try{await api(`/crm/salas/${s.id}/mensaje`,{method:'POST',body:{hilo,texto:ta.value,respuesta_id:rid}});message('Enviado.');openSala(s.id);}catch(e){message(e.message);}},'button primary'));
    }
    return col;
  }
  async function listCoinc(){
    try{const d=await api('/crm/coincidencias?estado='+encodeURIComponent($('#coinc-estado').value));
      $('#coinc-rows').replaceChildren(...(d.items.length?d.items.map(c=>{const tr=node('tr');[c.id,c.busca,c.ofrece,c.ciudad||'—',Math.round(c.puntaje*100)/100,cap(c.estado),c.creado].forEach(v=>tr.append(node('td',String(v))));return tr;}):[(()=>{const tr=node('tr');const td=node('td','No hay coincidencias.','empty');td.colSpan=7;tr.append(td);return tr;})()]));
    }catch(e){message(e.message);}
  }
  async function listBv(){
    try{const d=await api('/crm/broker-virtual/biblioteca?estado='+encodeURIComponent($('#bv-filtro').value));
      $('#bv-form').hidden=!d.puede_editar;
      $('#bv-rows').replaceChildren(...(d.items.length?d.items.map(r=>{const tr=node('tr');[cap(r.categoria),r.situacion||'—',r.texto,r.fuente,r.usos,r.utiles].forEach(v=>tr.append(node('td',String(v))));
        const td=node('td');if(d.puede_editar){const set=async(estado)=>{try{await api('/crm/broker-virtual/biblioteca/'+r.id,{method:'PUT',body:{estado}});listBv();}catch(e){message(e.message);}};
          if(r.estado!=='aprobada')td.append(button('Aprobar',()=>set('aprobada'),'button primary'));if(r.estado!=='rechazada')td.append(button('Rechazar',()=>set('rechazada')));}
        tr.append(td);return tr;}):[(()=>{const tr=node('tr');const td=node('td','No hay respuestas en este estado.','empty');td.colSpan=7;tr.append(td);return tr;})()]));
    }catch(e){message(e.message);}
  }
  $('#refresh-salas').addEventListener('click',refreshSalas);
  $('#salas-cerradas').addEventListener('change',listSalas);
  $('#coinc-estado').addEventListener('change',listCoinc);
  $('#bv-filtro').addEventListener('change',listBv);
  $('#bv-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));try{await api('/crm/broker-virtual/biblioteca',{method:'POST',body:d});e.currentTarget.reset();message('Respuesta agregada.',$('#bv-msg'));listBv();}catch(er){message(er.message,$('#bv-msg'));}});
  $$('#salas-subtabs [data-sub]').forEach(b=>b.addEventListener('click',()=>{sl.sub=b.dataset.sub;$$('#salas-subtabs [data-sub]').forEach(x=>x.classList.toggle('selected',x===b));$('#sub-salas').hidden=sl.sub!=='salas';$('#sub-coinc').hidden=sl.sub!=='coinc';$('#sub-bv').hidden=sl.sub!=='bv';refreshSalas();}));
  restore();
})();
