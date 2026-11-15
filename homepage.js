(() => {
  'use strict';
  const config = window.CIRCULA_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const $ = (s) => document.querySelector(s);
  const state = { vip: [], items: [], vipIndex: 0, itemIndex: 0, vipTimer: null, itemTimer: null };
  const demo = [
    { id:'demo-premium-bici', title:'Bicicleta de montaña · ejemplo', type:'Producto', category:'Movilidad', city:'Bogotá', description:'Publicación de muestra para ilustrar la vitrina VIP.', price:'$600.000 COP', plan:'Premium', subscription_active:true, vip_eligible:true, image_emoji:'🚲', demo:true },
    { id:'demo-medio-servicio', title:'Asesoría virtual · ejemplo', type:'Servicio', category:'Asistencia virtual', city:'Medellín', description:'Ejemplo de un servicio intangible publicado en CIRCULA.', price:'Consultar', plan:'Medio', subscription_active:true, vip_eligible:true, image_emoji:'🩺', demo:true },
    { id:'demo-inicial-inmueble', title:'Apartamento · ejemplo', type:'Inmueble', category:'Arriendo', city:'Cali', description:'Ejemplo de inmueble. No es una oferta disponible.', price:'Consultar', plan:'Inicial', subscription_active:true, vip_eligible:true, image_emoji:'🏠', demo:true },
    { id:'demo-producto', title:'Silla de escritorio · ejemplo', type:'Producto', category:'Hogar', city:'Bogotá', description:'Producto de muestra; no está publicado para venta.', price:'$180.000 COP', plan:'Gratis', image_emoji:'🪑', demo:true },
    { id:'demo-servicio', title:'Clases de inglés · ejemplo', type:'Servicio', category:'Educación', city:'Barranquilla', description:'Servicio de muestra para ver cómo rota el catálogo.', price:'Consultar', plan:'Gratis', image_emoji:'📚', demo:true },
    { id:'demo-inmueble', title:'Casa familiar · ejemplo', type:'Inmueble', category:'Venta', city:'Bucaramanga', description:'Inmueble de muestra; no es una publicación real.', price:'Consultar', plan:'Gratis', image_emoji:'🏡', demo:true }
  ];
  const planPriority = { Premium: 3, Medio: 2, Inicial: 1, Gratis: 0 };

  async function request(path, options = {}) {
    if (!apiBase) throw new Error('El servidor común de CIRCULA todavía no está configurado.');
    const url = new URL(apiBase, location.href);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('El servidor de CIRCULA debe usar HTTPS.');
    const token = sessionStorage.getItem('circula_access_token');
    const isForm = options.body instanceof FormData;
    const headers = { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) };
    const response = await fetch(`${apiBase}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.message || `No se pudo completar (${response.status}).`);
    return body;
  }
  function safeText(value, fallback = '') { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
  function normalized(item) {
    const plan = safeText(item.plan || item.plan_name || item.plan_usuario, 'Gratis');
    const active = item.subscription_active === true || item.suscripcion_activa === true || ['activo','active','vigente'].includes(String(item.subscription_status || item.estado_suscripcion || '').toLowerCase());
    const eligible = item.vip_eligible === true || item.prioridad_vip === true || (active && (planPriority[plan] || 0) > 0);
    return {
      id: item.id ?? item.producto_id ?? item.codigo ?? '', title: safeText(item.title || item.titulo || item.producto || item.nombre, 'Publicación CIRCULA'),
      type: safeText(item.type || item.tipo || item.category_type, 'Producto'), category: safeText(item.category || item.categoria?.nombre || item.categoria || item.tipo_negocio, ''),
      city: safeText(item.city || item.ciudad, ''), description: safeText(item.description || item.descripcion, ''),
      price: safeText(item.price_label || item.precio_texto, item.price_cop || item.precio_cop ? `$${Number(item.price_cop || item.precio_cop).toLocaleString('es-CO')} COP` : 'Consultar'),
      minimumOrder: Number(item.pedido_minimo_cop || item.minimum_order_cop || 0),
      delivery: (item.domicilio_cobro || item.delivery_charged) === 'incluido' ? 'Domicilio incluido' : `Domicilio: $${Number(item.domicilio_valor_cop || item.delivery_fee_cop || 0).toLocaleString('es-CO')} COP`,
      rating: item.calificacion ?? item.rating ?? null,
      ratingCount: Number(item.num_calificaciones || item.rating_count || 0),
      plan, active, vip: eligible, image: safeText(item.public_image_url || item.image_url || item.imagen_publica, ''),
      emoji: safeText(item.image_emoji || item.emoji, ({ Producto:'🛍️', Inmueble:'🏡', Servicio:'✨', Restaurante:'🍽️' }[safeText(item.type || item.tipo, 'Producto')] || '🛍️')),
      chatAction: safeText(item.chat_action, ''),
      demo: item.demo === true || item.is_demo === true
    };
  }
  function tier(a, b) { return (planPriority[b.plan] || 0) - (planPriority[a.plan] || 0); }
  function safeImage(raw) {
    if (!raw) return '';
    try { const image = new URL(raw, apiBase || location.origin), apiOrigin = apiBase ? new URL(apiBase, location.href).origin : ''; return image.protocol === 'https:' || image.origin === location.origin || image.origin === apiOrigin ? image.href : ''; }
    catch (_) { return ''; }
  }
  function safeTextNode(tag, className, text) { const el=document.createElement(tag); if(className)el.className=className; el.textContent=text; return el; }
  function art(item, className) {
    const box=safeTextNode('div',className,'');
    const src=safeImage(item.image);
    if(src){const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';img.onerror=()=>{img.remove();box.append(safeTextNode('span','item-emoji',item.emoji));};box.append(img);}
    else box.append(safeTextNode('span','item-emoji',item.emoji));
    return box;
  }
  function renderVip() {
    const root=$('#vip-feature'), count=$('#vip-count');
    if(!state.vip.length){root.classList.add('vip-empty');root.replaceChildren(art({emoji:'✦'},'vip-art'));const copy=document.createElement('div');copy.className='vip-copy';const demoMode=config.demoMode&&!apiBase;copy.append(safeTextNode('span','demo-badge',demoMode?'MUESTRA':'VIP'),safeTextNode('h4', '', demoMode?'La vitrina VIP está en demostración':'Aún no hay publicaciones VIP'),safeTextNode('p','',demoMode?'Los anuncios ficticios muestran cómo destacarán los planes activos.':'El catálogo conectado todavía no entrega la prioridad VIP de los planes.'));root.append(copy);count.textContent='0 / 0';return;}
    root.classList.remove('vip-empty');
    const item=state.vip[state.vipIndex%state.vip.length];
    root.replaceChildren(art(item,'vip-art'));
    const copy=document.createElement('div');copy.className='vip-copy';
    copy.append(safeTextNode('span','vip-product-badge',item.demo?'EJEMPLO · VIP '+item.plan.toUpperCase():'VIP · '+item.plan.toUpperCase()),safeTextNode('h4','',item.title));
    const line=[item.type,item.category,item.city].filter(Boolean).join(' · '); if(line)copy.append(safeTextNode('p','vip-meta',line));
    if(item.description)copy.append(safeTextNode('p','vip-description',item.description));
    copy.append(safeTextNode('strong','vip-price',item.price));
    if(item.type==='Producto'&&!item.demo){copy.append(safeTextNode('p','vip-meta',`Pedido mínimo: $${item.minimumOrder.toLocaleString('es-CO')} COP · ${item.delivery}`));copy.append(safeTextNode('p','vip-meta',item.rating!=null&&item.ratingCount?`⭐ ${item.rating} · ${item.ratingCount} calificaciones`:'Aún sin calificaciones'));copy.append(safeTextNode('small','vip-description','El pago se hace directamente a la tienda; CIRCULA no cobra comisión por la venta.'));}
    const contact=document.createElement('button');contact.type='button';contact.className='button primary market-contact';contact.dataset.itemTitle=item.title;contact.disabled=item.demo;contact.textContent=item.demo?'Ejemplo de prioridad':'Consultar en CIRCULA';copy.append(contact);
    root.append(copy);count.textContent=`${state.vipIndex%state.vip.length+1} / ${state.vip.length}`;
  }
  function itemCard(item) {
    const card=document.createElement('article');card.className='market-card'+(item.demo?' is-demo':'');
    card.append(art(item,'market-art'));
    const body=document.createElement('div');body.className='market-card-body';
    const tag=item.demo?'EJEMPLO':item.type.toUpperCase();body.append(safeTextNode('span','market-type',tag));
    if(item.vip && !item.demo)body.append(safeTextNode('span','market-plan-badge',item.plan==='Premium'?'VIP PREMIUM':`DESTACADO ${item.plan.toUpperCase()}`));
    body.append(safeTextNode('h4','',item.title));
    const meta=[item.category,item.city].filter(Boolean).join(' · ');if(meta)body.append(safeTextNode('p','market-meta',meta));
    body.append(safeTextNode('strong','market-price',item.price));
    if(item.type==='Producto'&&!item.demo){body.append(safeTextNode('p','market-meta',`Pedido mínimo: $${item.minimumOrder.toLocaleString('es-CO')} COP · ${item.delivery}`));body.append(safeTextNode('p','market-meta',item.rating!=null&&item.ratingCount?`⭐ ${item.rating} · ${item.ratingCount} calificaciones`:'Aún sin calificaciones'));body.append(safeTextNode('small','demo-copy','El pago se hace directamente a la tienda; CIRCULA no cobra comisión por la venta.'));}
    if(item.demo)body.append(safeTextNode('small','demo-copy','Ejemplo demostrativo · no disponible'));
    else {const button=document.createElement('button');button.type='button';button.className='market-contact';button.dataset.itemTitle=item.title;if(item.chatAction)button.dataset.chatAction=item.chatAction;button.textContent='Consultar →';body.append(button);}
    card.append(body);return card;
  }
  function renderMarket() {
    const grid=$('#market-grid'), count=$('#market-count');grid.replaceChildren();
    if(!state.items.length){$('#market-status').textContent='Aún no hay publicaciones para mostrar.';count.textContent='0 / 0';return;}
    const visible=Math.min(3,state.items.length);
    for(let n=0;n<visible;n++)grid.append(itemCard(state.items[(state.itemIndex+n)%state.items.length]));
    count.textContent=`${state.itemIndex%state.items.length+1} / ${state.items.length}`;
    $('#market-status').textContent=state.items.some(i=>i.demo)?'Ejemplos demostrativos · se reemplazarán al conectar las publicaciones aprobadas.':'Las publicaciones visibles son anuncios activos aprobados por CIRCULA.';
  }
  async function loadHomeItems() {
    if(!apiBase){
      if(config.demoMode){state.vip=demo.filter(i=>i.vip).map(normalized).sort(tier);state.items=demo.map(normalized);$('#demo-note').hidden=false;}
      else {state.vip=[];state.items=[];$('#market-status').textContent='Conecta el servidor de CIRCULA para ver publicaciones.';}
      renderVip();renderMarket();return;
    }
    $('#market-status').textContent='Cargando productos de tiendas y restaurantes aprobados…';
    try {
      const [storeResult,restaurantResult]=await Promise.all([request('/tiendas'),request('/restaurantes')]);
      const stores=(storeResult.items||[]).map(item=>normalized({...item,type:'Producto',category:item.tipo_negocio||'Tienda',public_image_url:`${apiBase}/tiendas/productos/${encodeURIComponent(item.producto_id)}/foto`,image_emoji:'🛒',chat_action:item.chat_action||item.accion_chat||''}));
      const restaurants=(restaurantResult.items||[]).map(item=>normalized({...item,type:'Restaurante',public_image_url:item.logo_url,image_emoji:'🍽️'}));
      const all=[...stores,...restaurants];
      state.vip=all.filter(item=>item.vip).sort(tier);state.items=all;
      $('#demo-note').hidden=true;renderVip();renderMarket();startRotation();
      $('#market-status').textContent=all.length?'Por ahora la vitrina usa tiendas y restaurantes aprobados. Los anuncios generales de productos, inmuebles y servicios necesitan sus rutas de catálogo.':'Aún no hay productos de tiendas ni restaurantes publicados.';
    } catch(error){state.vip=[];state.items=[];renderVip();renderMarket();$('#market-status').textContent=`No pudimos cargar la vitrina: ${error.message}`;}
  }
  function startRotation(){clearInterval(state.vipTimer);clearInterval(state.itemTimer);if(state.vip.length>1)state.vipTimer=setInterval(()=>{state.vipIndex=(state.vipIndex+1)%state.vip.length;renderVip();},8500);if(state.items.length>1)state.itemTimer=setInterval(()=>{state.itemIndex=(state.itemIndex+1)%state.items.length;renderMarket();},7000);}
  $('#vip-prev').addEventListener('click',()=>{if(!state.vip.length)return;state.vipIndex=(state.vipIndex-1+state.vip.length)%state.vip.length;renderVip();});
  $('#vip-next').addEventListener('click',()=>{if(!state.vip.length)return;state.vipIndex=(state.vipIndex+1)%state.vip.length;renderVip();});
  $('#market-prev').addEventListener('click',()=>{if(!state.items.length)return;state.itemIndex=(state.itemIndex-1+state.items.length)%state.items.length;renderMarket();});
  $('#market-next').addEventListener('click',()=>{if(!state.items.length)return;state.itemIndex=(state.itemIndex+1)%state.items.length;renderMarket();});
  document.addEventListener('click',event=>{
    const contact=event.target.closest('.market-contact');if(contact&&!contact.disabled){
      if(contact.dataset.chatAction){window.dispatchEvent(new CustomEvent('circula:chat-action',{detail:{action:contact.dataset.chatAction,label:`Consultar por ${contact.dataset.itemTitle||'este producto'}`}}));return;}
      const nav=document.querySelector('[data-view="asistente"]');nav?.click();setTimeout(()=>{const box=$('#chat-text');if(box){box.value=`Hola, quiero consultar por: ${contact.dataset.itemTitle}`;box.focus();}},200);
    }
  });

  async function payment(plan, provider) {
    window.dispatchEvent(new CustomEvent('circula:chat-prompt',{detail:{prompt:`Quiero contratar el plan ${plan} y consultar cómo pagar por ${provider}.`}}));
  }
  document.querySelectorAll('[data-pay-plan]').forEach(button=>button.addEventListener('click',()=>payment(button.dataset.payPlan,button.dataset.provider)));

  function isCurator(profile){const role=String(profile?.rol||profile?.role||'').toLowerCase();return ['manager_general','admin_principal'].includes(role)||profile?.permissions?.can_curate_homepage===true;}
  function applyProfile(profile){$('#admin-curate').hidden=true;$('#admin-curation-panel').hidden=true;}
  window.addEventListener('circula:profile-ready',event=>applyProfile(event.detail||{}));
  window.addEventListener('circula:logout',()=>applyProfile({}));
  async function loadAdminListings(){
    const host=$('#admin-listings');host.replaceChildren(safeTextNode('p','empty-state','Cargando publicaciones aprobadas…'));
    try{const result=await request('/marketplace/admin/listings');const items=result.items||[];host.replaceChildren();if(!items.length){host.append(safeTextNode('p','empty-state','No hay publicaciones aprobadas para curar.'));return;}
      items.forEach(item=>{const row=document.createElement('article');row.className='admin-listing';const title=safeTextNode('strong','',item.title||item.nombre||'Publicación');const info=safeTextNode('span','',`${item.type||item.tipo||'Anuncio'} · ${item.city||item.ciudad||''} · Plan ${item.plan||'Gratis'}`);const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=Boolean(item.homepage_featured||item.destacada_portada);checkbox.dataset.id=String(item.id);label.append(checkbox,document.createTextNode(' Mostrar en la portada'));const save=document.createElement('button');save.type='button';save.className='button soft';save.textContent='Guardar';save.addEventListener('click',async()=>{save.disabled=true;try{await request(`/marketplace/admin/listings/${encodeURIComponent(item.id)}/homepage`,{method:'PATCH',body:JSON.stringify({featured:checkbox.checked})});save.textContent='Guardado ✓';loadHomeItems();}catch(error){save.textContent='Error';notifyAdmin(error.message);}finally{save.disabled=false;setTimeout(()=>save.textContent='Guardar',1800);}});row.append(title,info,label,save);host.append(row);});
    }catch(error){host.replaceChildren(safeTextNode('p','empty-state',`No se pudieron cargar las publicaciones: ${error.message}`));}
  }
  function notifyAdmin(message){const note=$('#admin-status');note.textContent=message;}
  $('#admin-curate').addEventListener('click',()=>{if(!sessionStorage.getItem('circula_access_token')){document.querySelector('[data-view="cuenta"]')?.click();return;}$('#admin-curation-panel').hidden=false;$('#admin-curation-panel').scrollIntoView({behavior:'smooth'});loadAdminListings();});
  $('#admin-close').addEventListener('click',()=>$('#admin-curation-panel').hidden=true);
  loadHomeItems();
  const savedToken=sessionStorage.getItem('circula_access_token');
  if(savedToken&&apiBase)request('/app/me',{headers:{Authorization:`Bearer ${savedToken}`}}).then(result=>applyProfile(result.user||result)).catch(()=>applyProfile({}));
})();
