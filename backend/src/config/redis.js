const Redis = require('ioredis');
const { promisify } = require('util');

// Configuración de conexión, lee de variables de entorno o usa valores por defecto
let redisConfig;

// Si hay un URL completo de Redis
if (process.env.REDIS_URL) {
  console.log(`🔄 Conectando a Redis usando URL: ${process.env.REDIS_URL}`);
  redisConfig = process.env.REDIS_URL;
} else {
  // Configuración detallada para conexión local
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
    // Tiempo de reconexión en ms
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  };
}

// Configuración de tiempos de expiración (en segundos)
const EXPIRATION_TIMES = {
  // Tiempo de expiración por defecto: 1 hora
  DEFAULT: 60 * 60,
  // Tiempos específicos por tipo de datos
  SESSION: 7 * 24 * 60 * 60, // Sesiones: 7 días
  TOKEN: 30 * 24 * 60 * 60,  // Tokens: 30 días
  CACHE_SHORT: 5 * 60,       // Caché de corta duración: 5 minutos
  CACHE_MEDIUM: 60 * 60,     // Caché de media duración: 1 hora
  CACHE_LONG: 24 * 60 * 60,  // Caché de larga duración: 1 día
};

// Prefijos para diferentes tipos de datos
const KEY_PREFIXES = {
  SESSION: 'session:',
  TOKENS: 'spotify_tokens:',
  CACHE: 'cache:',
  PLAYBACK: 'playback:',
  USER: 'user:'
};

// Variables para monitoreo y estado
let redisIsConnected = false;
let redisIsReady = false;
let lastHealthCheck = null;
let keysCount = 0;

// Crear cliente de Redis
const redisClient = new Redis(redisConfig);

// Manejar errores de conexión
redisClient.on('error', (err) => {
  console.error('Error en conexión Redis:', err);
  redisIsConnected = false;
});

// Mensaje cuando la conexión es exitosa
redisClient.on('connect', () => {
  console.log('✅ Conexión exitosa a Redis');
  redisIsConnected = true;
});

// Cuando el cliente está listo
redisClient.on('ready', () => {
  console.log('✅ Cliente Redis listo para recibir comandos');
  redisIsReady = true;
  
  // Realizar comprobación de salud inicial
  performHealthCheck();
});

// Cuando se cierra la conexión
redisClient.on('close', () => {
  console.log('❌ Conexión a Redis cerrada');
  redisIsConnected = false;
  redisIsReady = false;
});

/**
 * Realiza una verificación de salud del sistema Redis
 * - Comprueba el número de claves
 * - Verifica el uso de memoria
 */
async function performHealthCheck() {
  if (!redisIsConnected || !redisIsReady) return;
  
  try {
    // Obtener estadísticas de Redis
    const info = await redisClient.info();
    const keyspace = await redisClient.info('keyspace');
    
    // Análisis básico de uso de memoria
    const memoryMatch = info.match(/used_memory_human:(.+?)\r\n/);
    const memory = memoryMatch ? memoryMatch[1].trim() : 'N/A';
    
    // Análisis de claves
    const dbMatch = keyspace.match(/db0:keys=(\d+),expires=(\d+)/);
    if (dbMatch) {
      const totalKeys = parseInt(dbMatch[1]);
      const keysWithExpiry = parseInt(dbMatch[2]);
      const keysWithoutExpiry = totalKeys - keysWithExpiry;
      
      keysCount = totalKeys;
      
      console.log(`📊 Redis: ${totalKeys} claves totales, ${keysWithoutExpiry} sin expiración`);
      console.log(`💾 Redis: Memoria utilizada ${memory}`);
      
      // Alerta si hay muchas claves sin expiración
      if (keysWithoutExpiry > 100) {
        console.warn(`⚠️ Redis: Detectadas ${keysWithoutExpiry} claves sin tiempo de expiración`);
      }
    }
    
    lastHealthCheck = Date.now();
  } catch (error) {
    console.error('Error al realizar health check de Redis:', error);
  }
}

// Programar verificación de salud periódica (cada 30 minutos)
const healthCheckInterval = setInterval(performHealthCheck, 30 * 60 * 1000);
healthCheckInterval.unref(); // No bloquear la terminación de Node.js

/**
 * Determina el tiempo de expiración más adecuado basado en el tipo de clave
 * @param {string} key - Clave a analizar
 * @param {number|null} requestedExpiry - Tiempo de expiración solicitado
 * @returns {number} - Tiempo de expiración en segundos
 */
