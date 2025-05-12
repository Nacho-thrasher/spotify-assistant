/**
 * Servicio especializado para gestionar la cola de Spotify
 * Implementa métodos que la biblioteca spotify-web-api-node no provee nativamente
 */

// Reemplazar instancia global por el administrador de instancias
const spotifyManager = require('./spotifyManager');
const { redisClient } = require('../../config/redis');
const spotifyCache = require('../cache/spotifyCache');

/**
 * Obtiene la cola actual de reproducción
 * @param {string} userId - ID del usuario 
 * @returns {Promise<Object>} - Objeto con la información de la cola
 */
const getQueue = async (userId) => {
  try {
    // Usamos caché para reducir llamadas a la API
    return await spotifyCache.getCachedData(
      'queue',
      userId,
      async () => {
        // Usar el helper para obtener la cola con manejo mejorado de autenticación
        const spotifyHelpers = require('./spotifyHelpers');
        
        // Obtener instancia de Spotify para este usuario
        const spotifyApi = await spotifyManager.getInstance(userId);
        
        // Intentar verificar la sesión primero - con logs mejorados
        try {
          const sessionValid = await spotifyHelpers.verifySpotifySession(spotifyApi, userId);
          if (!sessionValid) {
            console.error(`🔴 Error: Sesión de Spotify no válida para usuario ${userId}`);
            throw new Error(`Sesión de Spotify no válida para usuario ${userId}`);
          }
          console.log(`✅ Sesión de Spotify válida para usuario ${userId}`);
        } catch (sessionError) {
          console.error(`🔴 Error al verificar sesión de Spotify: ${sessionError.message}`);
          throw sessionError; // Re-lanzar para manejo adecuado
        }
        
        // Obtener cola con soporte de refresco de token automático - con mejor manejo de errores
        try {
          console.log(`🔍 Obteniendo cola para ${userId}...`);
          const queueData = await spotifyHelpers.getQueue(spotifyApi);
          console.log(`✅ Cola obtenida exitosamente para ${userId}`);
          return queueData;
        } catch (queueError) {
          console.error(`❌ Error al obtener cola: ${queueError.message}`);
          // Enriquecer mensaje de error para mejor diagnóstico
          if (queueError.message.includes('401')) {
            throw new Error('Token expirado o inválido: ' + queueError.message);
          } else if (queueError.message.includes('404')) {
            throw new Error('No hay dispositivo activo: ' + queueError.message);
          } else {
            throw queueError; // Re-lanzar otros errores
          }
        }
      },
      {},
      10 // 10 segundos de caché
    );
  } catch (error) {
    console.error('Error al obtener cola:', error);
    throw error;
  }
};

/**
 * Reproduce un elemento específico de la cola por su posición
 * @param {string} userId - ID del usuario
 * @param {number} index - Índice del elemento en la cola
 * @returns {Promise<Object>} - Resultado de la operación
 */
const playQueueItem = async (userId, index) => {
  try {
    // 1. Obtener la cola actual
    const queueData = await getQueue(userId);
    
    if (!queueData || !queueData.queue || queueData.queue.length === 0) {
      throw new Error('No hay canciones en la cola para reproducir');
    }
    
    if (index < 0 || index >= queueData.queue.length) {
      throw new Error(`Índice ${index} fuera de rango. Cola tiene ${queueData.queue.length} elementos`);
    }
    
    // 2. Obtener el URI de la canción seleccionada
    const selectedTrack = queueData.queue[index];
    if (!selectedTrack || !selectedTrack.uri) {
      throw new Error('No se pudo obtener información de la canción seleccionada');
    }
    
    // 3. Obtener la instancia de Spotify del usuario específico
    const spotifyApi = await spotifyManager.getInstance(userId);
    
    // 4. Reproducir directamente usando su URI
    await spotifyApi.play({ uris: [selectedTrack.uri] });
    
    // 4. Invalidar caché después del cambio
    await spotifyCache.invalidateCache('playback_state', userId);
    await spotifyCache.invalidateCache('queue', userId);
    
    return {
      success: true,
      trackInfo: {
        name: selectedTrack.name,
        artist: selectedTrack.artists[0].name,
        uri: selectedTrack.uri
      }
    };
  } catch (error) {
    console.error('Error al reproducir elemento de cola:', error);
    throw error;
  }
};

module.exports = {
  getQueue,
  playQueueItem
};
