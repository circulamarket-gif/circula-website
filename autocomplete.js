(() => {
  'use strict';
  
  const config = window.CIRCULA_CONFIG || {};
  const apiBase = String(config.chatApiBaseUrl || config.apiBaseUrl || '').replace(/\/$/, '');
  
  // Configurar todos los campos de ciudad
  const cityInputSelectors = [
    '#catalog-city',
    '#store-city',
    '#restaurant-register-city',
    '#home-city',
    '#signup-form [name="municipio"]',
    '#category-request-city'
  ];

  const cityInputs = cityInputSelectors
    .map(selector => document.querySelector(selector))
    .filter(el => el !== null);

  if (!cityInputs.length) return;

  let municipalitiesData = [];
  let isLoadingMunicipalities = false;

  // Cargar municipios
  async function loadMunicipalities() {
    if (isLoadingMunicipalities || municipalitiesData.length) return municipalitiesData;
    isLoadingMunicipalities = true;
    
    try {
      // Intentar cargar desde el API primero
      if (apiBase) {
        const response = await fetch(`${apiBase}/ubicaciones/municipios?limite=2000`);
        if (response.ok) {
          const data = await response.json();
          municipalitiesData = data.items || [];
          return municipalitiesData;
        }
      }
      
      // Si API falla o no está configurado, usar datos locales
      if (window.CIRCULA_MUNICIPALITIES_DATA) {
        municipalitiesData = window.CIRCULA_MUNICIPALITIES_DATA;
        return municipalitiesData;
      }
      
      throw new Error('No hay municipios disponibles');
    } catch (error) {
      console.error('Error loading municipalities:', error);
      // Intentar usar datos globales como fallback
      if (window.CIRCULA_MUNICIPALITIES_DATA) {
        municipalitiesData = window.CIRCULA_MUNICIPALITIES_DATA;
      }
      return municipalitiesData;
    } finally {
      isLoadingMunicipalities = false;
    }
  }

  // Filtrar municipios por búsqueda
  function filterMunicipalities(query) {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return municipalitiesData
      .filter(m => {
        const etiqueta = (m.etiqueta || '').toLowerCase();
        const nombre = (m.nombre || '').toLowerCase();
        const departamento = (m.departamento || '').toLowerCase();
        return etiqueta.includes(q) || nombre.includes(q) || departamento.includes(q);
      })
      .slice(0, 15); // Limitar a 15 resultados
  }

  // Función auxiliar para escapar HTML
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  // Mostrar sugerencias
  function showSuggestions(inputEl, resultsEl, query) {
    const filtered = filterMunicipalities(query);
    
    if (!filtered.length) {
      resultsEl.innerHTML = '';
      resultsEl.hidden = true;
      return;
    }

    const html = filtered.map(m => {
      const displayText = `${m.nombre || m.etiqueta} · ${m.departamento || ''}`;
      return `<button type="button" class="autocomplete-option" data-value="${escapeHtml(m.etiqueta)}" data-code="${escapeHtml(m.codigo)}" title="${escapeHtml(displayText)}">${escapeHtml(displayText)}</button>`;
    }).join('');

    resultsEl.innerHTML = html;
    resultsEl.hidden = false;

    // Agregar event listeners a las opciones
    resultsEl.querySelectorAll('.autocomplete-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        inputEl.value = btn.dataset.value;
        inputEl.dataset.municipalityCode = btn.dataset.code;
        resultsEl.innerHTML = '';
        resultsEl.hidden = true;
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  // Inicializar cada campo de entrada
  cityInputs.forEach((inputEl) => {
    // Crear contenedor de resultados
    let resultsEl = inputEl.nextElementSibling;
    if (!resultsEl || !resultsEl.classList.contains('autocomplete-results')) {
      resultsEl = document.createElement('div');
      resultsEl.className = 'autocomplete-results';
      resultsEl.hidden = true;
      inputEl.parentElement.insertBefore(resultsEl, inputEl.nextElementSibling);
    }

    // Event: Input para filtrar
    inputEl.addEventListener('input', async (e) => {
      await loadMunicipalities();
      showSuggestions(inputEl, resultsEl, e.target.value);
    });

    // Event: Focus para mostrar sugerencias
    inputEl.addEventListener('focus', async (e) => {
      if (e.target.value.trim()) {
        await loadMunicipalities();
        showSuggestions(inputEl, resultsEl, e.target.value);
      }
    });

    // Event: Blur para cerrar
    inputEl.addEventListener('blur', () => {
      setTimeout(() => {
        resultsEl.hidden = true;
      }, 100);
    });

    // Validar que el valor seleccionado sea válido
    inputEl.addEventListener('change', async () => {
      if (!inputEl.dataset.municipalityCode && inputEl.value.trim()) {
        await loadMunicipalities();
        const match = municipalitiesData.find(m => m.etiqueta === inputEl.value.trim());
        if (match) {
          inputEl.dataset.municipalityCode = match.codigo;
        }
      }
    });
  });

  // Cargar municipios al inicio
  loadMunicipalities().catch(err => console.error('Initial load error:', err));
})();
