/**
 * Utility para comunicarse con la API de Spotify
 * Implementación de métodos comunes reusables
 */

// Reemplazar instancia global por el administrador de instancias
const spotifyManager = require('./spotifyManager');
const { redisClient } = require('../../config/redis');

/**
 * Obtiene la cola de reproducción directamente usando fetch
 * @param {Object} spotifyApi - Instancia de la API de Spotify
 * @returns {Promise<Object>} - Información de la cola actual
 */
const getQueue = async (spotifyApi) => {
  // El SDK no tiene un método para esto, usar fetch
  const token = spotifyApi.getAccessToken();
  if (!token) {
    throw new Error('No hay token disponible para obtener cola');
  }

  try {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch('https://api.spotify.com/v1/me/player/queue', { headers });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(`Token inválido o expirado (401)`);
      }
      if (response.status === 404) {
        throw new Error(`No hay dispositivo activo (404)`);
      }
      throw new Error(`Error al obtener cola: ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error obteniendo cola:', error.message);
    throw error;
  }
};

/**
 * Busca en Spotify y devuelve los mejores resultados
 * @param {Object} spotifyApi - Instancia de la API de Spotify
 * @param {string} query - Términos de búsqueda
 * @param {string} type - Tipo de resultados (track, artist, album, playlist, etc)
 * @param {number} limit - Cantidad máxima de resultados
 * @returns {Promise<Array>} - Resultados de la búsqueda
 */
const search = async (spotifyApi, query, type = 'track', limit = 5) => {
  try {
    const result = await spotifyApi.search(query, [type], { limit });
    return result.body;
  } catch (error) {
    console.error(`Error buscando "${query}":`, error.message);
    throw error;
  }
};

/**
 * Comprueba si hay un dispositivo activo
 * @param {Object} spotifyApi - Instancia API de Spotify
 * @returns {Promise<boolean>} - True si hay un dispositivo activo
 */
const hasActiveDevice = async (spotifyApi) => {
  try {
    const devices = await spotifyApi.getMyDevices();
    return devices.body.devices.some(device => device.is_active);
  } catch (error) {
    console.error('Error al comprobar dispositivos:', error.message);
    return false;
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
    
    console.log(`Verificando sesión de Spotify para usuario: ${userId || 'instancia directa'}`);
    
    // Si no se proporcionó una instancia, obtenerla del manager usando el ID de usuario
    if (!spotifyApi && userId) {
      console.log(`Obteniendo instancia de Spotify para usuario: ${userId}`);
      spotifyApi = await spotifyManager.getInstance(userId);
    } else if (!spotifyApi) {
      throw new Error('Se requiere una instancia de SpotifyAPI o un ID de usuario');
    }
    
    // Si no tenemos userId pero tenemos instancia, intentar obtener su ID desde Redis
    if (!effectiveUserId && spotifyApi) {
      console.log('Buscando userId asociado al token actual...');
      // Buscar en todas las instancias disponibles en el manager
      // Este es un enfoque simple - en una implementación más robusta podríamos tener un mapa inverso
      const allKeys = await redisClient.keys('spotify_tokens:*');
      const currentAccessToken = spotifyApi.getAccessToken();
      
      console.log(`Encontradas ${allKeys.length} claves de tokens en Redis`);
      
      for (const key of allKeys) {
        try {
          const tokensStr = await redisClient.get(key);
          if (!tokensStr) continue;
          
          const tokens = JSON.parse(tokensStr);
          if (tokens && tokens.accessToken === currentAccessToken) {
            effectiveUserId = key.split(':')[1]; // Extraer el ID de la clave
            console.log(`Identificado userId "${effectiveUserId}" para la instancia de Spotify por coincidencia de token`);
            break;
          }
        } catch (err) {
          console.error(`Error al procesar clave ${key}:`, err.message);
        }
      }
    }
    
    // Verificar que la instancia tenga un token de acceso
    const accessToken = spotifyApi.getAccessToken();
    if (!accessToken) {
      console.error('No hay token de acceso disponible para:', effectiveUserId || 'usuario desconocido');
      return false;
    }
    
    console.log(`Verificando token para ${effectiveUserId || 'usuario desconocido'}...`);
    
    // Intentar hacer una petición simple para verificar que el token sea válido
    try {
      // Usamos una llamada ligera, que no consuma mucho ancho de banda
      await spotifyApi.getMe();
      console.log(`Token válido para ${effectiveUserId || 'usuario desconocido'}`);
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
            console.log(`Intentando renovar token para ${effectiveUserId} usando manager...`);
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
          console.log('Intentando renovación directa del token...');
          try {
            const refreshToken = spotifyApi.getRefreshToken();
            if (!refreshToken) {
              console.error('No hay refresh token disponible para renovación directa');
              return false;
            }
            
            console.log('Llamando a refreshAccessToken...');
            const data = await spotifyApi.refreshAccessToken();
            const { access_token, expires_in } = data.body;
            
            console.log('Token renovado correctamente, actualizando instancia...');
            // Actualizar el token en la instancia
            spotifyApi.setAccessToken(access_token);
            
            // También guardar en Redis si tenemos el userId
            if (effectiveUserId) {
              try {
                console.log(`Guardando token renovado en Redis para ${effectiveUserId}`);
                const tokensStr = await redisClient.get(`spotify_tokens:${effectiveUserId}`);
                if (tokensStr) {
                  const tokens = JSON.parse(tokensStr);
                  if (tokens && tokens.refreshToken) {
                    await redisClient.set(`spotify_tokens:${effectiveUserId}`, JSON.stringify({
                      accessToken: access_token,
                      refreshToken: tokens.refreshToken,
                      expiresAt: Date.now() + expires_in * 1000
                    }));
                    console.log(`Token actualizado en Redis para ${effectiveUserId}`);
                  }
                }
              } catch (redisError) {
                console.error(`Error al guardar token en Redis para ${effectiveUserId}:`, redisError.message);
                // Continuamos aunque falle el guardado en Redis
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
  getQueue,
  search,
  hasActiveDevice,
  verifySpotifySession
};
