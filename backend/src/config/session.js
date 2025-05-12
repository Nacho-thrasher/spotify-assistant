/**
 * Configuración de sesiones con almacenamiento en Redis
 * Proporciona persistencia, escalabilidad y mejor rendimiento
 */
const session = require('express-session');

// Importar el cliente Redis
const { redisClient } = require('./redis');

/**
 * Configura el middleware de sesiones para Express
 * Usa Redis para almacenamiento si está disponible, con fallback a memoria
 * @param {Object} app - La aplicación Express
 */
const configureSession = (app) => {
  try {
    // Configuración base de las sesiones optimizada para entornos cloud
    const sessionConfig = {
      secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'spotify_assistant_secret_key',
      resave: true, // Cambiado a true para garantizar persistencia en entornos como Railway
      saveUninitialized: true, // Guardar todas las sesiones para mayor consistencia
      name: 'spotify.sid',
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Permitir cross-site en producción
        maxAge: 1000 * 60 * 60 * 24 * 30, // Extendido a 30 días para mayor persistencia
        path: '/' // Asegurar que la cookie esté disponible en toda la aplicación
      },
      // Usar proxy para que las cookies seguras funcionen detrás de proxies como Railway
      proxy: process.env.NODE_ENV === 'production'
    };
    
    // Verificar el estado de Redis directo por su status y ping
    const redisIsReady = redisClient && 
                         (redisClient.status === 'ready' || 
                          redisClient.status === 'connect');

    // Método secundario: intentar un comando simple
    let redisIsConnected = false;
    if (redisIsReady) {
      try {
        // Intentar un PING a Redis para confirmar conectividad
        redisClient.ping(); // Redis responde a PING de forma síncrona
        redisIsConnected = true;
      } catch (pingError) {
        console.warn('⚠️ Redis ping falló:', pingError.message);
        redisIsConnected = false;
      }
    }
    
    // Si Redis no está disponible, usar memoria
    if (!redisIsReady || !redisIsConnected) {
      app.use(session(sessionConfig));
      console.log('🔒 Sesiones configuradas con almacenamiento en memoria');
      
      // Configurar un listener para cuando Redis se conecte posteriormente
      if (redisClient) {
        redisClient.on('ready', () => {
          console.log('✅ Redis ahora está disponible, pero las sesiones siguen en memoria');
          console.log('   Reinicia la aplicación para usar Redis para sesiones');
        });
      }
      return;
    }
    
    // Redis está disponible, configurar connect-redis
    console.log('✅ Redis detectado y disponible para sesiones');
    
    // Cargar connect-redis de forma segura
    const connectRedis = require('connect-redis');
    
    // Compatibilidad con diferentes versiones de connect-redis
    let RedisStore;
    if (typeof connectRedis === 'function') {
      // connect-redis v6.x (estilo antiguo)
      RedisStore = connectRedis(session);
    } else if (connectRedis.default) {
      // connect-redis v7.x/v8.x (estilo nuevo)
      RedisStore = connectRedis.default;
    } else {
      throw new Error('Versión de connect-redis no compatible');
    }
    
    try {
      // Crear el almacén de Redis con manejo de errores
      const redisStore = new RedisStore({
        client: redisClient,
        prefix: 'spotify_session:',
        // Para versiones recientes usamos ttl en segundos
        ttl: Math.floor(sessionConfig.cookie.maxAge / 1000),
        // No registrar conexiones duplicadas
        disableTouch: false,
        // Configuración adicional para estabilidad
        disableTTL: false,
      });
      
      // Verificar que se creó correctamente
      if (!redisStore) {
        throw new Error('No se pudo crear el almacén RedisStore');
      }
      
      // Añadir el almacén de Redis a la configuración de sesiones
      sessionConfig.store = redisStore;
      
      // Aplicar el middleware de sesiones
      app.use(session(sessionConfig));
      console.log('🔒 Sesiones configuradas correctamente con almacenamiento en Redis');
      console.log(`   • Prefijo: spotify_session:`);
      console.log(`   • TTL: ${Math.floor(sessionConfig.cookie.maxAge / 1000)} segundos`);
      
      // Registrar eventos de error de Redis para debugging
      redisClient.on('error', (error) => {
        console.error('❌ Error en la conexión Redis para sesiones:', error);
      });
    } catch (storeError) {
      console.error('❌ Error al configurar RedisStore:', storeError);
      console.log('⚠️ Fallback: Usando almacenamiento en memoria para sesiones');
      
      // En caso de error, usar sesiones en memoria como fallback
      app.use(session(sessionConfig));
    }
    
  } catch (error) {
    console.error('❌ Error al configurar las sesiones con Redis:', error);
    console.log('⚠️ Fallback: Usando almacenamiento en memoria para sesiones');
    
    // Si hay un error, usar sesiones en memoria como fallback
    app.use(session({
      secret: process.env.SESSION_SECRET || 'spotify_assistant_secret_key',
      resave: false,
      saveUninitialized: false
    }));
  }
};

module.exports = configureSession;
