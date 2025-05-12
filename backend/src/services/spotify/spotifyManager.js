/**
 * Administrador de instancias de SpotifyAPI por usuario
 * Mantiene una instancia separada para cada usuario, asegurando aislamiento de datos
 */

const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();
const { redisClient } = require('../../config/redis');

// En entorno de producción usamos la URL hardcodeada para evitar problemas con variables de entorno
const isProduction = process.env.NODE_ENV === 'production';
const redirectUri = isProduction 
  ? 'https://spotify-assistant-production.up.railway.app/api/auth/callback'
  : process.env.SPOTIFY_REDIRECT_URI;

// Cache de instancias de SpotifyAPI por usuario (en memoria)
// Estructura: Map<userId, {api: SpotifyWebApi, lastUsed: timestamp}>
const spotifyInstances = new Map();

// Configuración para la gestión de memoria
const MEMORY_CONFIG = {
  // Tiempo máximo de inactividad para una instancia (4 horas en ms)
  MAX_INSTANCE_IDLE_TIME: 4 * 60 * 60 * 1000,
  // Intervalo de limpieza de instancias (30 minutos en ms)
  CLEANUP_INTERVAL: 30 * 60 * 1000,
  // Máximo de instancias en memoria antes de forzar limpieza
  MAX_INSTANCES: 100
};

/**
 * Actualiza la marca de tiempo para una instancia indicando su último uso
 */
const touchInstance = (userId) => {
  if (spotifyInstances.has(userId)) {
    const instance = spotifyInstances.get(userId);
    instance.lastUsed = Date.now();
    spotifyInstances.set(userId, instance);
  }
};

/**
 * Limpia instancias inactivas según configuración
 */
