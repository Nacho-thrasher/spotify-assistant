const http = require('http');
const { redisClient } = require('./config/redis');
const { initializeSocketServer } = require('./services/socket');
const PORT = process.env.PORT || 8080;

/**
 * Inicializa el servidor después de verificar que Redis esté disponible
 */
async function startServer() {
  try {
    // Esperar a que Redis esté disponible antes de iniciar la aplicación
    await waitForRedis();
    
    // Importar app después de confirmar que Redis está listo
    const app = require('./app');
    
    // Crear servidor HTTP a partir de la app Express
    const server = http.createServer(app);
    
    // Inicializar Socket.io con el servidor HTTP
    const io = initializeSocketServer(server);
    
    // Hacer disponible io globalmente para poder usarlo desde otros módulos
    global.io = io;
    
    // Iniciar servidor
    server.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
      console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log('Socket.io inicializado correctamente');
    });
    
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

/**
 * Espera a que Redis esté disponible antes de continuar
 * @returns {Promise} - Resuelve cuando Redis está conectado
 */

/**
 * Espera a que Redis esté disponible antes de continuar
 * @returns {Promise} - Resuelve cuando Redis está conectado
 */
async function waitForRedis() {
  console.log('🔄 Verificando conexión a Redis...');
  
  // Si Redis ya está conectado, continuar inmediatamente
  if (redisClient && redisClient.status === 'ready') {
    console.log('✅ Redis ya está conectado');
    return Promise.resolve();
  }
  
  // Si no está conectado, esperar el evento 'ready'
  return new Promise((resolve) => {
    // Timeout para no esperar indefinidamente
    const timeout = setTimeout(() => {
      console.warn('⚠️ Tiempo de espera para Redis agotado, continuando sin Redis');
      resolve();
    }, 5000); // 5 segundos máximo de espera
    
    // Si Redis emite 'ready', resolver la promesa
    if (redisClient) {
      redisClient.once('ready', () => {
        clearTimeout(timeout);
        console.log('✅ Redis conectado correctamente');
        resolve();
      });
      
      // Si hay un error, continuar de todas formas
      redisClient.once('error', (err) => {
        clearTimeout(timeout);
        console.warn('⚠️ Error al conectar a Redis:', err.message);
        resolve(); // Continuar de todas formas
      });
    } else {
      clearTimeout(timeout);
      console.warn('⚠️ Cliente Redis no inicializado');
      resolve();
    }
  });
}

// Iniciar el servidor
startServer();
