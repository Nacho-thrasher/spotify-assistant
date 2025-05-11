/**
 * Servicio de historial de usuario
 * Almacena y recupera el historial de interacciones del usuario con el asistente
 */
const { redisClient, getAsync, setAsync } = require('../../config/redis');
const { v4: uuidv4 } = require('uuid');

// Constantes para el servicio
const MAX_HISTORY_ITEMS = 100; // Número máximo de elementos en el historial
const HISTORY_EXPIRATION = 60 * 60 * 24 * 30; // 30 días en segundos

/**
 * Tipos de eventos en el historial
 */
const EVENT_TYPES = {
  COMMAND: 'command', // Comando enviado al asistente
  PLAYBACK: 'playback', // Acción de reproducción (play, pause, skip)
  SEARCH: 'search', // Búsqueda realizada
  RECOMMENDATION: 'recommendation', // Recomendación enviada al usuario
  FAVORITE: 'favorite', // Canción marcada como favorita
  FEEDBACK: 'feedback' // Feedback del usuario sobre una recomendación
};

/**
 * Genera la clave para el historial de un usuario
 * @param {string} userId - ID del usuario
 * @returns {string} - Clave para Redis
 */
const getUserHistoryKey = (userId) => `history:${userId}`;

/**
 * Añade un evento al historial del usuario
 * @param {string} userId - ID del usuario
 * @param {string} type - Tipo de evento (ver EVENT_TYPES)
 * @param {Object} data - Datos del evento
 * @returns {Promise<boolean>} - Resultado de la operación
 */
