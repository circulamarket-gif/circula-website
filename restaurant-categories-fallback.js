// Fallback categories for restaurants when API is unavailable
window.CIRCULA_RESTAURANT_CATEGORIES = [
  { slug: 'comidas_rapidas', nombre: '🍟 Comidas rápidas', emoji: '🍟' },
  { slug: 'comida_colombiana', nombre: '🍲 Comida colombiana', emoji: '🍲' },
  { slug: 'brazas_carbon', nombre: '🔥 Brazas y carbón', emoji: '🔥' },
  { slug: 'pizza', nombre: '🍕 Pizzería', emoji: '🍕' },
  { slug: 'pasta', nombre: '🍝 Pasta', emoji: '🍝' },
  { slug: 'asiatica', nombre: '🥢 Asiática', emoji: '🥢' },
  { slug: 'oriental', nombre: '🥟 Oriental', emoji: '🥟' },
  { slug: 'hamburguesas', nombre: '🍔 Hamburguesas', emoji: '🍔' },
  { slug: 'sandwich', nombre: '🥪 Sándwich', emoji: '🥪' },
  { slug: 'desayuno', nombre: '🥐 Desayuno', emoji: '🥐' },
  { slug: 'postres', nombre: '🍰 Postres y repostería', emoji: '🍰' },
  { slug: 'cafe', nombre: '☕ Café y bebidas', emoji: '☕' },
  { slug: 'mariscos', nombre: '🦐 Mariscos', emoji: '🦐' },
  { slug: 'vegetariano', nombre: '🥗 Vegetariano/Vegano', emoji: '🥗' },
  { slug: 'parrilla', nombre: '🍗 Parrilla', emoji: '🍗' },
  { slug: 'arepa', nombre: '🫓 Arepería', emoji: '🫓' }
];

// Store in window for easy access in restaurant-categories.js
if (!window.CIRCULA_RESTAURANT_CATEGORIES_LOADED) {
  window.CIRCULA_RESTAURANT_CATEGORIES_LOADED = true;
}
