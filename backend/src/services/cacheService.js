/**
 * Servicio para gestionar el caché de datos utilizando Redis
 * Implementa patrones para reducir solicitudes a APIs externas
 */

const { redisClient, getAsync, setAsync, DEFAULT_EXPIRATION } = require('../config/redis');

// Prefijos para diferentes tipos de recursos en caché
const CACHE_PREFIXES = {
  SPOTIFY_NOW_PLAYING: 'spotify:now-playing:',
  SPOTIFY_QUEUE: 'spotify:queue:',
  SPOTIFY_SEARCH: 'spotify:search:',
  SPOTIFY_RECOMMENDATIONS: 'spotify:recommendations:',
  SPOTIFY_ARTIST_INFO: 'spotify:artist:',
  SPOTIFY_ALBUM_INFO: 'spotify:album:',
  SPOTIFY_TRACK_INFO: 'spotify:track:'
};

// Tiempos de expiración personalizados para diferentes tipos de datos (en segundos)
const EXPIRATION_TIMES = {
  NOW_PLAYING: 10,          // La reproducción actual cambia rápidamente
  QUEUE: 15,                // La cola puede cambiar con frecuencia
  SEARCH_RESULTS: 60 * 30,  // Los resultados de búsqueda cambian con menos frecuencia
  RECOMMENDATIONS: 60 * 60, // Las recomendaciones pueden mantenerse por más tiempo
  ARTIST_INFO: 60 * 60 * 24, // Información del artista raramente cambia
  ALBUM_INFO: 60 * 60 * 24,  // Información del álbum raramente cambia
  TRACK_INFO: 60 * 60 * 24   // Información de la pista raramente cambia
};

/**
 * Función genérica para obtener datos con caché
 * @param {string} cacheKey - Clave para el caché
 * @param {Function} fetchFunction - Función asíncrona que obtiene los datos si no están en caché
 * @param {number} expireTime - Tiempo de expiración en segundos
 * @returns {Promise<any>} - Datos del caché o de la función de obtención
 */
const getCachedData = async (cacheKey, fetchFunction, expireTime = DEFAULT_EXPIRATION) => {
  try {
    // 1. Intentar obtener del caché
    const cachedData = await getAsync(cacheKey);
    
    // 2. Si hay datos en caché, devolverlos
    if (cachedData) {
      console.log(`✅ CACHE HIT para ${cacheKey}`);
      return cachedData;
    }
    
    // 3. Si no hay caché, obtener datos frescos
    console.log(`❌ CACHE MISS para ${cacheKey}`);
    const freshData = await fetchFunction();
    
    // 4. Guardar en caché para futuras solicitudes
    if (freshData) {
      await setAsync(cacheKey, freshData, expireTime);
    }
    
    return freshData;
  } catch (error) {
    console.error(`Error en getCachedData para ${cacheKey}:`, error);
    // En caso de error, intentar ejecutar la función de obtención directamente
    return await fetchFunction();
  }
};

/**
 * Invalida una clave específica de caché
 * @param {string} cacheKey - Clave a invalidar
 */
const invalidateCache = async (cacheKey) => {
  try {
    await redisClient.del(cacheKey);
    console.log(`🗑️ Caché invalidado para: ${cacheKey}`);
    return true;
  } catch (error) {
    console.error(`Error al invalidar caché para ${cacheKey}:`, error);
    return false;
  }
};

/**
 * Invalida todas las claves que comienzan con un prefijo específico
 * @param {string} prefix - Prefijo para las claves a invalidar
 */
const invalidateCacheByPrefix = async (prefix) => {
  try {
    // Encontrar todas las claves que coinciden con el patrón
    const keys = await redisClient.keys(`${prefix}*`);
    
    if (keys.length > 0) {
      // Eliminar todas las claves encontradas
      await redisClient.del(...keys);
      console.log(`🗑️ Caché invalidado para ${keys.length} claves con prefijo ${prefix}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error al invalidar caché con prefijo ${prefix}:`, error);
    return false;
  }
};

module.exports = {
  CACHE_PREFIXES,
  EXPIRATION_TIMES,
  getCachedData,
  invalidateCache,
  invalidateCacheByPrefix
};
