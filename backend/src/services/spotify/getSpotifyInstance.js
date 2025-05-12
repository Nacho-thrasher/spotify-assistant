/**
 * Helper para obtener instancias de SpotifyAPI por usuario
 * Centraliza las llamadas al spotifyManager
 */

const spotifyManager = require('./spotifyManager');

/**
 * Obtiene una instancia de Spotify API para el usuario especificado en la solicitud
 * @param {Object} req - Objeto de solicitud Express
 * @returns {Promise<Object>} - Instancia de SpotifyWebApi para el usuario
 */
const getSpotifyForRequest = async (req) => {
  // Obtener userId con prioridad para el valor asignado por el middleware
  const userId = req.userId || 
                 req.user?.id || 
                 req.session?.userId || 
                 req.headers['user-id'] || 
                 'guest';
                 
  console.log(`Obteniendo instancia de Spotify para usuario: ${userId}`);
  return await spotifyManager.getInstance(userId);
};

module.exports = getSpotifyForRequest;
