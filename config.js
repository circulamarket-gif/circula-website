/* Dirección pública del servidor de CIRCULA. No pongas tokens ni contraseñas aquí. */
window.CIRCULA_CONFIG = {
  // Para desarrollo local: 'http://127.0.0.1:5000/api/v1'
  // Para producción: usar URL HTTPS real del servidor
  apiBaseUrl: 'https://api.circulamarket.com/api/v1',
  chatApiBaseUrl: 'https://api.circulamarket.com/api/v1',
  storageMode: 'server-managed',
  demoMode: false,
  appDownloadUrl: '',
  appReleaseVersion: ''
};

// Nota: apiBaseUrl y chatApiBaseUrl deben apuntar al MISMO servidor del bot.
// Para pruebas locales sin internet: apiBaseUrl: 'http://127.0.0.1:5000/api/v1'
// Sirve la web por HTTP y autoriza únicamente su origen exacto en CIRCULA_API_CORS.
