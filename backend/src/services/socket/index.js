/**
 * Servicio de Socket.io para comunicación en tiempo real
 */
const { Server } = require('socket.io');
const { processMessage, registerUserCorrection } = require('../ai/openai');
const spotifyManager = require('../spotify/spotifyManager');

// Estructura para almacenar conexiones activas con metadatos
// userId -> { socketId, lastActivity, connection: timestamp }
const connectedUsers = new Map();

// Configuración para gestión de conexiones
const CONNECTION_CONFIG = {
  // Tiempo máximo de inactividad antes de considerar una conexión como "zombi" (2 horas)
  MAX_INACTIVE_TIME: 2 * 60 * 60 * 1000,
  // Intervalo de verificación de conexiones (15 minutos)
  CLEANUP_INTERVAL: 15 * 60 * 1000
};

/**
 * Verifica y elimina conexiones zombi (inactivas por mucho tiempo)
 * @param {Object} io - Instancia de Socket.io
 */
function cleanupConnections(io) {
  const now = Date.now();
  let removedCount = 0;
  
  for (const [userId, userInfo] of connectedUsers.entries()) {
    const inactiveTime = now - userInfo.lastActivity;
    
    if (inactiveTime > CONNECTION_CONFIG.MAX_INACTIVE_TIME) {
      // Verificar si el socket realmente está conectado
      const socketId = userInfo.socketId;
      const socket = io.sockets.sockets.get(socketId);
      
      if (!socket || !socket.connected) {
        connectedUsers.delete(userId);
        removedCount++;
      } else {
        // Si el socket está conectado, pero inactivo, actualizar el timestamp
        // para evitar eliminar conexiones que siguen activas pero sin actividad
        userInfo.lastActivity = now;
        connectedUsers.set(userId, userInfo);
      }
    }
  }
  
  if (removedCount > 0) {
    console.log(`🧹 Socket: Eliminadas ${removedCount} conexiones inactivas`);
    console.log(`📊 Socket: Conexiones activas: ${connectedUsers.size}`);
  }
}

/**
 * Actualiza el timestamp de actividad para un usuario
 * @param {string} userId - ID del usuario
 */
function updateUserActivity(userId) {
  if (connectedUsers.has(userId)) {
    const userInfo = connectedUsers.get(userId);
    userInfo.lastActivity = Date.now();
    connectedUsers.set(userId, userInfo);
  }
}

/**
 * Configura e inicializa el servidor Socket.io
 * @param {Object} httpServer - Servidor HTTP de Express
 * @returns {Object} - Instancia de Socket.io
 */
