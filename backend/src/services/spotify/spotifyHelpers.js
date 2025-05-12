/**
 * Utilidades para trabajar con la API de Spotify
 * Incluye funciones para manejo de autenticación y peticiones
 */

// Reemplazar instancia global por el administrador de instancias
const spotifyManager = require('./spotifyManager');
const { redisClient } = require('../../config/redis');

/**
 * Obtiene la cola de reproducción directamente usando fetch
 * La biblioteca spotify-web-api-node no implementa este método
 * @param {Object} spotifyApiInstance - Instancia de la API de Spotify a usar
 * @param {string} userId - ID del usuario (sólo necesario si no se proporciona spotifyApiInstance)
 * @param {boolean} refreshTokenIfNeeded - Si se debe intentar refrescar el token en caso de error 401
 * @returns {Promise<Object>} - Datos de la cola
 */
const getSpotifyQueue = async (spotifyApiInstance = null, userId = null, refreshTokenIfNeeded = true) => {
  try {
    // Obtener la instancia de API a usar
    let spotifyApi = spotifyApiInstance;
    
    // Si no se proporcionó una instancia, obtenerla del manager usando el ID de usuario
    if (!spotifyApi && userId) {
      spotifyApi = await spotifyManager.getInstance(userId);
    } else if (!spotifyApi) {
      throw new Error('Se requiere una instancia de SpotifyAPI o un ID de usuario');
    }
    
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
        if (userId) {
          // Si tenemos el ID del usuario, usar el método del manager
          await spotifyManager.refreshAccessTokenForUser(userId);
          // Obtener la instancia actualizada
          spotifyApi = await spotifyManager.getInstance(userId);
        } else {
          // Si tenemos la instancia directamente
          await spotifyApi.refreshAccessToken();
        }
        
        console.log('✅ Token refrescado con éxito, reintentando petición');
        
        // Reintentar con token refrescado (sin volver a intentar refrescar para evitar bucles)
        return await getSpotifyQueue(spotifyApi, userId, false);
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
 * Verifica y asegura que la sesión de Spotify es válida
 * Si es necesario, actualiza el token de acceso
 * @param {Object} spotifyApiInstance - Instancia de la API de Spotify a verificar
 * @param {string} userId - ID del usuario (sólo necesario si no se proporciona spotifyApiInstance)
 * @returns {Promise<boolean>} - true si la sesión es válida, false en caso contrario
 */
const verifySpotifySession = async (spotifyApiInstance = null, userId = null) => {
  try {
    // Obtener la instancia de API a usar
    let spotifyApi = spotifyApiInstance;
    let effectiveUserId = userId;
    
    // Si no se proporcionó una instancia, obtenerla del manager usando el ID de usuario
    if (!spotifyApi && userId) {
      spotifyApi = await spotifyManager.getInstance(userId);
    } else if (!spotifyApi) {
      throw new Error('Se requiere una instancia de SpotifyAPI o un ID de usuario');
    }
    
    // Si no tenemos userId pero tenemos instancia, intentar obtener su ID desde Redis
    if (!effectiveUserId && spotifyApi) {
      // Buscar en todas las instancias disponibles en el manager
      // Este es un enfoque simple - en una implementación más robusta podríamos tener un mapa inverso
      const allKeys = await redisClient.keys('spotify_tokens:*');
      for (const key of allKeys) {
        const tokens = JSON.parse(await redisClient.get(key));
        const currentAccessToken = spotifyApi.getAccessToken();
        if (tokens && tokens.accessToken === currentAccessToken) {
          effectiveUserId = key.split(':')[1]; // Extraer el ID de la clave
          console.log(`Identificado userId "${effectiveUserId}" para la instancia de Spotify por coincidencia de token`);
          break;
        }
      }
    }
    
    // Verificar que la instancia tenga un token de acceso
    const accessToken = spotifyApi.getAccessToken();
    if (!accessToken) {
      console.error('No hay token de acceso disponible para:', effectiveUserId || 'usuario desconocido');
      return false;
    }
    
    // Intentar hacer una petición simple para verificar que el token sea válido
    try {
      // Usamos una llamada ligera, que no consuma mucho ancho de banda
      await spotifyApi.getMe();
      return true; // Si llega aquí, el token es válido
    } catch (apiError) {
      // Si el error es por token expirado (401), intentamos renovarlo
      if (apiError.statusCode === 401) {
        console.log(`Token expirado para ${effectiveUserId || 'usuario desconocido'}, intentando renovar...`);
        
        // Intentar renovar con ambos métodos para maximizar éxito
        let renewed = false;
        
        // Método 1: Intentar renovar usando el manager centralizado (si tenemos userId)
        if (effectiveUserId) {
          try {
            renewed = await spotifyManager.refreshAccessTokenForUser(effectiveUserId);
            if (renewed) {
              console.log(`Token renovado exitosamente para ${effectiveUserId} usando manager`);
              // Actualizar la instancia con el nuevo token
              spotifyApi = await spotifyManager.getInstance(effectiveUserId);
              return true;
            }
          } catch (err) {
            console.error(`Error al renovar token para ${effectiveUserId} con manager:`, err.message);
          }
        }
        
        // Método 2: Intentar renovar directamente si el manager falló o no teníamos userId
        if (!renewed) {
          try {
            const refreshToken = spotifyApi.getRefreshToken();
            if (!refreshToken) {
              console.error('No hay refresh token disponible para renovación directa');
              return false;
            }
            
            const data = await spotifyApi.refreshAccessToken();
            const { access_token, expires_in } = data.body;
            
            // Actualizar el token en la instancia
            spotifyApi.setAccessToken(access_token);
            
            // También guardar en Redis si tenemos el userId
            if (effectiveUserId) {
              const tokens = JSON.parse(await redisClient.get(`spotify_tokens:${effectiveUserId}`));
              if (tokens && tokens.refreshToken) {
                await redisClient.set(`spotify_tokens:${effectiveUserId}`, JSON.stringify({
                  accessToken: access_token,
                  refreshToken: tokens.refreshToken,
                  expiresAt: Date.now() + expires_in * 1000
                }));
              }
            }
            
            console.log('Token renovado exitosamente usando método directo');
            return true;
          } catch (refreshError) {
            console.error('Error al renovar token con método directo:', refreshError.message);
            return false;
          }
        }
        
        return renewed;
      } else {
        // Cualquier otro error de API
        console.error('Error al verificar sesión de Spotify:', apiError.message);
        return false;
      }
    }
  } catch (error) {
    console.error('Error general al verificar sesión de Spotify:', error.message);
    return false;
  }
};

module.exports = {
  getSpotifyQueue,
  verifySpotifySession
};
