/**
 * Esta función implementa el sistema de recomendaciones con IA 
 * ya que el endpoint original de Spotify está deprecado
 */
const { getAIRecommendations } = require('./ai_recommendations');

/**
 * Esta función implementa el sistema de recomendaciones con métodos alternativos
 * @param {Object} spotifyApi - Instancia del API de Spotify con caché
 * @param {Object} parameters - Parámetros de recomendación
 * @param {Object} playbackContext - Contexto de reproducción actual
 * @param {string} userId - ID del usuario
 * @returns {Object} Recomendaciones obtenidas
 */
async function processRecommendations(spotifyApi, parameters, playbackContext, userId) {
  console.log('🎶 SPOTIFY: Generando recomendaciones musicales alternativas');
  console.log('Parámetros recibidos:', parameters);

  // Verificar que tenemos un userId válido
  if (!userId) {
    console.warn('⚠️ ADVERTENCIA: No hay userId para recomendaciones, usando token de acceso como alternativa');
    // Usar el accessToken como alternativa (ya que puede estar configurado en spotifyApi)
    if (spotifyApi.getAccessToken()) {
      userId = spotifyApi.getAccessToken().substring(0, 15); // Usar parte del token como ID
      console.log('Usando accessToken como userId alternativo');
    } else {
      console.error('⚠️ ERROR: No hay ni userId ni accessToken para recomendaciones');
      return {
        success: false,
        error: 'No se pueden obtener recomendaciones. Por favor, inicia sesión nuevamente con Spotify.'
      };
    }
  }

  // Verificamos que el spotifyApi tenga userId configurado correctamente
  if (!spotifyApi.userId) {
    console.log('⚠️ Configurando userId en spotifyApi:', userId);
    spotifyApi.userId = userId;
  }

  try {
    // Usar el nuevo sistema de recomendaciones basado en IA en lugar del endpoint deprecado
    const result = await getAIRecommendations(spotifyApi, parameters, playbackContext, userId);
    
    return result;
  } catch (error) {
    console.error('⚠️ ERROR: Fallo general en recomendaciones:', error.message || error);
    return {
      success: false,
      error: 'Error al obtener recomendaciones: ' + (error.message || 'Error desconocido')
    };
  }
}

module.exports = {
  processRecommendations
};
