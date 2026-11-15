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
    '#signup-form [name="municipio"]'
  ].map(selector => document.querySelector(selector)).filter(Boolean);
  const statusNodes = [
    '#location-status',
    '#store-location-status',
    '#signup-location-status'
  ].map(selector => document.querySelector(selector)).filter(Boolean);
  if (!list || !inputs.length || !apiBase) return;

  window.CIRCULA_MUNICIPALITIES_READY = fetch(`${apiBase}/ubicaciones/municipios?limite=2000`)
    .then(async response => {
      if (!response.ok) throw new Error('No pudimos consultar el listado municipal de CIRCULA.');
      const data = await response.json();
      if (!Array.isArray(data.items) || !data.items.length) {
        throw new Error('El servidor no entregó municipios DIVIPOLA.');
      }
      window.CIRCULA_MUNICIPALITIES = data.items;
      const options = document.createDocumentFragment();
      data.items.forEach(municipality => {
        const option = document.createElement('option');
        option.value = municipality.etiqueta;
        options.append(option);
      });
      list.replaceChildren(options);
      inputs.forEach(input => input.setAttribute('list', 'colombia-municipalities'));
      inputs.forEach(input => input.addEventListener('input', () => {
        const selected = data.items.find(item => item.etiqueta === input.value.trim());
        if (selected) input.dataset.municipalityCode = selected.codigo;
        else delete input.dataset.municipalityCode;
      }));
      statusNodes.forEach(status => {
        status.textContent = `Listado oficial DIVIPOLA cargado: ${data.items.length} municipios.`;
      });
      return data.items;
    })
    .catch(error => {
      statusNodes.forEach(status => {
        status.textContent = error.message || 'No pudimos cargar el listado de municipios.';
      });
      window.CIRCULA_MUNICIPALITIES_ERROR = error;
      return [];
    });
})();