const cleanupInstances = () => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [userId, instance] of spotifyInstances.entries()) {
    const idleTime = now - instance.lastUsed;
    if (idleTime > MEMORY_CONFIG.MAX_INSTANCE_IDLE_TIME) {
      spotifyInstances.delete(userId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Limpieza periódica: ${cleanedCount} instancias de Spotify eliminadas por inactividad`);
    console.log(`📊 Instancias activas restantes: ${spotifyInstances.size}`);
  }
};

// Iniciar limpieza periódica
const cleanupInterval = setInterval(cleanupInstances, MEMORY_CONFIG.CLEANUP_INTERVAL);

// Asegurar que el intervalo no impida que Node.js termine
cleanupInterval.unref();

/**
 * Guarda tokens de Spotify en Redis para un usuario específico
 */
const saveTokensToRedis = async (userId, accessToken, refreshToken, expiresIn) => {
  try {
    const tokenData = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + (expiresIn * 1000) // Convertir segundos a milisegundos
    };
    
    await redisClient.set(`spotify_tokens:${userId}`, JSON.stringify(tokenData));
    console.log(`Tokens guardados en Redis para usuario ${userId}`);
    return true;
  } catch (error) {
    console.error('Error al guardar tokens en Redis:', error);
    return false;
  }
};

/**
 * Obtiene tokens de Spotify desde Redis para un usuario específico
 */
const getTokensFromRedis = async (userId) => {
  try {
    const tokenData = await redisClient.get(`spotify_tokens:${userId}`);
    if (!tokenData) return null;
    
    return JSON.parse(tokenData);
  } catch (error) {
    console.error('Error al obtener tokens de Redis:', error);
    return null;
  }
};

/**
 * Crea una nueva instancia de SpotifyAPI con las credenciales básicas
 */
const createSpotifyInstance = () => {
  return new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri
  });
};

/**
 * Obtiene una instancia de SpotifyAPI para un usuario específico
 * Si no existe, crea una nueva y la inicializa con sus tokens si están disponibles
 */
const getSpotifyApiForUser = async (userId) => {
  // Si ya existe una instancia en memoria, la actualizamos y devolvemos
  if (spotifyInstances.has(userId)) {
    touchInstance(userId); // Actualizar timestamp de último uso
    return spotifyInstances.get(userId).api;
  }
  
  // Verificar si estamos sobre el límite de instancias y forzar limpieza si es necesario
  if (spotifyInstances.size >= MEMORY_CONFIG.MAX_INSTANCES) {
    console.log(`⚠️ Alcanzado límite de instancias (${MEMORY_CONFIG.MAX_INSTANCES}). Forzando limpieza...`);
    cleanupInstances();
    
    // Si seguimos sobre el límite, eliminar la instancia menos usada
    if (spotifyInstances.size >= MEMORY_CONFIG.MAX_INSTANCES) {
      let oldestUserId = null;
      let oldestTime = Date.now();
      
      for (const [id, instance] of spotifyInstances.entries()) {
        if (instance.lastUsed < oldestTime) {
          oldestTime = instance.lastUsed;
          oldestUserId = id;
        }
      }
      
      if (oldestUserId) {
        spotifyInstances.delete(oldestUserId);
        console.log(`🗑️ Eliminada instancia más antigua: ${oldestUserId}`);
      }
    }
  }
  
  // Crear nueva instancia
  const spotifyApi = createSpotifyInstance();
  
  // Intentar recuperar tokens desde Redis
  const tokens = await getTokensFromRedis(userId);
  if (tokens) {
    console.log(`Restaurando tokens para usuario ${userId}`);
    spotifyApi.setAccessToken(tokens.accessToken);
    spotifyApi.setRefreshToken(tokens.refreshToken);
  }
  
  // Guardar la instancia en memoria con timestamp
  spotifyInstances.set(userId, {
    api: spotifyApi,
    lastUsed: Date.now()
  });
  
  console.log(`📊 Instancias activas: ${spotifyInstances.size}`);
  return spotifyApi;
};

/**
 * Guarda los tokens para un usuario específico y actualiza su instancia
 */
const setUserTokens = async (userId, accessToken, refreshToken, expiresIn) => {
  try {
    // Guardar en Redis
    await saveTokensToRedis(userId, accessToken, refreshToken, expiresIn);
    
    // Actualizar la instancia en memoria si existe
    if (spotifyInstances.has(userId)) {
      const instance = spotifyInstances.get(userId);
      instance.api.setAccessToken(accessToken);
      instance.api.setRefreshToken(refreshToken);
      instance.lastUsed = Date.now(); // Actualizar timestamp
      spotifyInstances.set(userId, instance);
    } else {
      // Crear nueva instancia si no existe
      const spotifyApi = createSpotifyInstance();
      spotifyApi.setAccessToken(accessToken);
      spotifyApi.setRefreshToken(refreshToken);
      
      spotifyInstances.set(userId, {
        api: spotifyApi,
        lastUsed: Date.now()
      });
    }
    
    console.log(`Tokens actualizados para usuario ${userId}`);
    return true;
  } catch (error) {
    console.error('Error al establecer tokens de usuario:', error);
    return false;
  }
};

/**
 * Intenta renovar el access token usando el refresh token 
 * @returns {boolean} true si se renovó exitosamente, false en caso contrario
 */
const refreshUserTokens = async (userId) => {
  try {
    // Verificar si tenemos instancia para este usuario
    if (!spotifyInstances.has(userId)) {
      // Intentar recuperar desde Redis
      const tokens = await getTokensFromRedis(userId);
      if (!tokens || !tokens.refreshToken) {
        console.error(`No hay refresh token para usuario ${userId}`);
        return false;
      }
      
      // Crear instancia con el refresh token
      const spotifyApi = createSpotifyInstance();
      spotifyApi.setRefreshToken(tokens.refreshToken);
      
      spotifyInstances.set(userId, {
        api: spotifyApi,
        lastUsed: Date.now()
      });
    }
    
    // Obtener instancia y actualizar timestamp
    const instance = spotifyInstances.get(userId);
    const spotifyApi = instance.api;
    instance.lastUsed = Date.now();
    
    // Intentar renovar token
    try {
      const data = await spotifyApi.refreshAccessToken();
      const { access_token, expires_in } = data.body;
      
      console.log(`Token renovado para usuario ${userId}, expira en ${expires_in} segundos`);
      
      // Actualizar tokens
      spotifyApi.setAccessToken(access_token);
      
      // Guardar en Redis (manteniendo el mismo refresh token)
      const tokens = await getTokensFromRedis(userId);
      if (tokens && tokens.refreshToken) {
        await saveTokensToRedis(userId, access_token, tokens.refreshToken, expires_in);
      }
      
      return true;
    } catch (refreshError) {
      // Si el error es específicamente invalid_grant, limpiar los tokens
      if (refreshError.message && refreshError.message.includes('invalid_grant')) {
        console.error(`⚠️ Refresh token inválido para usuario ${userId}. Limpiando datos...`);
        await clearUserInstance(userId);
        // Devolver un código específico para manejar este caso en la UI
        return { error: 'invalid_grant', message: 'La sesión ha expirado. Por favor, inicia sesión nuevamente.' };
      }
      throw refreshError; // Re-lanzar otros errores
    }
  } catch (error) {
    console.error(`Error al renovar token para usuario ${userId}:`, error);
    return false;
  }
};

/**
 * Limpia la instancia de un usuario (logout)
 */
const clearUserInstance = async (userId) => {
  // Eliminar de memoria
  spotifyInstances.delete(userId);
  
  // Eliminar de Redis
  await redisClient.del(`spotify_tokens:${userId}`);
  
  console.log(`Instancia y tokens eliminados para usuario ${userId}`);
};

// Este objeto es compatible con la API original
// pero proporciona una "fachada" (facade) que aisla por usuario
const spotifyApiProxy = {
  // Método para obtener una instancia de Spotify para el usuario actual
  async getInstance(userId) {
    return await getSpotifyApiForUser(userId);
  },
  
  // Crea una instancia temporal con un token de acceso (sin persistencia)
  async createTempInstance(accessToken) {
    const spotifyApi = createSpotifyInstance();
    spotifyApi.setAccessToken(accessToken);
    return spotifyApi;
  },
  
  // Setters para mantener la compatibilidad con código existente
  async setTokensForUser(userId, accessToken, refreshToken, expiresIn) {
    return await setUserTokens(userId, accessToken, refreshToken, expiresIn);
  },
  
  // Para la redirección de autenticación inicial (no necesita usuario)
  createAuthorizeURL(scopes) {
    const spotifyApi = createSpotifyInstance();
    return spotifyApi.createAuthorizeURL(scopes, 'some-state');
  },
  
  // Para el intercambio de código por tokens (paso de autenticación)
  async authorizationCodeGrant(code) {
    const spotifyApi = createSpotifyInstance();
    return await spotifyApi.authorizationCodeGrant(code);
  },
  
  // Para renovar tokens
  async refreshAccessTokenForUser(userId) {
    return await refreshUserTokens(userId);
  },
  
  // Para limpiar datos de usuario (logout)
  async clearUser(userId) {
    await clearUserInstance(userId);
  },
  
  // Exponer función para obtener tokens desde Redis
  async getTokensFromRedis(userId) {
    return await getTokensFromRedis(userId);
  }
};

// Exponer función de limpieza para pruebas o control manual
spotifyApiProxy.cleanupInactiveInstances = cleanupInstances;

// Exponer función para estadísticas
spotifyApiProxy.getInstancesCount = () => spotifyInstances.size;

module.exports = spotifyApiProxy;
