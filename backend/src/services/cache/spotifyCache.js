/**
 * Servicio de caché para la API de Spotify
 * Reduce las llamadas a la API y mejora los tiempos de respuesta
 */
const { redisClient, getAsync, setAsync, DEFAULT_EXPIRATION } = require('../../config/redis');

// Duración de caché para diferentes tipos de datos (en segundos)
const CACHE_DURATIONS = {
  // Datos que cambian con frecuencia
  PLAYBACK_STATE: parseInt(process.env.CACHE_TTL_SHORT) || 60, // 1 minuto por defecto
  QUEUE: parseInt(process.env.CACHE_TTL_SHORT) || 60,
  // Datos semi-estáticos
  ARTIST_INFO: parseInt(process.env.CACHE_TTL_MEDIUM) || 1800, // 30 minutos por defecto
  TRACK_INFO: parseInt(process.env.CACHE_TTL_MEDIUM) || 1800, 
  // Datos más estáticos
  PLAYLISTS: parseInt(process.env.CACHE_TTL_LONG) || 3600, // 1 hora por defecto
  SEARCH_RESULTS: parseInt(process.env.CACHE_TTL_MEDIUM) || 1800,
};

/**
 * Genera una clave única para la caché basada en el tipo y parámetros
 * @param {string} type - Tipo de datos (playback, search, etc)
 * @param {string} userId - ID del usuario
 * @param {Object} params - Parámetros adicionales
 * @returns {string} - Clave única para Redis
 */
const generateCacheKey = (type, userId, params = {}) => {
  let key = `spotify:${type}:${userId}`;
  
  // Añadir parámetros adicionales a la clave si existen
  if (Object.keys(params).length > 0) {
    const paramsString = Object.entries(params)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // Ordenar para consistencia
      .map(([k, v]) => `${k}:${v}`)
      .join(':');
    key += `:${paramsString}`;
  }
  
  return key;
};

/**
 * Obtiene datos en caché o ejecuta la función para obtenerlos y almacenarlos
 * @param {string} type - Tipo de datos (playback, search, etc)
 * @param {string} userId - ID del usuario
 * @param {Function} fetchFunction - Función asíncrona que obtiene los datos si no están en caché
 * @param {Object} params - Parámetros adicionales para la clave
 * @param {number} customTTL - Tiempo de vida personalizado (opcional)
 * @returns {Promise<any>} - Datos obtenidos
 */
const getCachedData = async (type, userId, fetchFunction, params = {}, customTTL = null) => {
  try {
    // Generar clave para Redis
    const cacheKey = generateCacheKey(type, userId, params);
    
    // Intentar obtener de la caché primero
    const cachedData = await getAsync(cacheKey);
    
    if (cachedData) {
      console.log(`🔄 Spotify Cache: Usando datos en caché para ${type}`);
      return cachedData;
    }
    
    // Si no está en caché, obtener datos frescos
    console.log(`🔄 Spotify Cache: Obteniendo datos frescos para ${type}`);
    const freshData = await fetchFunction();
    
    // Determinar tiempo de vida para estos datos
    const ttl = customTTL || CACHE_DURATIONS[type.toUpperCase()] || DEFAULT_EXPIRATION;
    
    // Guardar en caché para futuros usos
    await setAsync(cacheKey, freshData, ttl);
    
    return freshData;
  } catch (error) {
    console.error(`❌ Error en caché de Spotify (${type}):`, error);
    // Ante error, intentar ejecutar la función directamente
    return await fetchFunction();
  }
};

/**
 * Invalida la caché para un tipo específico o para todas las entradas de un usuario
 * @param {string} type - Tipo de datos (playback, search, etc)
 * @param {string} userId - ID del usuario
 * @param {Object} params - Parámetros adicionales (opcional)
 */
const invalidateCache = async (type, userId, params = {}) => {
  try {
    if (!type) {
      // Invalida todas las entradas del usuario
      const pattern = `spotify:*:${userId}*`;
      const keys = await redisClient.keys(pattern);
      
      if (keys.length > 0) {
        await redisClient.del(...keys);
        console.log(`🧹 Caché limpiada para usuario ${userId}: ${keys.length} entradas`);
      }
    } else {
      // Invalida sólo un tipo específico
      const cacheKey = generateCacheKey(type, userId, params);
      await redisClient.del(cacheKey);
      console.log(`🧹 Caché invalidada: ${cacheKey}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error al invalidar caché:', error);
    return false;
  }
};

module.exports = {
  getCachedData,
  invalidateCache,
  CACHE_DURATIONS
};
