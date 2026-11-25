(() => {
  'use strict';
  const config = window.CIRCULA_CONFIG || {};
  const apiBase = String(config.chatApiBaseUrl || config.apiBaseUrl || '').replace(/\/$/, '');
  const list = document.querySelector('#colombia-municipalities');
  const inputs = [
    '#catalog-city',
    '#store-city',
    '#restaurant-register-city',
    '#home-city',
    '#signup-form [name="municipio"]',
    '#category-request-city'
  ].map(selector => document.querySelector(selector)).filter(Boolean);
  const statusNodes = [
    '#location-status',
    '#store-location-status',
    '#signup-location-status'
  ].map(selector => document.querySelector(selector)).filter(Boolean);
  if (!list || !inputs.length) return;

  function useMunicipalities(items, source) {
    window.CIRCULA_MUNICIPALITIES = items;
    const options = document.createDocumentFragment();
    items.forEach(municipality => {
      const option = document.createElement('option');
      option.value = municipality.etiqueta;
      options.append(option);
    });
    list.replaceChildren(options);
    statusNodes.forEach(status => {
      status.textContent = `Listado DIVIPOLA ${source}: ${items.length} municipios.`;
    });
    return items;
  }

  inputs.forEach(input => {
    input.setAttribute('list', 'colombia-municipalities');
    input.addEventListener('input', () => {
      const selected = (window.CIRCULA_MUNICIPALITIES || [])
        .find(item => item.etiqueta === input.value.trim());
      if (selected) input.dataset.municipalityCode = selected.codigo;
      else delete input.dataset.municipalityCode;
    });
  });

  const localItems = window.CIRCULA_MUNICIPALITIES_DATA || [];
  if (localItems.length) useMunicipalities(localItems, 'local');
  window.CIRCULA_MUNICIPALITIES_READY = (apiBase
    ? fetch(`${apiBase}/ubicaciones/municipios?limite=2000`)
      .then(async response => {
        if (!response.ok) throw new Error('No pudimos consultar el listado municipal de CIRCULA.');
        const data = await response.json();
        if (!Array.isArray(data.items) || !data.items.length) {
          throw new Error('El servidor no entregó municipios DIVIPOLA.');
        }
        return useMunicipalities(data.items, 'actualizado');
      })
    : Promise.reject(new Error('La API de municipios no está configurada.')))
    .catch(error => {
      console.error('Error al cargar municipios desde la API:', error);
      window.CIRCULA_MUNICIPALITIES_ERROR = error;
      if (localItems.length) return localItems;
      statusNodes.forEach(status => {
        status.textContent = 'No pudimos cargar el listado de municipios.';
      });
      return [];
    });
})();
