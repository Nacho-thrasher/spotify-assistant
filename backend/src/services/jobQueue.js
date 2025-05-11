/**
 * Servicio de cola de tareas con Redis
 * Permite procesar operaciones pesadas de forma asíncrona
 */

const { redisClient } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');

// Prefijos para diferentes tipos de trabajos
const JOB_QUEUES = {
  RECOMMENDATIONS: 'queue:recommendations',
  ANALYSIS: 'queue:analysis',
  HISTORY_PROCESSING: 'queue:history',
  PLAYLIST_GENERATION: 'queue:playlist'
};

// Estados de los trabajos
const JOB_STATES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * Añade un trabajo a la cola
 * @param {string} queueName - Nombre de la cola (usar constantes JOB_QUEUES)
 * @param {Object} jobData - Datos para el trabajo
 * @param {number} priority - Prioridad (menor número = mayor prioridad)
 * @returns {string} ID del trabajo
 */
const addJob = async (queueName, jobData, priority = 10) => {
  try {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      data: jobData,
      state: JOB_STATES.PENDING,
      priority,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      error: null,
      result: null
    };

    // Guardar el trabajo completo con todos sus metadatos
    await redisClient.hset(`jobs:${jobId}`, job);
    
    // Añadir a la cola con puntaje de prioridad (usando sorted sets)
    await redisClient.zadd(queueName, priority, jobId);

    console.log(`✅ Trabajo ${jobId} añadido a la cola ${queueName}`);
    return jobId;
  } catch (error) {
    console.error('Error al añadir trabajo a la cola:', error);
    throw error;
  }
};

/**
 * Obtener el estado actual de un trabajo
 * @param {string} jobId - ID del trabajo
 * @returns {Object} Estado del trabajo
 */
const getJobStatus = async (jobId) => {
  try {
    const job = await redisClient.hgetall(`jobs:${jobId}`);
    return job;
  } catch (error) {
    console.error('Error al obtener estado del trabajo:', error);
    return null;
  }
};

/**
 * Actualizar el estado de un trabajo
 * @param {string} jobId - ID del trabajo
 * @param {string} state - Estado nuevo (usar constantes JOB_STATES)
 * @param {Object} updates - Actualizaciones adicionales (result, error, etc.)
 */
const updateJobStatus = async (jobId, state, updates = {}) => {
  try {
    // Obtener trabajo actual
    const job = await redisClient.hgetall(`jobs:${jobId}`);
    if (!job || !job.id) {
      throw new Error(`Trabajo ${jobId} no encontrado`);
    }
    
    // Actualizar campos
    const updatedJob = {
      ...job,
      state,
      updatedAt: Date.now(),
      ...updates
    };
    
    // Guardar trabajo actualizado
    await redisClient.hset(`jobs:${jobId}`, updatedJob);
    console.log(`✅ Estado de trabajo ${jobId} actualizado a ${state}`);
    
    return updatedJob;
  } catch (error) {
    console.error('Error al actualizar estado del trabajo:', error);
    throw error;
  }
};

/**
 * Obtener el siguiente trabajo pendiente de una cola específica
 * @param {string} queueName - Nombre de la cola (usar constantes JOB_QUEUES)
 * @returns {Object} Siguiente trabajo o null si no hay trabajos pendientes
 */
const getNextJob = async (queueName) => {
  try {
    // Obtener el trabajo de mayor prioridad (menor puntaje) de la cola
    const [jobId] = await redisClient.zrange(queueName, 0, 0);
    
    if (!jobId) {
      return null; // No hay trabajos pendientes
    }
    
    // Obtener los datos completos del trabajo
    const job = await redisClient.hgetall(`jobs:${jobId}`);
    
    // Eliminar de la cola pero mantener el registro del trabajo
    await redisClient.zrem(queueName, jobId);
    
    return job;
  } catch (error) {
    console.error('Error al obtener el siguiente trabajo:', error);
    return null;
  }
};

/**
 * Procesar trabajos de la cola de forma asíncrona
 * @param {string} queueName - Nombre de la cola a procesar
 * @param {Function} processingFunction - Función que procesa cada trabajo
 * @param {Object} options - Opciones de configuración
 */
const processQueue = async (queueName, processingFunction, options = {}) => {
  const { 
    concurrency = 1,
    pollInterval = 1000,
    stopOnError = false
  } = options;
  
  let activeJobs = 0;
  let shouldContinue = true;
  
  const processJob = async () => {
    try {
      if (!shouldContinue) return;
      
      // Si ya estamos en el límite de concurrencia, esperar
      if (activeJobs >= concurrency) return;
      
      const job = await getNextJob(queueName);
      if (!job) {
        return; // No hay trabajos pendientes
      }
      
      activeJobs++;
      
      // Marcar como procesando
      await updateJobStatus(job.id, JOB_STATES.PROCESSING);
      
      try {
        // Procesar el trabajo
        const result = await processingFunction(job.data);
        
        // Marcar como completado con el resultado
        await updateJobStatus(job.id, JOB_STATES.COMPLETED, { result });
      } catch (error) {
        // Marcar como fallido con el error
        await updateJobStatus(job.id, JOB_STATES.FAILED, { error: error.message });
        
        if (stopOnError) {
          shouldContinue = false;
        }
      } finally {
        activeJobs--;
      }
    } catch (error) {
      console.error('Error en processJob:', error);
      activeJobs--;
    }
  };
  
  // Iniciar bucle de procesamiento
  console.log(`🔄 Iniciando procesamiento de cola ${queueName} (concurrencia: ${concurrency})`);
  
  const interval = setInterval(async () => {
    if (!shouldContinue) {
      clearInterval(interval);
      return;
    }
    
    // Intentar procesar más trabajos hasta el límite de concurrencia
    const jobsToProcess = concurrency - activeJobs;
    for (let i = 0; i < jobsToProcess; i++) {
      processJob();
    }
  }, pollInterval);
  
  // Devolver función para detener el procesamiento
  return {
    stop: () => {
      shouldContinue = false;
      clearInterval(interval);
      console.log(`🛑 Deteniendo procesamiento de cola ${queueName}`);
    }
  };
};

module.exports = {
  JOB_QUEUES,
  JOB_STATES,
  addJob,
  getJobStatus,
  updateJobStatus,
  getNextJob,
  processQueue
};
