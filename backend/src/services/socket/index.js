/**
 * Servicio de Socket.io para comunicación en tiempo real
 */
const { Server } = require('socket.io');

// Almacén temporal de conexiones activas (en producción usaríamos Redis)
const connectedUsers = new Map();

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
    }
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
    connectedUsers.set(socket.userId, socket.id);

    // Evento para recibir mensajes del asistente
    socket.on('assistant_message', (data) => {
      console.log(`Mensaje recibido de ${socket.userId}:`, data.message);
      
      // En el futuro, aquí procesaríamos el mensaje con la IA
      // Por ahora, solo respondemos con un eco
      setTimeout(() => {
        socket.emit('assistant_response', {
          message: `Recibido: ${data.message}`,
          timestamp: new Date()
        });
      }, 1000);
    });

    // Evento para actualizaciones de Spotify (reproducción, playlists, etc.)
    socket.on('spotify_update', (data) => {
      console.log(`Actualización de Spotify de ${socket.userId}:`, data);
      // Aquí procesaríamos las actualizaciones y enviaríamos respuestas
    });

    // Manejar desconexiones
    socket.on('disconnect', () => {
      console.log(`Usuario desconectado: ${socket.userId}`);
      connectedUsers.delete(socket.userId);
    });
  });

  return io;
}

/**
 * Envía un mensaje a un usuario específico
 * @param {string} userId - ID del usuario
 * @param {string} event - Nombre del evento
 * @param {Object} data - Datos a enviar
 */
function sendToUser(io, userId, event, data) {
  const socketId = connectedUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, data);
  }
}

/**
 * Envía una actualización de reproducción a un usuario
 * @param {Object} io - Instancia de Socket.io
 * @param {string} userId - ID del usuario
 * @param {Object} playbackData - Datos de reproducción
 */
function sendPlaybackUpdate(io, userId, playbackData) {
  sendToUser(io, userId, 'playback_update', playbackData);
}

module.exports = {
  initializeSocketServer,
  sendToUser,
  sendPlaybackUpdate
};