function initializeSocketServer(httpServer) {
  // Configuración con CORS para desarrollo
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Configurar pingTimeout para detectar desconexiones más rápido
    pingTimeout: 20000,
    pingInterval: 25000
  });

  // Middleware para autenticación (se puede expandir más adelante)
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('No token provided'));
    }
    // Aquí se podría verificar el token JWT
    // Por ahora lo usamos solo como identificador
    socket.userId = token;
    next();
  });

  // Manejar conexiones de clientes
  io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.userId}`);
    
    // Guardar información de la conexión con timestamp
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      lastActivity: Date.now(),
      connected: Date.now()
    });
    
    console.log(`📊 Socket: Conexiones activas: ${connectedUsers.size}`);

    // Evento para recibir mensajes del asistente
    socket.on('assistant_message', (data) => {
      console.log(`Mensaje recibido de ${socket.userId}:`, data.message);
      
      // Actualizar última actividad
      updateUserActivity(socket.userId);
      
      // Aquí iría la lógica para procesar el mensaje y responder
      // Por ejemplo, enviar a OpenAI, procesar comandos, etc.
    });
    
    // Manejar mensajes del cliente
    socket.on('message', async (data) => {
      try {
        const message = data.message;
        console.log(`Mensaje para procesar de ${socket.userId}:`, message);
        
        // Actualizar última actividad
        updateUserActivity(socket.userId);
        
        // Procesar el mensaje con el contexto de reproducción si está disponible
        const response = await processMessage(message, data.playbackContext, socket.userId);
        
        // Enviar respuesta al cliente
        socket.emit('assistant_response', {
          message: response.message,
          action: response.action,
          parameters: response.parameters,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error al procesar mensaje:', error);
        socket.emit('assistant_response', {
          message: 'Lo siento, ha ocurrido un error al procesar tu mensaje.',
          action: 'error',
          parameters: {},
          timestamp: Date.now()
        });
      }
    });
    
    // Manejar feedback del usuario
    socket.on('user_feedback', (data) => {
      const { originalMessage, originalAction, feedbackType } = data;
      console.log(`📝 Feedback recibido: ${feedbackType} para "${originalMessage}" (${originalAction})`);
      
      // Aquí podríamos registrar el feedback positivo si quisiéramos
      // Por ahora solo registramos las correcciones explícitas
    });
    
    // Manejar correcciones del usuario
    socket.on('user_correction', async (data) => {
      const { originalMessage, originalAction, correctedAction, correctedParameters } = data;
      
      console.log(`🔄 Corrección recibida:`);
      console.log(`   • Mensaje original: "${originalMessage}"`);
      console.log(`   • Acción detectada: ${originalAction}`);
      console.log(`   • Acción corregida: ${correctedAction}`);
      
      try {
        // Registrar la corrección para aprendizaje
        await registerUserCorrection(
          socket.userId || 'anonymous',
          originalMessage,
          originalAction,
          correctedAction,
          correctedParameters
        );
        
        // Opcionalmente, ejecutar la acción corregida inmediatamente
        if (correctedAction && correctedAction !== originalAction) {
          // Aquí iría la lógica para ejecutar la acción corregida
          // Por ejemplo, obtener la API de Spotify y ejecutar la acción
          
          socket.emit('action_result', {
            success: true,
            message: `Corrección registrada: ${correctedAction}`,
            action: correctedAction,
            originalMessage
          });
        }
      } catch (error) {
        console.error('Error al procesar corrección:', error);
        socket.emit('action_result', {
          success: false,
          message: 'Error al procesar la corrección',
          error: error.message
        });
      }
    });
    
    // Actualizar actividad en cada evento de ping (mantener conexión viva)
    socket.on('ping', () => {
      updateUserActivity(socket.userId);
    });

    // Manejar desconexiones
    socket.on('disconnect', () => {
      console.log(`Usuario desconectado: ${socket.userId}`);
      connectedUsers.delete(socket.userId);
      console.log(`📊 Socket: Conexiones activas después de desconexión: ${connectedUsers.size}`);
    });
  });
  
  // Iniciar limpieza periódica de conexiones
  const interval = setInterval(() => {
    cleanupConnections(io);
  }, CONNECTION_CONFIG.CLEANUP_INTERVAL);
  
  // Asegurar que el intervalo no impida que Node.js termine
  interval.unref();

  return io;
}

/**
 * Envía un mensaje a un usuario específico
 * @param {Object} io - Instancia de Socket.io
 * @param {string} userId - ID del usuario
 * @param {string} event - Nombre del evento
 * @param {Object} data - Datos a enviar
 */
function sendToUser(io, userId, event, data) {
  if (connectedUsers.has(userId)) {
    const userInfo = connectedUsers.get(userId);
    const socketId = userInfo.socketId;
    
    // Verificar que el socket exista antes de enviar
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.connected) {
      socket.emit(event, data);
      
      // Actualizar actividad al enviar mensajes
      updateUserActivity(userId);
      return true;
    }
  }
  return false;
}

/**
 * Envía una actualización de reproducción a un usuario
 * @param {Object} io - Instancia de Socket.io
 * @param {string} userId - ID del usuario
 * @param {Object} playbackData - Datos de reproducción
 * @returns {boolean} - Si el mensaje fue enviado correctamente
 */
function sendPlaybackUpdate(io, userId, playbackData) {
  return sendToUser(io, userId, 'playback_update', playbackData);
}

/**
 * Obtiene estadísticas de conexiones
 * @returns {Object} - Estadísticas de conexiones activas
 */
function getConnectionStats() {
  const stats = {
    activeConnections: connectedUsers.size,
    connectionsByTime: {
      lessThan1h: 0,
      lessThan24h: 0,
      moreThan24h: 0
    }
  };
  
  const now = Date.now();
  
  // Analizar duración de conexiones activas
  for (const userInfo of connectedUsers.values()) {
    const connectionDuration = now - userInfo.connected;
    const hours = connectionDuration / (1000 * 60 * 60);
    
    if (hours < 1) {
      stats.connectionsByTime.lessThan1h++;
    } else if (hours < 24) {
      stats.connectionsByTime.lessThan24h++;
    } else {
      stats.connectionsByTime.moreThan24h++;
    }
  }
  
  return stats;
}

module.exports = {
  initializeSocketServer,
  sendToUser,
  sendPlaybackUpdate,
  getConnectionStats
};
