/**
 * Servicio de cola de tareas asíncronas
 * Permite ejecutar tareas complejas en segundo plano sin bloquear las respuestas al usuario
 */
const { redisClient } = require('../../config/redis');
const { v4: uuidv4 } = require('uuid');

// Constantes para el servicio
const QUEUE_KEY = 'queue:tasks';
const RESULTS_PREFIX = 'task:result:';
const TASK_TIMEOUT = 60 * 60; // 1 hora en segundos

// Tipos de tareas
const TASK_TYPES = {
  RECOMMENDATION_ANALYSIS: 'recommendation_analysis',
  LYRICS_PROCESSING: 'lyrics_processing',
  PLAYLIST_GENERATION: 'playlist_generation',
  SONG_ANALYSIS: 'song_analysis',
  ARTIST_RESEARCH: 'artist_research'
};

/**
 * Añade una tarea a la cola para procesamiento asíncrono
 * @param {string} type - Tipo de tarea (ver TASK_TYPES)
 * @param {Object} data - Datos necesarios para la tarea
 * @param {string} userId - ID del usuario que solicita la tarea
 * @returns {Promise<string>} - ID de la tarea creada
 */
const enqueueTask = async (type, data, userId) => {
  try {
    // Validar tipo de tarea
    if (!Object.values(TASK_TYPES).includes(type)) {
      throw new Error(`Tipo de tarea no válido: ${type}`);
    }
    
    // Generar ID único para la tarea
    const taskId = uuidv4();
    
    // Crear objeto de tarea
    const task = {
      id: taskId,
      type,
      data,
      userId,
      status: 'pending',
      createdAt: Date.now()
    };
    
    // Convertir a JSON para almacenar en Redis
    const taskJson = JSON.stringify(task);
    
    // Añadir a la cola (lista en Redis)
    await redisClient.lpush(QUEUE_KEY, taskJson);
    
    console.log(`✅ Tarea añadida a la cola: ${taskId} (${type})`);
    return taskId;
  } catch (error) {
    console.error('❌ Error al encolar tarea:', error);
    throw error;
  }
};

/**
 * Obtiene el siguiente trabajo de la cola para procesarlo
 * @returns {Promise<Object|null>} - Siguiente tarea o null si la cola está vacía
 */
const dequeueTask = async () => {
  try {
    // Obtener y eliminar la última tarea de la cola (RPOP para modelo FIFO)
    const taskJson = await redisClient.rpop(QUEUE_KEY);
    
    if (!taskJson) {
      return null; // Cola vacía
    }
    
    // Convertir de JSON a objeto
    const task = JSON.parse(taskJson);
    
    // Actualizar estado a 'processing'
    task.status = 'processing';
    task.startedAt = Date.now();
    
    console.log(`🔄 Procesando tarea: ${task.id} (${task.type})`);
    return task;
  } catch (error) {
    console.error('❌ Error al desencolar tarea:', error);
    return null;
  }
};

/**
 * Almacena el resultado de una tarea completada
 * @param {string} taskId - ID de la tarea
 * @param {Object} result - Resultado de la tarea
 * @param {boolean} success - Indica si la tarea se completó con éxito
 * @param {string} error - Mensaje de error (opcional)
 * @returns {Promise<boolean>} - Resultado de la operación
 */
const completeTask = async (taskId, result, success = true, error = null) => {
  try {
    // Clave para el resultado en Redis
    const resultKey = `${RESULTS_PREFIX}${taskId}`;
    
    // Crear objeto de resultado
    const taskResult = {
      taskId,
      status: success ? 'completed' : 'failed',
      result: success ? result : null,
      error: success ? null : error,
      completedAt: Date.now()
    };
    
    // Almacenar resultado
    await redisClient.set(
      resultKey, 
      JSON.stringify(taskResult),
      'EX', // Establecer expiración
      TASK_TIMEOUT
    );
    
    console.log(`${success ? '✅' : '❌'} Tarea ${taskId} ${success ? 'completada' : 'fallida'}`);
    return true;
  } catch (error) {
    console.error('❌ Error al completar tarea:', error);
    return false;
  }
};

/**
 * Obtiene el resultado de una tarea por su ID
 * @param {string} taskId - ID de la tarea
 * @returns {Promise<Object|null>} - Resultado de la tarea o null si no existe
 */
const getTaskResult = async (taskId) => {
  try {
    const resultKey = `${RESULTS_PREFIX}${taskId}`;
    const resultJson = await redisClient.get(resultKey);
    
    if (!resultJson) {
      return null; // No hay resultado todavía
    }
    
    return JSON.parse(resultJson);
  } catch (error) {
    console.error('❌ Error al obtener resultado de tarea:', error);
    return null;
  }
};

/**
 * Obtiene estadísticas de la cola
 * @returns {Promise<Object>} - Estadísticas de la cola
 */
const getQueueStats = async () => {
  try {
    // Obtener número de tareas en la cola
    const queueLength = await redisClient.llen(QUEUE_KEY);
    
    // Obtener todas las claves de resultados
    const resultKeys = await redisClient.keys(`${RESULTS_PREFIX}*`);
    
    return {
      pendingTasks: queueLength,
      completedTasks: resultKeys.length,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('❌ Error al obtener estadísticas de la cola:', error);
    return {
      pendingTasks: 0,
      completedTasks: 0,
      error: error.message
    };
  }
};

module.exports = {
  TASK_TYPES,
  enqueueTask,
  dequeueTask,
  completeTask,
  getTaskResult,
  getQueueStats
};
