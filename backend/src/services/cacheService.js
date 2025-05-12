/**
 * Servicio para gestionar el caché de datos utilizando Redis
 * Implementa patrones para reducir solicitudes a APIs externas
 * y optimizar el uso de memoria
 */

const { 
  redisClient, 
  getAsync, 
  setAsync, 
  deleteAsync,
  getTTL,
  renewExpiry,
  KEY_PREFIXES,
  EXPIRATION_TIMES: REDIS_EXPIRATION_TIMES
} = require('../config/redis');

// Prefijos para diferentes tipos de recursos en caché
const CACHE_PREFIXES = {
  SPOTIFY_NOW_PLAYING: `${KEY_PREFIXES.CACHE}spotify:now-playing:`,
  SPOTIFY_QUEUE: `${KEY_PREFIXES.CACHE}spotify:queue:`,
  SPOTIFY_SEARCH: `${KEY_PREFIXES.CACHE}spotify:search:`,
  SPOTIFY_RECOMMENDATIONS: `${KEY_PREFIXES.CACHE}spotify:recommendations:`,
  SPOTIFY_ARTIST_INFO: `${KEY_PREFIXES.CACHE}spotify:artist:`,
  SPOTIFY_ALBUM_INFO: `${KEY_PREFIXES.CACHE}spotify:album:`,
  SPOTIFY_TRACK_INFO: `${KEY_PREFIXES.CACHE}spotify:track:`
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

// Estadísticas de caché para monitoreo
let cacheStats = {
  hits: 0,
  misses: 0,
  errors: 0,
  lastReset: Date.now()
};

/**
 * Determina el tiempo de expiración más adecuado según el prefijo de la clave
 * @param {string} cacheKey - Clave a analizar
 * @param {number|null} customExpireTime - Tiempo personalizado (opcional)
 * @returns {number} - Tiempo de expiración en segundos
 */
const determineExpireTime = (cacheKey, customExpireTime = null) => {
  // Si hay un tiempo personalizado, usarlo
  if (customExpireTime) return customExpireTime;
  
  // Determinar tiempo por tipo de datos
  if (cacheKey.includes(CACHE_PREFIXES.SPOTIFY_NOW_PLAYING)) {
    return EXPIRATION_TIMES.NOW_PLAYING;
  }
  if (cacheKey.includes(CACHE_PREFIXES.SPOTIFY_QUEUE)) {
    return EXPIRATION_TIMES.QUEUE;
  }
  if (cacheKey.includes(CACHE_PREFIXES.SPOTIFY_SEARCH)) {
    return EXPIRATION_TIMES.SEARCH_RESULTS;
  }
  if (cacheKey.includes(CACHE_PREFIXES.SPOTIFY_RECOMMENDATIONS)) {
    return EXPIRATION_TIMES.RECOMMENDATIONS;
  }
  if (cacheKey.includes(CACHE_PREFIXES.SPOTIFY_ARTIST_INFO)) {
    return EXPIRATION_TIMES.ARTIST_INFO;
  }
  if (cacheKey.includes(CACHE_PREFIXES.SPOTIFY_ALBUM_INFO)) {
    return EXPIRATION_TIMES.ALBUM_INFO;
  }
  if (cacheKey.includes(CACHE_PREFIXES.SPOTIFY_TRACK_INFO)) {
    return EXPIRATION_TIMES.TRACK_INFO;
  }
  
  // Valor predeterminado para otros tipos
  return REDIS_EXPIRATION_TIMES.CACHE_MEDIUM;
};

/**
 * Función genérica para obtener datos con caché
 * @param {string} cacheKey - Clave para el caché
 * @param {Function} fetchFunction - Función asíncrona que obtiene los datos si no están en caché
 * @param {number} expireTime - Tiempo de expiración en segundos (opcional)
 * @param {Object} options - Opciones adicionales (opcional)
 * @returns {Promise<any>} - Datos del caché o de la función de obtención
 */
const getCachedData = async (
  cacheKey, 
  fetchFunction, 
  expireTime = null,
  options = { refreshIfOld: false, maxAge: null }
) => {
  try {
    // 1. Intentar obtener del caché
    const cachedData = await getAsync(cacheKey);
    
    // 2. Si hay datos en caché, verificar si necesitan actualización
    if (cachedData) {
      cacheStats.hits++;
      
      // Si se solicitó refrescar datos antiguos y se especificó maxAge
      if (options.refreshIfOld && options.maxAge) {
        const ttl = await getTTL(cacheKey);
        const totalLifespan = determineExpireTime(cacheKey, expireTime);
        const age = totalLifespan - ttl;
        
        // Si los datos son más antiguos que maxAge pero aún válidos, refrescarlos en background
        if (age > options.maxAge) {
          console.log(`🔄 Datos en caché antiguos (${age}s), refrescando en background`);
          
          // Actualizar en background sin bloquear
          setTimeout(async () => {
            try {
              const freshData = await fetchFunction();
              if (freshData) {
                await setAsync(cacheKey, freshData, determineExpireTime(cacheKey, expireTime));
                console.log(`✅ Datos refrescados en background para ${cacheKey}`);
              }
            } catch (err) {
              console.error(`Error al refrescar datos en background: ${err.message}`);
            }
          }, 0);
        }
      }
      
      console.log(`✅ CACHE HIT para ${cacheKey}`);
      return cachedData;
    }
    
    // 3. Si no hay caché, obtener datos frescos
    console.log(`❌ CACHE MISS para ${cacheKey}`);
    cacheStats.misses++;
    const freshData = await fetchFunction();
    
    // 4. Guardar en caché para futuras solicitudes
    if (freshData) {
      await setAsync(cacheKey, freshData, determineExpireTime(cacheKey, expireTime));
    }
    
    return freshData;
  } catch (error) {
    cacheStats.errors++;
    console.error(`Error en getCachedData para ${cacheKey}:`, error);
    
    // En caso de error, intentar ejecutar la función de obtención directamente
    try {
      return await fetchFunction();
    } catch (fetchError) {
      console.error(`Error al obtener datos frescos: ${fetchError.message}`);
      throw fetchError; // Propagar el error si no podemos recuperarnos
    }
  }
};

/**
 * Invalida una clave específica de caché
 * @param {string} cacheKey - Clave a invalidar
 */
const invalidateCache = async (cacheKey) => {
  try {
    await deleteAsync(cacheKey);
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

/**
 * Refresca el tiempo de expiración de una clave sin cambiar su contenido
 * @param {string} cacheKey - Clave a refrescar
 * @param {number} expireTime - Nuevo tiempo de expiración (opcional)
 */
const refreshCacheTTL = async (cacheKey, expireTime = null) => {
  try {
    const ttl = determineExpireTime(cacheKey, expireTime);
    await renewExpiry(cacheKey, ttl);
    return true;
  } catch (error) {
    console.error(`Error al refrescar TTL para ${cacheKey}:`, error);
    return false;
  }
};

/**
 * Obtiene estadísticas sobre el uso del caché
 */
const getCacheStats = () => {
  const stats = { ...cacheStats };
  
  // Calcular ratio de efectividad
  const totalRequests = stats.hits + stats.misses;
  stats.hitRatio = totalRequests > 0 ? (stats.hits / totalRequests) : 0;
  stats.effectivenessPercent = Math.round(stats.hitRatio * 100);
  
  // Añadir tiempo en ejecución
  stats.uptime = Math.round((Date.now() - stats.lastReset) / 1000);
  
  return stats;
};

/**
 * Reinicia las estadísticas de caché
 */
const resetCacheStats = () => {
  cacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
    lastReset: Date.now()
  };
  return true;
};

// Exportar componentes del servicio
module.exports = {
  CACHE_PREFIXES,
  EXPIRATION_TIMES,
  getCachedData,
  invalidateCache,
  invalidateCacheByPrefix,
  refreshCacheTTL,
  getCacheStats,
  resetCacheStats
};