function determineExpiry(key, requestedExpiry = null) {
  // Si se especifica un tiempo de expiración, usarlo
  if (requestedExpiry) return requestedExpiry;
  
  // Determinar expiración basada en prefijo
  if (key.startsWith(KEY_PREFIXES.SESSION)) return EXPIRATION_TIMES.SESSION;
  if (key.startsWith(KEY_PREFIXES.TOKENS)) return EXPIRATION_TIMES.TOKEN;
  if (key.startsWith(KEY_PREFIXES.PLAYBACK)) return EXPIRATION_TIMES.CACHE_SHORT;
  if (key.startsWith(KEY_PREFIXES.CACHE)) return EXPIRATION_TIMES.CACHE_MEDIUM;
  
  // Tiempo predeterminado
  return EXPIRATION_TIMES.DEFAULT;
}

// Métodos asíncronos mejorados
const getAsync = async (key) => {
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error('Error al obtener de Redis:', err);
    return null;
  }
};

/**
 * Guarda un valor en Redis con tiempo de expiración obligatorio
 * @param {string} key - Clave a guardar
 * @param {any} value - Valor a guardar
 * @param {number|null} expireTime - Tiempo de expiración en segundos
 * @returns {Promise<boolean>} - True si se guardó correctamente
 */
const setAsync = async (key, value, expireTime = null) => {
  try {
    const stringValue = JSON.stringify(value);
    
    // Determinar tiempo de expiración apropiado
    const ttl = determineExpiry(key, expireTime);
    
    // Siempre usar EX para garantizar que todas las claves tengan expiración
    await redisClient.set(key, stringValue, 'EX', ttl);
    
    return true;
  } catch (err) {
    console.error('Error al guardar en Redis:', err);
    return false;
  }
};

/**
 * Elimina una clave de Redis
 */
const deleteAsync = async (key) => {
  try {
    await redisClient.del(key);
    return true;
  } catch (err) {
    console.error('Error al eliminar de Redis:', err);
    return false;
  }
};

/**
 * Obtiene el tiempo de vida restante de una clave en segundos
 * @param {string} key - Clave a consultar
 * @returns {Promise<number>} - Segundos restantes, 0 si no existe o no tiene TTL
 */
const getTTL = async (key) => {
  try {
    const ttl = await redisClient.ttl(key);
    return ttl > 0 ? ttl : 0;
  } catch (err) {
    console.error('Error al obtener TTL de Redis:', err);
    return 0;
  }
};

/**
 * Renueva el tiempo de expiración de una clave
 * @param {string} key - Clave a renovar
 * @param {number|null} expireTime - Nuevo tiempo de expiración
 * @returns {Promise<boolean>} - True si se renovó correctamente
 */
const renewExpiry = async (key, expireTime = null) => {
  try {
    // Determinar tiempo de expiración apropiado
    const ttl = determineExpiry(key, expireTime);
    
    // Establecer nueva expiración
    await redisClient.expire(key, ttl);
    return true;
  } catch (err) {
    console.error('Error al renovar expiración en Redis:', err);
    return false;
  }
};

/**
 * Obtiene información sobre el número de claves en Redis
 * @returns {Promise<Object>} - Estadísticas de claves
 */
const getKeysStats = async () => {
  if (!redisIsConnected || !redisIsReady) {
    return { error: 'Redis no está conectado' };
  }
  
  try {
    // Actualizar conteo si no está reciente
    if (!lastHealthCheck || Date.now() - lastHealthCheck > 60000) {
      await performHealthCheck();
    }
    
    return {
      totalKeys: keysCount,
      lastCheck: lastHealthCheck
    };
  } catch (error) {
    console.error('Error al obtener estadísticas de claves:', error);
    return { error: 'Error al obtener estadísticas' };
  }
};

// Exportar el cliente y métodos útiles
module.exports = {
  redisClient,
  redisIsConnected: () => redisIsConnected,
  redisIsReady: () => redisIsReady,
  // Constantes de configuración
  DEFAULT_EXPIRATION: EXPIRATION_TIMES.DEFAULT,
  EXPIRATION_TIMES,
  KEY_PREFIXES,
  // Métodos básicos
  getAsync,
  setAsync,
  deleteAsync,
  // Métodos adicionales
  getTTL,
  renewExpiry,
  getKeysStats,
  performHealthCheck
};
