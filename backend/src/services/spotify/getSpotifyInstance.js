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
 * Además, verifica que el token sea válido y lo renueva si es necesario
 * @param {Object} req - Objeto de solicitud Express
 * @param {boolean} requireAuth - Si es true, lanzará un error si el usuario no tiene tokens
 * @param {boolean} verifyToken - Si es true, verificará y renovará el token automáticamente
 * @returns {Promise<Object>} - Instancia de SpotifyWebApi para el usuario
 * @throws {Error} - Si requireAuth es true y el usuario no tiene tokens válidos
 */
const getSpotifyForRequest = async (req, requireAuth = true, verifyToken = true) => {
  try {
    // PRIORIDAD 1: Buscar primero el ID real de Spotify (solución ideal)
    const spotifyUserId = req.session?.spotifyUserId || 
                          (req.signedCookies && req.signedCookies.spotifyUserId) ||
                          (req.cookies && req.cookies.spotifyUserId);
    
    // PRIORIDAD 2: Usar el userId asignado por el middleware (que ya tiene prioridad para Spotify ID)
    const userId = req.userId || 
                  req.user?.id || 
                  req.session?.userId || 
                  (req.signedCookies && req.signedCookies.userId) ||
                  (req.cookies && req.cookies.userId) ||
                  req.headers['user-id'] || 
                  'guest';
    
    // Usar el ID de Spotify si está disponible, de lo contrario usar el ID local
    const effectiveUserId = spotifyUserId || userId;
                  
    console.log(`Obteniendo instancia de Spotify para usuario: ${effectiveUserId}`);
    if (spotifyUserId) {
      console.log(`(Usando ID real de Spotify)`); 
    }
    
    // Verificar si el usuario tiene tokens antes de intentar usar la API
    if (requireAuth && !(await hasValidTokens(effectiveUserId))) {
      console.error(`Error: Usuario ${effectiveUserId} no tiene tokens válidos`);
      throw new Error(`Usuario ${effectiveUserId} no autenticado con Spotify. Se requiere iniciar sesión.`);
    }
    
    // Obtener la instancia de API
    const spotifyApi = await spotifyManager.getInstance(effectiveUserId);
    
    // Verificar y renovar token si es necesario
    if (verifyToken && spotifyApi) {
      try {
        // Importar helper de forma dinámica para evitar dependencia circular
        const spotifyHelpers = require('./spotifyHelpers');
        const isValid = await spotifyHelpers.verifySpotifySession(spotifyApi, effectiveUserId);
        
        if (!isValid) {
          console.error(`Token inválido para usuario ${effectiveUserId} y no se pudo renovar`);
          if (requireAuth) {
            throw new Error(`Sesión de Spotify expirada para ${effectiveUserId}. Se requiere iniciar sesión nuevamente.`);
          }
          // Si no requerimos autenticación, simplemente retornamos null
          return null;
        }
      } catch (verifyError) {
        console.error(`Error verificando sesión para ${effectiveUserId}:`, verifyError.message);
        if (requireAuth) throw verifyError;
        return null;
      }
    }
    
    return spotifyApi;
  } catch (error) {
    console.error(`Error en getSpotifyForRequest:`, error.message);
    if (requireAuth) throw error;
    return null;
  }
};

module.exports = getSpotifyForRequest;
