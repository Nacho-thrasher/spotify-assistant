/**
 * Helper para obtener instancias de SpotifyAPI por usuario
 * Centraliza las llamadas al spotifyManager y maneja casos de usuarios sin token
 */

const spotifyManager = require('./spotifyManager');
const { redisClient } = require('../../config/redis');

/**
 * Verifica si un usuario tiene tokens de autenticación en Redis
 * @param {string} userId - ID del usuario a verificar
 * @returns {Promise<boolean>} - true si el usuario tiene tokens, false si no
 */
const hasValidTokens = async (userId) => {
  try {
    const tokenData = await redisClient.get(`spotify_tokens:${userId}`);
    if (!tokenData) return false;
    
    const tokens = JSON.parse(tokenData);
    // Verificar que existan tanto el access token como el refresh token
    return Boolean(tokens.accessToken && tokens.refreshToken);
  } catch (error) {
    console.error(`Error al verificar tokens para usuario ${userId}:`, error);
    return false;
  }
};

/**
 * Obtiene una instancia de Spotify API para el usuario especificado en la solicitud
 * @param {Object} req - Objeto de solicitud Express
 * @param {boolean} requireAuth - Si es true, lanzará un error si el usuario no tiene tokens
 * @returns {Promise<Object>} - Instancia de SpotifyWebApi para el usuario
 * @throws {Error} - Si requireAuth es true y el usuario no tiene tokens válidos
 */
const getSpotifyForRequest = async (req, requireAuth = true) => {
  // Obtener userId con prioridad para el valor asignado por el middleware
  const userId = req.userId || 
                 req.user?.id || 
                 req.session?.userId || 
                 req.headers['user-id'] || 
                 'guest';
                 
  console.log(`Obteniendo instancia de Spotify para usuario: ${userId}`);
  
  // Verificar si el usuario tiene tokens antes de intentar usar la API
  if (requireAuth && !(await hasValidTokens(userId))) {
    throw new Error(`Usuario ${userId} no autenticado con Spotify. Se requiere iniciar sesión.`);
  }
  
  return await spotifyManager.getInstance(userId);
};

module.exports = getSpotifyForRequest;
