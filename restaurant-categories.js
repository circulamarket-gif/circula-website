(() => {
  'use strict';

  const cfg = window.CIRCULA_CONFIG || {};
  const chatBase = String(cfg.chatApiBaseUrl || cfg.apiBaseUrl || '').replace(/\/$/, '');

  // Store for categories data
  let restaurantCategories = [];
  let selectedCategory = '';

  async function loadRestaurantCategories() {
    try {
      if (!chatBase) {
        console.warn('Restaurant categories: chatBase not configured');
        // Use fallback immediately
        restaurantCategories = window.CIRCULA_RESTAURANT_CATEGORIES || [];
        initializeCategoryDropdown();
        return;
      }

      const response = await fetch(`${chatBase}/restaurantes/categorias`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      
      const data = await response.json();
      restaurantCategories = Array.isArray(data.items) ? data.items : [];
      if (restaurantCategories.length === 0) {
        // Use fallback if API returned empty
        restaurantCategories = window.CIRCULA_RESTAURANT_CATEGORIES || [];
      }
      initializeCategoryDropdown();
    } catch (error) {
      console.error('Failed to load restaurant categories:', error);
      // Continue with fallback categories
      restaurantCategories = window.CIRCULA_RESTAURANT_CATEGORIES || [];
      initializeCategoryDropdown();
    }
  }

  function initializeCategoryDropdown() {
    const queryInput = document.getElementById('catalog-query');
    if (!queryInput) {
      // Retry if element not found yet
      setTimeout(initializeCategoryDropdown, 200);
      return;
    }

    // Create dropdown container
    const container = document.createElement('div');
    container.className = 'category-dropdown-wrapper';
    
    // Create the display button
    const displayBtn = document.createElement('button');
    displayBtn.type = 'button';
    displayBtn.id = 'category-display-btn';
    displayBtn.className = 'category-display-btn';
    displayBtn.placeholder = '¿Qué restaurante o comida buscas?';
    displayBtn.textContent = displayBtn.placeholder;
    displayBtn.setAttribute('aria-haspopup', 'listbox');
    displayBtn.setAttribute('aria-expanded', 'false');

    // Create dropdown results container
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'category-results';
    resultsContainer.setAttribute('role', 'listbox');
    resultsContainer.hidden = true;

    // Build category options
    const categoryList = [
      { slug: '', nombre: '🔍 Todas las categorías', emoji: '🔍' },
      ...restaurantCategories
    ];

    categoryList.forEach((cat, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'category-option';
      option.setAttribute('role', 'option');
      option.setAttribute('data-slug', cat.slug || '');
      
      const label = cat.emoji 
        ? `${cat.emoji} ${cat.nombre || cat.name || ''}`
        : cat.nombre || cat.name || '';
      
      option.textContent = label.trim();
      option.setAttribute('aria-selected', index === 0 ? 'true' : 'false');

      option.addEventListener('click', (e) => {
        e.preventDefault();
        selectCategory(cat.slug || '', label.trim());
      });

      resultsContainer.appendChild(option);
    });

    // Toggle dropdown on button click
    displayBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target) && resultsContainer.hidden === false) {
        resultsContainer.hidden = true;
        displayBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on Escape key
    displayBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !resultsContainer.hidden) {
        resultsContainer.hidden = true;
        displayBtn.setAttribute('aria-expanded', 'false');
      }
    });

    container.appendChild(displayBtn);
    container.appendChild(resultsContainer);

    // Replace the input with our dropdown
    queryInput.parentNode.replaceChild(container, queryInput);

    function toggleDropdown() {
      const isHidden = resultsContainer.hidden;
      resultsContainer.hidden = !isHidden;
      displayBtn.setAttribute('aria-expanded', !isHidden);
      if (!isHidden) {
        // Focus first option when opening
        resultsContainer.querySelector('[role="option"]')?.focus();
      }
    }

    function selectCategory(slug, label) {
      selectedCategory = slug;
      // Update the display button text
      displayBtn.textContent = label;
      displayBtn.setAttribute('aria-expanded', 'false');
      resultsContainer.hidden = true;

      // Update aria-selected for all options
      resultsContainer.querySelectorAll('[role="option"]').forEach(opt => {
        opt.setAttribute('aria-selected', opt.getAttribute('data-slug') === slug ? 'true' : 'false');
      });

      // Trigger catalog search if available
      const searchBtn = document.getElementById('catalog-search');
      if (searchBtn) {
        // Store the selected category in the window state if app.js has it
        if (window.state && typeof window.state === 'object') {
          window.state.restaurantFilter = slug;
        }
        // Trigger search
        searchBtn.click();
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadRestaurantCategories);
  } else {
    loadRestaurantCategories();
  }

  // Expose for debugging
  window.CIRCULA_CATEGORIES = {
    getSelected: () => selectedCategory,
    getCategories: () => restaurantCategories
  };
})();

