/**
 * Utilidades para trabajar con la API de Spotify
 * Incluye funciones para manejo de autenticación y peticiones
 */

const spotifyApi = require('../../config/spotify');

/**
 * Obtiene la cola de reproducción directamente usando fetch
 * La biblioteca spotify-web-api-node no implementa este método
 * @param {boolean} refreshTokenIfNeeded - Si se debe intentar refrescar el token en caso de error 401
 * @returns {Promise<Object>} - Datos de la cola
 */
const getSpotifyQueue = async (refreshTokenIfNeeded = true) => {
  try {
    // Obtener el token de acceso actual
    const accessToken = spotifyApi.getAccessToken();
    
    if (!accessToken) {
      throw new Error('No hay token de acceso disponible');
    }
    
    // Hacer solicitud HTTP directa
    const response = await fetch('https://api.spotify.com/v1/me/player/queue', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Si el token expiró y debemos refrescar
    if (response.status === 401 && refreshTokenIfNeeded) {
      console.log('🔄 Token de Spotify expirado, intentando refrescar...');
      
      // Refrescar token
      try {
        await spotifyApi.refreshAccessToken();
        console.log('✅ Token refrescado con éxito, reintentando petición');
        
        // Reintentar con token refrescado (sin volver a intentar refrescar para evitar bucles)
        return await getSpotifyQueue(false);
      } catch (refreshError) {
        console.error('❌ Error al refrescar token:', refreshError);
        throw new Error('No se pudo refrescar el token de acceso');
      }
    }
    
    // Si hay otros errores
    if (!response.ok) {
      throw new Error(`Error en respuesta de Spotify: ${response.status} - ${await response.text()}`);
    }
    
    // Convertir respuesta a JSON
    return await response.json();
  } catch (error) {
    console.error('Error al obtener cola de Spotify:', error);
    throw error;
  }
};

/**
 * Verifica el estado de la sesión de Spotify y refresca el token si es necesario
 * @returns {Promise<boolean>} - true si la sesión es válida
 */
const verifySpotifySession = async () => {
  try {
    // Intentar una operación simple para verificar sesión
    const currentUser = await spotifyApi.getMe();
    return true;
  } catch (error) {
    // Si el error es 401, intentar refrescar el token
    if (error.statusCode === 401) {
      try {
        await spotifyApi.refreshAccessToken();
        console.log('✅ Token refrescado automáticamente');
        return true;
      } catch (refreshError) {
        console.error('❌ Error al refrescar token:', refreshError);
        return false;
      }
    }
    
    console.error('❌ Error al verificar sesión de Spotify:', error);
    return false;
  }
};

module.exports = {
  getSpotifyQueue,
  verifySpotifySession
};
