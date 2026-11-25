(() => {
  'use strict';
  const cfg = window.CIRCULA_CONFIG || {};
  const base = String(cfg.apiBaseUrl || '').replace(/\/$/, '');
  const chatBase = String(cfg.chatApiBaseUrl || base).replace(/\/$/, '');
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const panel = $('#app-view');
  const views = ['menu-view', 'assistant-view', 'account-view', 'profile-view', 'subscription-view'];
  const state = { category: '', poll: null, token: null, sharedRestaurantId: '', sharedStoreId: '', sharedProductId: '', chatToken: sessionStorage.getItem('circula_chat_token'), chatLinked: sessionStorage.getItem('circula_chat_linked') === 'true', chatSessionPromise: null, chatBootstrapPromise: null, lastChatEventId: 0, chatRefreshing: false, chatSending: false, restaurantFilter: '', termsLoaded: false, termsLoading: false };
  let toastTimer;

  async function api(path, options = {}, root = base) {
    if (!root) throw new Error('Falta configurar la dirección del servidor de CIRCULA.');
    const apiUrl = new URL(root, window.location.href);
    if (apiUrl.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(apiUrl.hostname)) throw new Error('El servidor debe usar HTTPS para proteger tu contraseña y tus documentos.');
    let response;
    try { response = await fetch(`${root}${path}`, { ...options, headers: { ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(options.headers || {}) } }); }
    catch (_) { throw new Error('No pudimos conectarnos al servidor. Inténtalo más tarde.'); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.error || body.message || 'No se pudo completar la solicitud.'); error.status = response.status; throw error; }
    return body;
  }
  function notify(message) { const t=$('#toast'); t.textContent=message; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3600); }
  function publicShareUrl(params, page){
    try{
      const configured=String(cfg.publicSiteUrl||'').trim();
      const url=new URL(configured||location.href,location.href);
      if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return '';
      url.search='';
      Object.entries(params).forEach(([key,value])=>{if(value!==undefined&&value!==null&&String(value).trim())url.searchParams.set(key,String(value));});
      url.hash=page;
      return url.href;
    }catch(_){return '';}
  }
  function telegramStartUrl(payload){
    try{
      const url=new URL(String(cfg.telegramBotUrl||''));
      if(!['t.me','www.t.me','telegram.me','www.telegram.me'].includes(url.hostname)||url.protocol!=='https:')return '';
      url.searchParams.set('start',payload);
      return url.href;
    }catch(_){return '';}
  }
  function appendSharePanel(parent,{title,description,params,page,telegramPayload}){
    const box=document.createElement('section');box.className='circula-share-box';
    const heading=document.createElement('h3');heading.textContent=title;
    const note=document.createElement('p');note.textContent=description;
    box.append(heading,note);
    const webUrl=publicShareUrl(params,page);
    const botUrl=telegramStartUrl(telegramPayload);
    let appUrl='';try{const candidate=new URL(String(cfg.appLandingUrl||cfg.appDownloadUrl||''),location.href);if(candidate.protocol==='https:'||candidate.origin===location.origin)appUrl=candidate.href;}catch(_){}
    const actions=document.createElement('div');actions.className='circula-share-actions';
    const shareText=[title,webUrl,botUrl&&`Abrir CIRCULA en Telegram: ${botUrl}`,`Descubre productos, tiendas, restaurantes y servicios en CIRCULA.${appUrl?` Descarga la app: ${appUrl}`:''}`].filter(Boolean).join('\n\n');
    const copy=document.createElement('button');copy.type='button';copy.className='button soft';copy.textContent='Copiar invitación';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(shareText);notify('Invitación copiada.');}catch(_){window.prompt('Copia y comparte esta invitación:',shareText);}});actions.append(copy);
    const nativeShare=document.createElement('button');nativeShare.type='button';nativeShare.className='button soft';nativeShare.textContent='Compartir…';nativeShare.addEventListener('click',async()=>{if(navigator.share){try{await navigator.share({title,text:shareText,url:webUrl||botUrl});}catch(error){if(error.name!=='AbortError')notify('No se pudo abrir el menú para compartir.');}}else{try{await navigator.clipboard.writeText(shareText);notify('Invitación copiada.');}catch(_){window.prompt('Copia y comparte esta invitación:',shareText);}}});actions.append(nativeShare);
    if(botUrl){const bot=document.createElement('a');bot.className='button primary';bot.href=botUrl;bot.target='_blank';bot.rel='noopener noreferrer';bot.textContent='Abrir categoría en Telegram';actions.append(bot);}
    if(appUrl){const app=document.createElement('a');app.className='button soft';app.href=appUrl;app.target='_blank';app.rel='noopener noreferrer';app.textContent='Descargar la app';actions.append(app);}
    box.append(actions);parent.append(box);
  }
  let activePage = 'inicio';
  function showPage(name, scrollTarget = '') {
    activePage = name;
    clearInterval(state.poll); state.poll = null;
    $$('[data-page-section]').forEach(section => { section.hidden = section.dataset.pageSection !== name; });
    panel.hidden = true;
    $$('#main-nav [data-page]').forEach(link => link.classList.toggle('active', link.dataset.page === name));
    $('#main-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded','false');
    window.location.hash = name;
    if (name === 'restaurantes') loadCatalog();
    if (name === 'tiendas') loadStores();
    if (scrollTarget) setTimeout(() => document.getElementById(scrollTarget)?.scrollIntoView({behavior:'smooth'}), 60);
    else window.scrollTo({top:0,behavior:'smooth'});
  }
  function showView(name, chatOptions = {}) {
    if (name !== 'asistente') { clearInterval(state.poll); state.poll = null; }
    views.forEach(id => { $(`#${id}`).hidden = true; });
    if (name === 'inicio') { showPage('inicio'); return; }
    if (name === 'restaurantes') { showPage('restaurantes'); return; }
    if (name === 'tiendas') { showPage('tiendas'); return; }
    $$('[data-page-section]').forEach(section => { section.hidden = true; });
    panel.hidden=false; 
    const target = name === 'cuenta' ? 'account-view' 
      : name === 'asistente' ? 'assistant-view' 
      : name === 'mi_suscripcion' ? 'subscription-view'
      : `${name}-view`;
    const element=$(`#${target}`); if (element) element.hidden=false;
    $('#view-eyebrow').textContent = name === 'asistente' ? 'TE ACOMPAÑAMOS' 
      : name === 'mi_suscripcion' ? 'MI SUSCRIPCIÓN'
      : name.toUpperCase();
    panel.scrollIntoView({behavior:'smooth', block:'start'});
    $('#main-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded','false');
    if(name==='restaurantes') loadCatalog();
    if(name==='asistente') startChat(chatOptions);
    if(name==='cuenta') loadProfile();
    if(name==='mi_suscripcion') loadSubscription();
  }
  function restaurantCard(item) {
    const card=document.createElement('article'); card.className='restaurant-card';
    if(item.logo_url){const logo=document.createElement('img');logo.className='restaurant-logo';logo.alt='';logo.loading='lazy';logo.src=apiAsset(item.logo_url);logo.addEventListener('error',()=>logo.remove());card.append(logo);}
    const h=document.createElement('h3'); h.textContent=item.nombre || 'Restaurante';
    const p=document.createElement('p'); p.textContent=[item.categoria?.nombre,item.ciudad,item.zona].filter(Boolean).join(' · ');
    const status=document.createElement('p'); 
    const isOpen=item.abierto!==false;
    status.textContent=(isOpen?'🟢 Abierto':'🔴 Cerrado')+(item.horario?` · ${item.horario}`:'');
    status.style.fontSize='0.95em';
    const d=document.createElement('p'); d.textContent=item.descripcion || '';
    const button=document.createElement('button'); button.textContent='Ver información y menú →'; button.disabled=!isOpen; button.addEventListener('click',()=>loadMenu(item));
    card.append(h,p,status,d,button); return card;
  }
  function renderRestaurants(container, items, empty) { container.replaceChildren(); if(!items.length){container.innerHTML=`<div class="empty-state">${empty}</div>`;return;} items.forEach(item=>container.append(restaurantCard(item))); }
  async function loadCatalog(home=false) {
    const container=home?$('#home-restaurants'):$('#catalog-results');
    const city=home?$('#home-city').value.trim():$('#catalog-city').value.trim();
    const zone=home?'':$('#catalog-zone').value.trim();
    container.innerHTML='<div class="empty-state">Cargando…</div>';
    const cityInput=home?$('#home-city'):$('#catalog-city');
    const params=new URLSearchParams(); 
    if(city)params.set('ciudad',city); 
    if(cityInput?.dataset.municipalityCode)params.set('codigo_municipio',cityInput.dataset.municipalityCode); 
    if(zone)params.set('zona',zone); 
    if(!home&&state.restaurantFilter)params.set('categoria',state.restaurantFilter);
    try {
      const requests=[
        api(`/restaurantes${params.size?'?'+params:''}`,{},chatBase),
        api('/restaurantes/categorias',{},chatBase)
      ];
      const results=await Promise.all(requests);
      const data=results[0];
      const categories=results[1];
      renderRestaurants(container,data.items||[],'No hay restaurantes disponibles con esos filtros.');
      if(state.sharedRestaurantId){const wanted=state.sharedRestaurantId;state.sharedRestaurantId='';loadMenu({id:wanted,nombre:'Restaurante',ciudad:city});return;}
      if(!home){
        renderCategories(categories.items||[]);
      }
    }
    catch(error){container.innerHTML=`<div class="empty-state">${escapeHtml(error.message)} <button class="text-button retry-restaurants">Reintentar</button></div>`; container.querySelector('.retry-restaurants')?.addEventListener('click',()=>loadCatalog(home));}
  }
  async function loadZones() {
    const city=$('#catalog-city').value.trim(), status=$('#zone-status');
    renderZones([]);
    status.hidden=true;
    if(!city)return;
    try {
      const zones=await api(`/ubicaciones/barrios?ciudad=${encodeURIComponent(city)}`,{},chatBase);
      if($('#catalog-city').value.trim()!==city)return;
      renderZones(zones.items);
    } catch(error) {
      if($('#catalog-city').value.trim()!==city)return;
      console.error('No se pudieron cargar los barrios:',error);
      status.textContent='No pudimos cargar las sugerencias de barrios. Puedes escribir el sector.';
      status.hidden=false;
    }
  }
  function renderZones(zones){
    const input=$('#catalog-zone');
    if(!input)return;
    const list=input.getAttribute('list')||'restaurant-zones-list';
    let datalist=document.getElementById(list);
    if(!datalist){
      datalist=document.createElement('datalist');
      datalist.id=list;
      input.setAttribute('list',list);
      input.parentElement.appendChild(datalist);
    }
    const fragment=document.createDocumentFragment();
    (Array.isArray(zones)?zones:[]).forEach(z=>{
      const opt=document.createElement('option');
      opt.value=z.nombre||z.name||z;
      fragment.appendChild(opt);
    });
    datalist.replaceChildren(fragment);
  }
  function storeCard(item) {
    const card=document.createElement('article'); card.className='restaurant-card';
    const productId=item.producto_id??item.product_id;
    const productName=item.producto||item.product||'Producto de tienda';
    const image=document.createElement('img'); image.className='store-product-image'; image.alt=productName;
    image.src=`${chatBase}/tiendas/productos/${encodeURIComponent(productId)}/foto`;
    image.loading='lazy'; image.referrerPolicy='no-referrer';
    image.addEventListener('error',()=>image.remove());
    const h=document.createElement('h3'); h.textContent=productName;
    const shop=document.createElement('p'); shop.textContent=`${item.store||item.tienda||'Tienda'} · ${item.type||item.tipo_negocio||''}`;
    const isOpen=item.abierto!==false;
    const status=document.createElement('p'); 
    status.textContent=(isOpen?'🟢 Abierto':'🔴 Cerrado')+(item.horario?` · ${item.horario}`:'');
    status.style.fontSize='0.95em';
    const planDesc=document.createElement('p');
    planDesc.textContent=item.descripcion_plan||'';
    planDesc.style.fontWeight='600';
    planDesc.style.color='#22c6a3';
    const location=document.createElement('p'); location.textContent=[item.city||item.ciudad,item.zone||item.zona,item.coverage||item.cobertura].filter(Boolean).join(' · ');
    const description=document.createElement('p'); description.textContent=[item.description||item.descripcion,item.weight||item.gramaje].filter(Boolean).join(' · ');
    const price=document.createElement('strong'); price.textContent=`$${Number(item.price_cop||item.precio_cop||0).toLocaleString('es-CO')} COP`;
    const delivery=document.createElement('p'); delivery.textContent=(item.delivery_charged||item.domicilio_cobro)==='incluido'?'Domicilio incluido':`Domicilio: $${Number(item.delivery_fee_cop||item.domicilio_valor_cop||0).toLocaleString('es-CO')} COP`;
    const minimum=Number(item.pedido_minimo_cop||item.minimum_order_cop||0);
    const minOrder=document.createElement('p'); minOrder.textContent=`Pedido mínimo: $${minimum.toLocaleString('es-CO')} COP`;
    const ratingValue=item.calificacion??item.rating;
    const ratingCount=Number(item.num_calificaciones||item.rating_count||0);
    const rating=document.createElement('p'); rating.textContent=ratingValue!=null&&ratingCount>0?`⭐ ${ratingValue} · ${ratingCount} calificaciones`:'Aún sin calificaciones';
    const note=document.createElement('p'); note.textContent='El pago se hace directamente a la tienda; CIRCULA no cobra comisión por la venta.';
    const button=document.createElement('button'); button.type='button'; button.textContent='Consultar por CIRCULA →'; button.disabled=!isOpen;
    button.addEventListener('click',()=>{
      const action=item.accion_chat||item.chat_action||(productId?`tienda_consultar:${productId}`:'');
      if(action)startCategoryAction(action,`Consultar ${productName}`);
      else startChatPrompt(`Quiero consultar por ${productName} de ${item.tienda||'esta tienda'}.`);
    });
    card.append(image,h,shop,status,planDesc,location,description,price,delivery,minOrder,rating,note,button);
    const storeId=item.tienda_id??item.store_id;
    if(storeId){appendSharePanel(card,{title:`Comparte ${item.store||item.tienda||'esta tienda'}`,description:'Invita a otras personas a encontrar sus productos aprobados en CIRCULA.',params:{tienda:storeId,producto:productId,ciudad:item.city||item.ciudad,codigo_municipio:item.codigo_municipio,tipo:item.type||item.tipo_negocio,zona:item.zone||item.zona},page:'tiendas',telegramPayload:'tiendas'});}
    return card;
  }
  async function loadStores() {
    const container=$('#store-results');
    if(!container)return;
    container.innerHTML='<div class="empty-state">Cargando productos aprobados…</div>';
    const params=new URLSearchParams();
    const city=$('#store-city').value.trim(), type=$('#store-type').value.trim(), zone=$('#store-zone').value.trim();
    if(city)params.set('ciudad',city); if($('#store-city').dataset.municipalityCode)params.set('codigo_municipio',$('#store-city').dataset.municipalityCode); if(type)params.set('tipo',type); if(zone)params.set('zona',zone);
    try {
      const data=await api(`/tiendas${params.size?'?'+params:''}`,{},chatBase);
      container.replaceChildren();
      let items=Array.isArray(data.items)?data.items:[];
      if(state.sharedStoreId){const storeId=state.sharedStoreId,productId=state.sharedProductId;const matches=items.filter(item=>String(item.tienda_id??item.store_id)===storeId);items=productId?matches.filter(item=>String(item.producto_id??item.product_id)===productId):matches;if(!items.length){container.innerHTML='<div class=\"empty-state\">No encontramos productos activos de esa tienda en esta búsqueda. Vuelve al catálogo para explorar otras opciones.</div>';return;}state.sharedStoreId='';state.sharedProductId='';}
      if(!items.length){container.innerHTML='<div class="empty-state">No encontramos productos aprobados con esos filtros.</div>';return;}
      items.forEach(item=>container.append(storeCard(item)));
    } catch(error) {
      container.innerHTML=`<div class="empty-state">${escapeHtml(error.message)} <button class="text-button retry-stores">Reintentar</button></div>`;
      container.querySelector('.retry-stores')?.addEventListener('click',loadStores);
    }
  }
  function renderCategories(categories) {
    const select=$('#catalog-type');
    const options=[new Option('Todos los tipos','')];
    categories.forEach(c=>options.push(new Option(`${c.emoji||''} ${c.nombre||c.name||''}`.trim(),c.slug||'')));
    select.replaceChildren(...options);
    select.value=state.restaurantFilter;
    select.disabled=false;
  }
  async function loadMenu(item) {
    $$('[data-page-section]').forEach(section => { section.hidden = true; });
    panel.hidden=false; views.forEach(id => { $(`#${id}`).hidden=true; }); $('#menu-view').hidden=false;
    $('#view-eyebrow').textContent='RESTAURANTES'; $('#main-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded','false');
    const view=$('#menu-view'); view.innerHTML='<h2>Cargando menú…</h2>';
    try { const data=await api(`/restaurantes/${encodeURIComponent(item.id)}/menu`,{},chatBase); const restaurant=data.restaurante||item; view.replaceChildren(); const wrap=document.createElement('div');wrap.className='restaurant-detail';const h=document.createElement('h2');h.textContent=restaurant.nombre||item.nombre||'Restaurante';wrap.append(h);const isOpen=restaurant.abierto!==false;const status=document.createElement('p');status.textContent=(isOpen?'🟢 Abierto':'🔴 Cerrado')+(restaurant.horario?` · ${restaurant.horario}`:'');status.style.fontSize='0.95em';status.style.fontWeight='600';wrap.append(status);[restaurant.ciudad,restaurant.descripcion,restaurant.modalidad_entrega].filter(Boolean).forEach(t=>{const p=document.createElement('p');p.className='section-intro';p.textContent=t;wrap.append(p);});
      const cats=data.categorias||[]; if(!cats.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Este restaurante aún no tiene menú publicado.';wrap.append(p);} cats.forEach(cat=>{const section=document.createElement('section');section.className='menu-category';const title=document.createElement('h3');title.textContent=cat.nombre||'Menú';section.append(title);if(cat.portada_url){const cover=document.createElement('img');cover.className='restaurant-menu-cover';cover.alt=`Portada ${cat.nombre||'de categoría'}`;cover.loading='lazy';cover.src=apiAsset(cat.portada_url);cover.addEventListener('error',()=>cover.remove());section.append(cover);}(cat.productos||[]).forEach(prod=>{const row=document.createElement('div');row.className='menu-item';if(prod.foto_url){const image=document.createElement('img');image.className='menu-product-image';image.alt='';image.loading='lazy';image.src=apiAsset(prod.foto_url);image.addEventListener('error',()=>image.remove());row.append(image);}const details=document.createElement('span');details.className='menu-item-details';const name=document.createElement('strong');name.textContent=prod.nombre||'Producto';details.append(name);if(prod.descripcion){const description=document.createElement('small');description.textContent=prod.descripcion;details.append(description);}const price=document.createElement('strong');price.textContent=`$${Number(prod.precio_cop||0).toLocaleString('es-CO')} COP`;row.append(details,price);section.append(row);});wrap.append(section);});const order=document.createElement('button');order.type='button';order.className='button primary';order.textContent='Quiero pedir comida por CIRCULA →';order.disabled=!isOpen;order.addEventListener('click',()=>startCategoryAction('restaurantes','Consultar o pedir en un restaurante'));wrap.append(order);appendSharePanel(wrap,{title:`Comparte ${restaurant.nombre||item.nombre||'este restaurante'}`,description:'Envía el enlace directo del perfil y menú a tus contactos. También pueden explorar CIRCULA o abrir la categoría en Telegram.',params:{restaurante:item.id,ciudad:restaurant.ciudad||item.ciudad,codigo_municipio:restaurant.codigo_municipio||item.codigo_municipio,zona:restaurant.zona||item.zona,categoria:restaurant.categoria_slug||item.categoria_slug||item.categoria?.slug},page:'restaurantes',telegramPayload:'restaurantes'});view.append(wrap);
    } catch(error){view.innerHTML=`<h2>${escapeHtml(item.nombre||'Restaurante')}</h2><p class="empty-state">${escapeHtml(error.message)}</p><button class="back-button" id="return-catalog">← Volver al catálogo</button>`;$('#return-catalog').onclick=()=>showView('restaurantes');}
  }
  function escapeHtml(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function apiAsset(path){if(!path)return '';try{return new URL(path,`${chatBase}/`).href;}catch(_){return '';}}
  function appendTelegramText(container,text){const pattern=/(```[\s\S]*?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;let last=0;for(const match of text.matchAll(pattern)){const start=match.index;if(start>last)container.append(document.createTextNode(text.slice(last,start)));const token=match[0],tag=token.startsWith('*')?'strong':token.startsWith('_')?'em':token.startsWith('~')?'del':'code',node=document.createElement(tag);node.textContent=token.startsWith('```')?token.slice(3,-3):token.slice(1,-1);container.append(node);last=start+token.length;}if(last<text.length)container.append(document.createTextNode(text.slice(last)));}
  function addBubble(text, fromUser=false){const bubble=document.createElement('div');bubble.className='bubble '+(fromUser?'user':'bot');appendTelegramText(bubble,text);$('#chat-messages').append(bubble);$('#chat-messages').scrollTop=$('#chat-messages').scrollHeight;return bubble;}
  async function ensureChatSession(){
    const linked=Boolean(authToken());
    if(state.chatToken&&state.chatLinked===linked)return;
    if(state.chatSessionPromise)return state.chatSessionPromise;
    if(state.chatToken&&state.chatLinked!==linked){state.chatToken=null;sessionStorage.removeItem('circula_chat_token');sessionStorage.removeItem('circula_chat_linked');state.lastChatEventId=0;$('#chat-messages').replaceChildren();}
    state.chatSessionPromise=(async()=>{const accountToken=authToken();const result=await api('/sesion',{method:'POST',headers:accountToken?{Authorization:`Bearer ${accountToken}`}:{},body:JSON.stringify({dispositivo:'Web'})},chatBase);if(typeof result.token!=='string'||!result.token)throw new Error('El servidor no devolvió una sesión de chat válida.');state.chatToken=result.token;state.chatLinked=Boolean(result.cuenta_vinculada);sessionStorage.setItem('circula_chat_token',result.token);sessionStorage.setItem('circula_chat_linked',String(state.chatLinked));})();try{await state.chatSessionPromise;}finally{state.chatSessionPromise=null;}
  }
  async function sendChatEntry(value,type,label,showUserMessage=true){
    if(state.chatSending){$('#chat-status').textContent='Espera a que termine el envío anterior e inténtalo de nuevo.';return;}
    state.chatSending=true;
    $('#chat-form button[type="submit"]').disabled=true;
    if(showUserMessage)addBubble(label,true);
    $('#chat-status').textContent='Enviando…';
    try{
      await ensureChatSession();
      await api('/mensaje',{method:'POST',headers:{Authorization:`Bearer ${state.chatToken}`},body:JSON.stringify({tipo:type,valor:value})},chatBase);
      $('#chat-status').textContent='';
      await refreshChat();
    }catch(error){
      if(error.status===401){
        state.chatToken=null;
        sessionStorage.removeItem('circula_chat_token');
      }
      if(error.message.includes('No pudimos conectarnos')){
        $('#chat-status').textContent='El asistente no está disponible ahora. Inténtalo más tarde.';
      }else{
        $('#chat-status').textContent=error.message;
      }
    }finally{
      state.chatSending=false;
      $('#chat-form button[type="submit"]').disabled=false;
    }
  }
  async function sendChatLocation(){
    if(state.chatSending)return;
    if(!navigator.geolocation){$('#chat-status').textContent='Este navegador no permite ubicación. Puedes continuar sin GPS.';return;}
    state.chatSending=true;
    $('#chat-form button[type="submit"]').disabled=true;
    $('#chat-status').textContent='Solicitando ubicación…';
    try{
      const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000,maximumAge:0}));
      await ensureChatSession();
      await api('/mensaje',{method:'POST',headers:{Authorization:`Bearer ${state.chatToken}`},body:JSON.stringify({tipo:'ubicacion',ubicacion:{latitud:position.coords.latitude,longitud:position.coords.longitude}})},chatBase);
      addBubble('📍 Ubicación enviada',true);
      $('#chat-status').textContent='';
      await refreshChat();
    }catch(error){
      if(error?.code===1){
        $('#chat-status').textContent='Permiso de ubicación denegado. Puedes continuar sin GPS.';
      }else if(error?.message?.includes('No pudimos conectarnos')){
        $('#chat-status').textContent='El asistente no está disponible ahora. Inténtalo más tarde.';
      }else{
        $('#chat-status').textContent=error?.message||'No se pudo obtener o enviar la ubicación. Inténtalo de nuevo o continúa sin GPS.';
      }
    }finally{state.chatSending=false;$('#chat-form button[type="submit"]').disabled=false;}
  }
  function renderChatEvent(event){
    const text=typeof event.texto==='string'?event.texto:'';
    const bubble=addBubble(text||event.archivo?.nombre||'',false);
    const attachment=event.archivo;
    if(attachment&&typeof attachment.id==='string'){
      const link=document.createElement('button');
      link.type='button';
      link.className='text-button';
      link.textContent=attachment.mime?.startsWith('image/')?'Ver imagen':'Descargar archivo';
      link.addEventListener('click',()=>downloadChatFile(attachment));
      bubble.append(link);
    }
    (Array.isArray(event.botones)?event.botones:[]).forEach(row=>{
      if(!Array.isArray(row))return;
      const actions=document.createElement('div');
      actions.className='chat-actions';
      row.forEach(item=>{
        if(typeof item.titulo!=='string')return;
        const button=document.createElement(item.url?'a':'button');
        button.className='chat-action';
        button.textContent=item.titulo;
        if(typeof item.id==='string'){
          button.type='button';
          if(item.id==='entrega_compartir'){
            button.addEventListener('click',()=>sendChatLocation());
          }else{
            button.addEventListener('click',()=>sendChatEntry(item.id,'boton',item.titulo));
          }
        }else if(typeof item.url==='string'){
          try{
            const url=new URL(item.url);
            if(!['http:','https:'].includes(url.protocol))return;
            button.href=url.href;
            button.target='_blank';
            button.rel='noopener noreferrer';
          }catch(_){return;}
        }else{return;}
        actions.append(button);
      });
      if(actions.children.length)bubble.append(actions);
    });
  }
  async function downloadChatFile(attachment){try{const response=await fetch(`${chatBase}/archivo/${encodeURIComponent(attachment.id)}`,{headers:{Authorization:`Bearer ${state.chatToken}`}});if(!response.ok)throw new Error('No se pudo obtener el archivo.');const blob=await response.blob();const url=URL.createObjectURL(blob);if(attachment.mime?.startsWith('image/')){const image=document.createElement('img');image.className='chat-attachment';image.alt=attachment.nombre||'Imagen enviada por CIRCULA';image.src=url;const bubble=$('#chat-messages').lastElementChild;if(bubble)bubble.append(image);return;}const anchor=document.createElement('a');anchor.href=url;anchor.download=attachment.nombre||'archivo';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){$('#chat-status').textContent=error.message||'No se pudo descargar el archivo.';}}
  async function sendChatFile(file){if(!file)return;if(file.size>10*1024*1024){$('#chat-status').textContent='El archivo supera el límite de 10 MB.';return;}const mime=file.type||'application/octet-stream';const extension=file.name.split('.').pop().toLowerCase();const type=mime.startsWith('image/')||['jpg','jpeg','png','webp'].includes(extension)?'foto':mime.startsWith('video/')||['mp4','mov','webm','3gp'].includes(extension)?'video':'documento';const caption=$('#chat-text').value.trim();const reader=new FileReader();reader.onerror=()=>{$('#chat-status').textContent='No se pudo leer el archivo seleccionado.';};reader.onload=async()=>{try{await ensureChatSession();const b64=String(reader.result).split(',')[1]||'';addBubble(`📎 ${file.name}${caption?`\n${caption}`:''}`,true);const result=await api('/mensaje',{method:'POST',headers:{Authorization:`Bearer ${state.chatToken}`},body:JSON.stringify({tipo:type,valor:caption,archivo:{nombre:file.name,mime,b64}})},chatBase);$('#chat-text').value='';for(const event of Array.isArray(result.eventos)?result.eventos:[]){if(!Number.isInteger(event.id)||event.id<=state.lastChatEventId)continue;renderChatEvent(event);state.lastChatEventId=event.id;}$('#chat-status').textContent='';}catch(error){$('#chat-status').textContent=error.message;}};reader.readAsDataURL(file);}
  async function startChat({skipInitialStart=false}={}){if(state.chatBootstrapPromise)return state.chatBootstrapPromise;state.chatBootstrapPromise=(async()=>{await refreshChat();if(!skipInitialStart&&!state.lastChatEventId)await sendChatEntry('/start','texto','',false);if(!state.poll)state.poll=setInterval(refreshChat,5000);})();try{await state.chatBootstrapPromise;}finally{state.chatBootstrapPromise=null;}}
  function notifyNewChatEvents(count){if(!count)return;document.title=`${count} mensaje${count===1?'':'s'} nuevo${count===1?'':'s'} · CIRCULA`;try{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(AudioContextClass){const audio=new AudioContextClass(),oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.frequency.value=740;gain.gain.value=0.035;oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+0.13);oscillator.onended=()=>audio.close();}}catch(_){}}
  const pageTitle=document.title;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)document.title=pageTitle;});
  async function refreshChat(){
    if(state.chatRefreshing)return;
    state.chatRefreshing=true;
    try{
      await ensureChatSession();
      const data=await api(`/mensajes?desde=${state.lastChatEventId}`,{headers:{Authorization:`Bearer ${state.chatToken}`}},chatBase);
      let newCount=0;
      for(const event of Array.isArray(data.eventos)?data.eventos:[]){
        if(!Number.isInteger(event.id)||event.id<=state.lastChatEventId)continue;
        renderChatEvent(event);
        state.lastChatEventId=event.id;
        newCount++;
      }
      if(document.hidden)notifyNewChatEvents(newCount);
      if(state.lastChatEventId)$('#chat-status').textContent='';
    }catch(error){
      if(error.status===401){
        state.chatToken=null;
        sessionStorage.removeItem('circula_chat_token');
        state.lastChatEventId=0;
      }
      if(error.message.includes('No pudimos conectarnos')){
        $('#chat-status').textContent='El asistente no está disponible ahora. Inténtalo más tarde.';
      }else{
        $('#chat-status').textContent=error.message;
      }
    }finally{
      state.chatRefreshing=false;
    }
  }
  $('#chat-form').addEventListener('submit',async event=>{event.preventDefault();const input=$('#chat-text'),text=input.value.trim();if(!text)return;input.value='';await sendChatEntry(text,'texto',text);});
  $('#chat-file').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)sendChatFile(file);});
  function authToken(){return sessionStorage.getItem('circula_access_token');}
  function selectAuthTab(mode){$$('[data-auth-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.authTab===mode));$('#login-form').hidden=mode!=='login';$('#signup-form').hidden=mode!=='register';$('#link-form').hidden=mode!=='link';if(mode==='register')loadSignupTerms();}
  async function loadSignupTerms(){
    if(state.termsLoaded||state.termsLoading)return;
    state.termsLoading=true;
    const text=$('#signup-terms-text');
    text.textContent='Cargando los términos vigentes de CIRCULA…';
    try{
      const result=await api('/app/terms');
      if(typeof result.text!=='string'||!result.text||typeof result.version!=='string'||!result.version)throw new Error('El servidor no entregó los términos vigentes.');
      text.textContent=result.text;
      $('#signup-form [name="terminos_version"]').value=result.version;
      state.termsLoaded=true;
    }catch(error){
      text.textContent='No fue posible cargar los términos oficiales. Revisa la conexión y vuelve a seleccionar “Crear cuenta”.';
      $('#account-result').textContent=error.message;
    }finally{state.termsLoading=false;}
  }
  async function loadProfile(){const token=authToken();if(!token)return;const view=$('#profile-view');views.forEach(id=>{$(`#${id}`).hidden=true;});view.hidden=false;try{const result=await api('/app/me',{headers:{Authorization:`Bearer ${token}`}});const u=result.user||result;window.dispatchEvent(new CustomEvent('circula:profile-ready',{detail:u}));let requests=[];try{const own=await api('/solicitudes?limite=50',{headers:{Authorization:`Bearer ${token}`}});requests=Array.isArray(own.items)?own.items:[];}catch(_){}const rows=requests.length?requests.map(item=>`<li><strong>#${escapeHtml(item.id)}</strong> · ${escapeHtml(item.operacion_tipo||'Solicitud')} · ${escapeHtml(item.estado||'En proceso')}<small>${escapeHtml(item.fecha||'')} · ${escapeHtml(item.canal_origen||'CIRCULA')}</small></li>`).join(''):'<li>Todavía no tienes solicitudes registradas.</li>';view.innerHTML=`<h2>Hola, ${escapeHtml(u.nombre||'usuario')}</h2><p class="section-intro">Código: ${escapeHtml(u.codigo||'')} · Plan: ${escapeHtml(u.plan||'Gratis')}</p><section class="account-requests"><h3>Mis solicitudes</h3><ul>${rows}</ul></section><section class="account-requests" id="user-mailbox"><h3>Buzón de ayuda CIRCULA</h3><p>Escribe al equipo coordinador; la respuesta llegará aquí.</p><p>Cargando mensajes…</p></section><button class="button soft" id="logout">Cerrar sesión</button>`;loadUserMailbox(token);$('#logout').onclick=async()=>{try{await api('/app/logout',{method:'POST',headers:{Authorization:`Bearer ${token}`}});}catch(_){}sessionStorage.removeItem('circula_access_token');window.dispatchEvent(new Event('circula:logout'));notify('Sesión cerrada.');showView('cuenta');};}catch(error){sessionStorage.removeItem('circula_access_token');$('#account-result').textContent=error.message;}}
  async function loadUserMailbox(token){const panel=$('#user-mailbox');if(!panel)return;try{const data=await api('/crm/buzon/usuario',{headers:{Authorization:`Bearer ${token}`}});const messages=Array.isArray(data.mensajes)?data.mensajes:[];const list=messages.length?messages.slice(-30).map(m=>`<li><strong>${m.autor_tipo==='usuario'?'Tú':'Coordinación'}</strong> · ${escapeHtml(m.fecha||'')}<p>${escapeHtml(m.texto||'')}</p></li>`).join(''):'<li>Todavía no hay mensajes.</li>';panel.innerHTML=`<h3>Buzón de ayuda CIRCULA</h3><p>Escribe al equipo coordinador; la respuesta llegará aquí.</p><ul>${list}</ul><form id="user-mailbox-form"><label>Tu mensaje<textarea name="texto" maxlength="2000" required></textarea></label><button class="button primary" type="submit">Enviar al coordinador</button><p class="status-note" role="status"></p></form>`;panel.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const status=form.querySelector('.status-note');const text=new FormData(form).get('texto').toString().trim();if(!text)return;status.textContent='Enviando…';try{await api('/crm/buzon/usuario',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({texto:text})});await loadUserMailbox(token);}catch(error){status.textContent=error.message||'No se pudo enviar el mensaje.';}});}catch(error){panel.innerHTML=`<h3>Buzón de ayuda CIRCULA</h3><p class="status-note">${escapeHtml(error.message||'No pudimos cargar el buzón.')}</p><button class="button soft" type="button" id="mailbox-retry">Reintentar</button>`;panel.querySelector('#mailbox-retry')?.addEventListener('click',()=>loadUserMailbox(token));}}
  async function loadSubscription(){const token=authToken();if(!token)return;const view=$('#subscription-view');views.forEach(id=>{$(`#${id}`).hidden=true;});view.hidden=false;const status=$('#subscription-status');const details=$('#subscription-details');const renewBtn=$('#renew-subscription');status.textContent='Cargando tu información de suscripción…';try{const result=await api('/app/me',{headers:{Authorization:`Bearer ${token}`}});const sub=result.suscripcion||{};if(!sub.plan||sub.plan==='Gratis'){details.innerHTML='<p class="empty-state">No tienes una suscripción activa. <a class="text-button" href="#planes">Ver planes disponibles →</a></p>';status.textContent='';return;}const diasFaltantes=sub.dias_restantes||0;const vencimiento=sub.fecha_vencimiento||'';status.textContent=`Plan ${sub.plan} activo · Te quedan ${diasFaltantes} días`;details.innerHTML=`<div class="subscription-details"><p><strong>Plan:</strong> ${escapeHtml(sub.plan)}</p><p><strong>Días restantes:</strong> ${diasFaltantes}</p><p><strong>Vencimiento:</strong> ${vencimiento}</p><p class="status-note">${sub.beneficios||'Acceso a beneficios del plan.'}</p></div>`;if(diasFaltantes<=5&&diasFaltantes>0)renewBtn.hidden=false;}catch(error){status.textContent=error.message;details.textContent='';}}
  $('#renew-subscription').addEventListener('click',()=>startCategoryAction('mi_suscripcion','Mi suscripción'));
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));$('#account-result').textContent='Conectando…';try{const result=await api('/app/login',{method:'POST',body:JSON.stringify({codigo:data.codigo,contrasena:data.contrasena})});if(result.state==='pending'||result.state==='bot_verification_pending'){ $('#account-result').textContent=result.message||'Tu cuenta sigue pendiente de revisión. Te avisaremos cuando termine.';return;}const token=result.token||result.access_token;if(!token)throw new Error('El servidor no devolvió el acceso de la cuenta.');sessionStorage.setItem('circula_access_token',token);$('#account-result').textContent='';loadProfile();}catch(error){$('#account-result').textContent=error.message;}});
  async function submitRegistration(form, endpoint, successText){
    const fd=new FormData(form), password=String(fd.get('contrasena')||''), confirmation=String(fd.get('confirmacion')||'');
    if(endpoint==='/app/signup'&&!state.termsLoaded){$('#account-result').textContent='Primero carga y revisa los términos oficiales de CIRCULA.';return;}
    if(password.length<12){$('#account-result').textContent='La contraseña debe tener al menos 12 caracteres.';return;}
    if(password!==confirmation){$('#account-result').textContent='Las contraseñas no coinciden.';return;}
    for(const field of ['documento_frontal','documento_posterior']){const file=fd.get(field);if(!(file instanceof File)||!file.size){$('#account-result').textContent='Selecciona las dos caras de tu documento.';return;}if(!['image/jpeg','image/png'].includes(file.type)){ $('#account-result').textContent='Los documentos deben ser imágenes JPG o PNG.';return;}if(file.size>5*1024*1024){$('#account-result').textContent='Cada imagen debe pesar máximo 5 MB.';return;}}
    let requestBody=fd;
    if(endpoint==='/app/signup'){
      await window.CIRCULA_MUNICIPALITIES_READY;
      if(!Array.isArray(window.CIRCULA_MUNICIPALITIES)||!window.CIRCULA_MUNICIPALITIES.length){const error=window.CIRCULA_MUNICIPALITIES_ERROR;$('#account-result').textContent=error?.message||'No pudimos cargar el listado de municipios. Inténtalo de nuevo más tarde.';return;}
      const signupFields=['nombre','correo','telefono','municipio','fecha_nacimiento','contrasena','confirmacion'];
      if(signupFields.some(field=>!String(fd.get(field)||'').trim())){ $('#account-result').textContent='Completa todos los datos del registro, incluida la fecha de nacimiento.';return;}
      const selectedMunicipality=(window.CIRCULA_MUNICIPALITIES||[]).find(item=>item.etiqueta===String(fd.get('municipio')||'').trim());
      if(!selectedMunicipality){ $('#account-result').textContent='Selecciona tu municipio en el listado oficial de CIRCULA.';return;}
      if(!fd.get('confirma_mayoria_edad')||!fd.get('acepta_terminos')||!fd.get('autoriza_datos')){ $('#account-result').textContent='Confirma tu mayoría de edad, acepta los términos y autoriza el tratamiento de datos.';return;}
      requestBody=new FormData();
      for(const field of signupFields)requestBody.set(field,fd.get(field));
      requestBody.set('codigo_municipio',selectedMunicipality.codigo);
      requestBody.set('confirma_mayoria_edad','true');
      requestBody.set('acepta_terminos','true');
      requestBody.set('autoriza_datos','true');
      for(const field of ['documento_frontal','documento_posterior'])requestBody.set(field,fd.get(field));
    }
    $('#account-result').textContent='Enviando al servidor seguro de CIRCULA…';
    try{const result=await api(endpoint,{method:'POST',body:requestBody});const code=result.codigo||result.code;$('#account-result').textContent=(result.message||successText)+(code?` Tu código CIRCULA es ${code}.`:'');form.reset();}
    catch(error){$('#account-result').textContent=error.message;}
  }
  $('#signup-form').addEventListener('submit',e=>{e.preventDefault();submitRegistration(e.currentTarget,'/app/signup','Tu registro quedó pendiente de revisión.');});
  $('#link-form').addEventListener('submit',e=>{e.preventDefault();submitRegistration(e.currentTarget,'/app/register','La solicitud de vinculación quedó pendiente de revisión.');});
  $$('[data-auth-tab]').forEach(button=>button.addEventListener('click',()=>selectAuthTab(button.dataset.authTab)));
  $$('[data-view]').forEach(button=>button.addEventListener('click',()=>{showView(button.dataset.view);if(button.dataset.authMode)selectAuthTab(button.dataset.authMode);}));
  function updateSubscriptionMenuButton(){const navBtn=$('#mi-suscripcion-nav');if(authToken()){navBtn.hidden=false;}else{navBtn.hidden=true;}}
  window.addEventListener('circula:logout',()=>{updateSubscriptionMenuButton();});
  document.addEventListener('DOMContentLoaded',updateSubscriptionMenuButton);
  updateSubscriptionMenuButton();
  async function startCategoryAction(action,label){
    showView('asistente',{skipInitialStart:true});
    await startChat({skipInitialStart:true});
    await sendChatEntry(action,'boton',label);
  }
  function startChatPrompt(prompt){showView('asistente');setTimeout(()=>{const input=$('#chat-text');input.value=prompt;input.focus();},160);}
  $$('[data-open-request]').forEach(button=>button.addEventListener('click',()=>startCategoryAction(button.dataset.openRequest,button.closest('.category-card')?.querySelector('strong')?.textContent||button.textContent)));
  async function openRestaurantRegister(){startCategoryAction('rest_negocio','🏪 Registrar mi restaurante');}
  $('#restaurant-owner-start').addEventListener('click',openRestaurantRegister);
  $('#restaurant-register-close').addEventListener('click',()=>{$('#restaurant-register-form').hidden=true;});
  window.addEventListener('circula:chat-prompt',event=>{const prompt=event.detail?.prompt;if(typeof prompt==='string'&&prompt)startChatPrompt(prompt);});
  window.addEventListener('circula:chat-action',event=>{const detail=event.detail||{};if(typeof detail.action==='string'&&detail.action)startCategoryAction(detail.action,String(detail.label||'Consultar en CIRCULA'));});
  $('#back-home').addEventListener('click',()=>showPage(activePage));
  $('#catalog-search').addEventListener('click',()=>loadCatalog());
  $('#catalog-type').addEventListener('change',event=>{state.restaurantFilter=event.target.value;loadCatalog();});
  $('#catalog-city').addEventListener('change',()=>{$('#catalog-zone').value='';loadZones();loadCatalog();});
  $('#catalog-zone').addEventListener('change',()=>loadCatalog());
  $$('[data-page]').forEach(button=>button.addEventListener('click',()=>showPage(button.dataset.page,button.dataset.scrollTarget||'')));
  const apkUrl=String(cfg.appDownloadUrl||'').trim();
  const apkVersion=String(cfg.appReleaseVersion||'').trim();
  const downloadName=/^[A-Za-z0-9._-]+\.apk$/i.test(String(cfg.appDownloadFilename||''))?String(cfg.appDownloadFilename):'CirculaM.apk';
  const downloadLinks=$$('.download-cta');
  let safeApkUrl='';
  if(apkUrl){try{const url=new URL(apkUrl,window.location.href);if(url.protocol==='https:'||url.origin===window.location.origin)safeApkUrl=url.href;}catch(_){}}
  const configuredParts=Array.isArray(cfg.appDownloadParts)?cfg.appDownloadParts:[];
  const safePartUrls=configuredParts.map(part=>{try{const url=new URL(String(part),window.location.href);return url.origin===window.location.origin&&(url.protocol==='https:'||url.protocol==='http:')?url.href:'';}catch(_){return '';}});
  const hasSplitApk=safePartUrls.length>0&&safePartUrls.every(Boolean);
  if(hasSplitApk){
    downloadLinks.forEach(link=>{
      link.href='#descargas';link.removeAttribute('aria-disabled');link.removeAttribute('download');link.textContent='Descargar beta para Android';
      link.addEventListener('click',async event=>{
        event.preventDefault();if(link.dataset.downloading==='true')return;
        link.dataset.downloading='true';link.setAttribute('aria-busy','true');link.textContent='Preparando APK…';
        $('#download-status').textContent=`Descargando ${safePartUrls.length} partes para preparar ${downloadName}. Mantén esta página abierta.`;
        try{
          const chunks=await Promise.all(safePartUrls.map(async(url,index)=>{const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`No se pudo descargar la parte ${index+1} de ${safePartUrls.length}.`);return response.blob();}));
          const apk=new Blob(chunks,{type:'application/vnd.android.package-archive'});const objectUrl=URL.createObjectURL(apk);const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=downloadName;anchor.hidden=true;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
          $('#download-status').textContent='Descarga beta iniciada. En Android, abre CirculaM.apk y permite la instalación cuando el teléfono lo solicite.';
        }catch(error){$('#download-status').textContent=error.message||'No se pudo preparar el archivo. Intenta nuevamente.';notify('No se pudo preparar la descarga de CIRCULA.');}
        finally{link.dataset.downloading='false';link.removeAttribute('aria-busy');link.textContent='Descargar beta para Android';}
      });
    });
    $('#download-status').textContent='Beta Android disponible para pruebas. Esta descarga no es la versión publicada en Google Play.';$('#release-version').textContent=apkVersion||'Beta de prueba Android';
  }else if(safeApkUrl){
    const opensDrive=new URL(safeApkUrl).hostname==='drive.google.com';
    downloadLinks.forEach(link=>{link.href=safeApkUrl;link.removeAttribute('aria-disabled');if(opensDrive){link.removeAttribute('download');link.textContent='Abrir descarga en Google Drive';}else{link.setAttribute('download','');}});
    $('#download-status').textContent=opensDrive?'Se abrirá Google Drive. Allí pulsa Descargar para guardar CirculaM.apk en tu dispositivo.':'Descarga disponible desde el enlace oficial de CIRCULA.';
    $('#release-version').textContent=apkVersion||'Versión oficial';
  }
  else{downloadLinks.forEach(link=>{link.href='#descargas';link.setAttribute('aria-disabled','true');});}
  $('#store-search-button').addEventListener('click',loadStores);
  $('#store-owner-start').addEventListener('click',()=>startCategoryAction('tiendas_registrar','Solicitar la vinculación de mi tienda'));
  $('#location-request').addEventListener('click',()=>{const place=$('#catalog-city').value.trim();startChatPrompt(`Solicito agregar esta localidad a CIRCULA: ${place||''}`);});
  $('#menu-toggle').addEventListener('click',()=>{const nav=$('#main-nav');nav.classList.toggle('open');$('#menu-toggle').setAttribute('aria-expanded',String(nav.classList.contains('open')));});
  const shareParams=new URLSearchParams(location.search);
  const safeShareId=value=>/^[A-Za-z0-9_-]{1,64}$/.test(value||'')?value:'';
  state.sharedRestaurantId=safeShareId(shareParams.get('restaurante'));
  state.sharedStoreId=safeShareId(shareParams.get('tienda'));
  state.sharedProductId=safeShareId(shareParams.get('producto'));
  if(state.sharedRestaurantId){$('#catalog-city').value=shareParams.get('ciudad')||'';$('#catalog-city').dataset.municipalityCode=shareParams.get('codigo_municipio')||'';$('#catalog-zone').value=shareParams.get('zona')||'';state.restaurantFilter=shareParams.get('categoria')||'';}
  if(state.sharedStoreId){$('#store-city').value=shareParams.get('ciudad')||'';$('#store-city').dataset.municipalityCode=shareParams.get('codigo_municipio')||'';$('#store-type').value=shareParams.get('tipo')||'';$('#store-zone').value=shareParams.get('zona')||'';}
  const requestedPage = state.sharedRestaurantId?'restaurantes':state.sharedStoreId?'tiendas':window.location.hash.slice(1);
  const availablePages = new Set($$('[data-page-section]').map(section => section.dataset.pageSection));
  showPage(availablePages.has(requestedPage) ? requestedPage : 'inicio');
  if(!base) notify('Configura la dirección de la API para activar catálogo, chat y cuentas.');
})();