const addToHistory = async (userId, type, data) => {
  try {
    // Debug logs para registrar cada intento de agregar al historial
    console.log(`🔍 addToHistory llamado con userId=${userId}, type=${type}`);
    console.log(`🔍 data=`, JSON.stringify(data, null, 2).substring(0, 200));
    
    if (!userId || !type || !data) {
      console.error('❌ Error: userId, type y data son obligatorios');
      return false;
    }
    
    // Validar tipo de evento
    if (!Object.values(EVENT_TYPES).includes(type)) {
      console.warn(`⚠️ Tipo de evento desconocido: ${type}`);
    }
    
    const historyKey = getUserHistoryKey(userId);
    
    // Crear entrada con información relevante y un ID único
    const entry = {
      id: uuidv4(),
      type,
      timestamp: Date.now(),
      data
    };
    
    // Usar LPUSH para añadir al principio (más reciente primero)
    await redisClient.lpush(historyKey, JSON.stringify(entry));
    
    // Mantener solo los últimos MAX_HISTORY_ITEMS elementos
    await redisClient.ltrim(historyKey, 0, MAX_HISTORY_ITEMS - 1);
    
    // Establecer o renovar tiempo de expiración
    await redisClient.expire(historyKey, HISTORY_EXPIRATION);
    
    // Para comandos e interacciones específicas, actualizar también contadores especiales
    if (type === EVENT_TYPES.COMMAND) {
      await updateCommandStats(userId, data.command);
    } else if (type === EVENT_TYPES.PLAYBACK && data.trackId) {
      await updateTrackPlayStats(userId, data.trackId, data.artistId);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error al añadir al historial:', error);
    return false;
  }
};

/**
 * Actualiza estadísticas de comandos usados
 * @param {string} userId - ID del usuario
 * @param {string} command - Comando utilizado
 * @private
 */
const updateCommandStats = async (userId, command) => {
  try {
    const key = `stats:commands:${userId}`;
    // Incrementar contador para este comando
    await redisClient.zincrby(key, 1, command);
    // Establecer expiración
    await redisClient.expire(key, HISTORY_EXPIRATION);
  } catch (error) {
    console.error('Error actualizando estadísticas de comandos:', error);
  }
};

/**
 * Actualiza estadísticas de reproducción de pistas
 * @param {string} userId - ID del usuario
 * @param {string} trackId - ID de la pista
 * @param {string} artistId - ID del artista
 * @private
 */
const updateTrackPlayStats = async (userId, trackId, artistId) => {
  try {
    // Incrementar contador para esta pista
    const trackKey = `stats:tracks:${userId}`;
    await redisClient.zincrby(trackKey, 1, trackId);
    await redisClient.expire(trackKey, HISTORY_EXPIRATION);
    
    // Incrementar contador para este artista si está disponible
    if (artistId) {
      const artistKey = `stats:artists:${userId}`;
      await redisClient.zincrby(artistKey, 1, artistId);
      await redisClient.expire(artistKey, HISTORY_EXPIRATION);
    }
  } catch (error) {
    console.error('Error actualizando estadísticas de reproducción:', error);
  }
};

/**
 * Obtiene el historial de eventos del usuario
 * @param {string} userId - ID del usuario
 * @param {number} limit - Número máximo de elementos a devolver
 * @param {string} filterType - Filtrar por tipo de evento (opcional)
 * @returns {Promise<Array>} - Historial de eventos
 */
const getUserHistory = async (userId, limit = 20, filterType = null) => {
  try {
    const historyKey = getUserHistoryKey(userId);
    
    // Obtener todos los elementos del historial
    const allItems = await redisClient.lrange(historyKey, 0, -1);
    
    // Parsear de JSON a objetos
    let history = allItems.map(item => JSON.parse(item));
    
    // Filtrar por tipo si es necesario
    if (filterType) {
      history = history.filter(item => item.type === filterType);
    }
    
    // Limitar número de resultados
    return history.slice(0, limit);
  } catch (error) {
    console.error('❌ Error al obtener historial:', error);
    return [];
  }
};

/**
 * Obtiene estadísticas de los comandos más usados
 * @param {string} userId - ID del usuario
 * @param {number} limit - Número máximo de comandos a devolver
 * @returns {Promise<Array>} - Lista de comandos y su frecuencia
 */
const getMostUsedCommands = async (userId, limit = 5) => {
  try {
    const key = `stats:commands:${userId}`;
    // Obtener los comandos más usados (ordenados de mayor a menor)
    const result = await redisClient.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    
    // Convertir resultado a un formato más amigable
    const commands = [];
    for (let i = 0; i < result.length; i += 2) {
      commands.push({
        command: result[i],
        count: parseInt(result[i + 1])
      });
    }
    
    return commands;
  } catch (error) {
    console.error('❌ Error al obtener comandos más usados:', error);
    return [];
  }
};

/**
 * Obtiene los artistas más escuchados por el usuario
 * @param {string} userId - ID del usuario
 * @param {number} limit - Número máximo de artistas a devolver
 * @returns {Promise<Array>} - Lista de IDs de artistas y su frecuencia
 */
const getMostPlayedArtists = async (userId, limit = 5) => {
  try {
    const key = `stats:artists:${userId}`;
    const result = await redisClient.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    
    const artists = [];
    for (let i = 0; i < result.length; i += 2) {
      artists.push({
        artistId: result[i],
        count: parseInt(result[i + 1])
      });
    }
    
    return artists;
  } catch (error) {
    console.error('❌ Error al obtener artistas más escuchados:', error);
    return [];
  }
};

/**
 * Elimina un elemento específico del historial del usuario
 * @param {string} userId - ID del usuario
 * @param {string} itemId - ID del elemento del historial a eliminar
 * @returns {Promise<boolean>} - Resultado de la operación
 */
const deleteHistoryItem = async (userId, itemId) => {
  try {
    if (!userId || !itemId) {
      console.error('❌ Error: userId e itemId son obligatorios para eliminar un elemento del historial');
      return false;
    }

    const historyKey = getUserHistoryKey(userId);
    const items = await redisClient.lrange(historyKey, 0, -1);
    let itemToDelete = null;

    for (const itemString of items) {
      const parsedItem = JSON.parse(itemString);
      if (parsedItem.id === itemId) {
        itemToDelete = itemString; // We need the exact string to remove
        break;
      }
    }

    if (itemToDelete) {
      // LREM key count element - count = 1 para eliminar la primera ocurrencia
      const result = await redisClient.lrem(historyKey, 1, itemToDelete);
      if (result > 0) {
        console.log(`✅ Elemento de historial ${itemId} eliminado para el usuario ${userId}`);
        return true;
      }
      console.warn(`⚠️ No se encontró o no se pudo eliminar el elemento ${itemId} del historial para el usuario ${userId}. Resultado LREM: ${result}`);
      return false;
    }
    
    console.warn(`⚠️ Elemento de historial ${itemId} no encontrado para el usuario ${userId}`);
    return false;
  } catch (error) {
    console.error(`❌ Error al eliminar elemento ${itemId} del historial para ${userId}:`, error);
    return false;
  }
};

/**
 * Limpia el historial de un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} - Resultado de la operación
 */
const clearHistory = async (userId) => {
  try {
    const keys = [
      getUserHistoryKey(userId),
      `stats:commands:${userId}`,
      `stats:tracks:${userId}`,
      `stats:artists:${userId}`
    ];
    
    // Eliminar todas las claves asociadas a este usuario
    for (const key of keys) {
      await redisClient.del(key);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error al limpiar historial:', error);
    return false;
  }
};

module.exports = {
  EVENT_TYPES,
  addToHistory,
  getUserHistory,
  getMostUsedCommands,
  getMostPlayedArtists,
  clearHistory,
  deleteHistoryItem
};
