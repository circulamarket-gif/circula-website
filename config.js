/* Dirección pública del servidor de CIRCULA. No pongas tokens ni contraseñas aquí. */
window.CIRCULA_CONFIG = {
  // Para desarrollo local: 'http://127.0.0.1:5000/api/v1'
  // Web: https://circulamarket.com y https://www.circulamarket.com.
  // La API es un servicio separado; verificar su DNS y disponibilidad.
  apiBaseUrl: 'https://api.circulamarket.com/api/v1',
  chatApiBaseUrl: 'https://api.circulamarket.com/api/v1',
  telegramBotUrl: 'https://t.me/CIRCULAMarketbot',
  storageMode: 'server-managed',
  demoMode: false,
  appLandingUrl: 'https://circulamarket.com/#descargas',
  appDownloadUrl: 'https://drive.google.com/uc?export=download&id=1bXHLwFuPX_-JRJJlzNEQgWO4dutZ-NLg',
  appDownloadParts: [],
  appDownloadFilename: 'CirculaM.apk',
  appReleaseVersion: '0.1.2'
};

// Nota: apiBaseUrl y chatApiBaseUrl deben apuntar al MISMO servidor del bot.
// Para pruebas locales sin internet: apiBaseUrl: 'http://127.0.0.1:5000/api/v1'
// Autoriza en CIRCULA_API_CORS los orígenes web exactos que estén en uso.
