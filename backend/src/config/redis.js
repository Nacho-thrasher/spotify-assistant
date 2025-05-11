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

// Crear cliente de Redis
const redisClient = new Redis(redisConfig);

// Manejar errores de conexión
redisClient.on('error', (err) => {
  console.error('Error en conexión Redis:', err);
});

// Mensaje cuando la conexión es exitosa
redisClient.on('connect', () => {
  console.log('✅ Conexión exitosa a Redis');
});

// Exportar el cliente y métodos útiles
module.exports = {
  redisClient,
  // Tiempo de expiración por defecto: 1 hora (en segundos)
  DEFAULT_EXPIRATION: 60 * 60,
  // Métodos asíncronos
  getAsync: async (key) => {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.error('Error al obtener de Redis:', err);
      return null;
    }
  },
  setAsync: async (key, value, expireTime = null) => {
    try {
      const stringValue = JSON.stringify(value);
      if (expireTime) {
        await redisClient.set(key, stringValue, 'EX', expireTime);
      } else {
        await redisClient.set(key, stringValue);
      }
      return true;
    } catch (err) {
      console.error('Error al guardar en Redis:', err);
      return false;
    }
  },
  deleteAsync: async (key) => {
    try {
      await redisClient.del(key);
      return true;
    } catch (err) {
      console.error('Error al eliminar de Redis:', err);
      return false;
    }
  }
};
