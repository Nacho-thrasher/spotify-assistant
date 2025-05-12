/**
 * Servicio de cola de tareas con Redis
 * Permite procesar operaciones pesadas de forma asíncrona
 * Con optimizaciones de memoria y gestión de recursos
 */

const { redisClient, getTTL, renewExpiry } = require('../config/redis');
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

// Configuración para la gestión de memoria y recursos
const QUEUE_CONFIG = {
  // TTL para trabajos completados o fallidos (1 día en segundos)
  COMPLETED_JOB_TTL: 24 * 60 * 60,
  
  // TTL para trabajos pendientes que nunca fueron procesados (7 días)
  PENDING_JOB_TTL: 7 * 24 * 60 * 60,
  
  // Límite máximo de trabajos por cola
  MAX_JOBS_PER_QUEUE: 1000,
  
  // Intervalo de limpieza (cada 30 minutos)
  CLEANUP_INTERVAL: 30 * 60 * 1000
};

// Estadísticas de rendimiento
let queueStats = {
  jobsProcessed: 0,
  jobsFailed: 0,
  jobsAdded: 0,
  lastCleanup: null,
  startTime: Date.now()
};

/**
 * Añade un trabajo a la cola
 * @param {string} queueName - Nombre de la cola (usar constantes JOB_QUEUES)
 * @param {Object} jobData - Datos para el trabajo
 * @param {number} priority - Prioridad (menor número = mayor prioridad)
 * @param {Object} options - Opciones adicionales
 * @returns {string} ID del trabajo
 */
const addJob = async (queueName, jobData, priority = 10, options = {}) => {
  try {
    // Verificar el tamaño de la cola antes de añadir
    const queueSize = await redisClient.zcard(queueName);
    if (queueSize >= QUEUE_CONFIG.MAX_JOBS_PER_QUEUE) {
      throw new Error(`Cola ${queueName} llena (máximo ${QUEUE_CONFIG.MAX_JOBS_PER_QUEUE} trabajos)`);
    }
    
    const jobId = uuidv4();
    const job = {
      id: jobId,
      data: JSON.stringify(jobData), // Serializar para evitar problemas con Redis
      state: JOB_STATES.PENDING,
      priority,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      error: null,
      result: null
    };

    // Establecer valores adicionales si se proporcionan
    if (options.timeout) {
      job.timeout = options.timeout;
    }
    
    if (options.retryCount) {
      job.retryCount = options.retryCount;
      job.retriesLeft = options.retryCount;
    }

    // Guardar el trabajo completo con todos sus metadatos
    // Usar hmset en lugar de hset para evitar problemas de compatibilidad
    const jobFields = Object.entries(job).flatMap(([key, value]) => [key, value]);
    await redisClient.hmset(`jobs:${jobId}`, ...jobFields);
    
    // Establecer tiempo de expiración para trabajos pendientes
    await redisClient.expire(`jobs:${jobId}`, QUEUE_CONFIG.PENDING_JOB_TTL);
    
    // Añadir a la cola con puntaje de prioridad (usando sorted sets)
    await redisClient.zadd(queueName, priority, jobId);

    // Actualizar estadísticas
    queueStats.jobsAdded++;
    
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
    
    // Si no existe el trabajo, devolver null
    if (!job || Object.keys(job).length === 0) {
      return null;
    }
    
    // Deserializar los datos
    if (job.data) {
      try {
        job.data = JSON.parse(job.data);
      } catch (e) {
        // Si hay un error al parsear, mantener como string
      }
    }
    
    // Deserializar resultado si existe
    if (job.result) {
      try {
        job.result = JSON.parse(job.result);
      } catch (e) {
        // Si hay un error al parsear, mantener como string
      }
    }
    
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
    
    // Preparar resultado para almacenamiento en Redis si es un objeto
    if (updates.result && typeof updates.result !== 'string') {
      updates.result = JSON.stringify(updates.result);
    }
    
    // Actualizar campos
    const updatedJob = {
      ...job,
      state,
      updatedAt: Date.now(),
      ...updates
    };
    
    // Guardar trabajo actualizado
    const jobFields = Object.entries(updatedJob).flatMap(([key, value]) => [key, value]);
    await redisClient.hmset(`jobs:${jobId}`, ...jobFields);
    
    // Establecer TTL para trabajos completados o fallidos
    if (state === JOB_STATES.COMPLETED || state === JOB_STATES.FAILED) {
      await redisClient.expire(`jobs:${jobId}`, QUEUE_CONFIG.COMPLETED_JOB_TTL);
      
      // Actualizar estadísticas
      if (state === JOB_STATES.COMPLETED) {
        queueStats.jobsProcessed++;
      } else {
        queueStats.jobsFailed++;
      }
    }
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
    
    // Si el trabajo no existe en Redis pero está en la cola, limpiarlo
    if (!job || Object.keys(job).length === 0) {
      await redisClient.zrem(queueName, jobId);
      return null;
    }
    
    // Deserializar los datos
    if (job.data) {
      try {
        job.data = JSON.parse(job.data);
      } catch (e) {
        // Si hay un error al parsear, dejar como string
        console.warn(`Error al deserializar datos del trabajo ${jobId}`);
      }
    }
    
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
    stopOnError = false,
    jobTimeout = 60000 // Tiempo máximo para procesar un trabajo (1 minuto)
  } = options;
  
  let activeJobs = 0;
  let shouldContinue = true;
  let currentJobTimeouts = new Map(); // Para seguimiento de timeouts
  
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
      
      // Configurar timeout para el trabajo
      const timeoutMs = job.timeout ? parseInt(job.timeout) : jobTimeout;
      let timeoutId = null;
      
      // Crear promesa con timeout
      const processWithTimeout = new Promise(async (resolve, reject) => {
        try {
          // Establecer timeout
          timeoutId = setTimeout(() => {
            reject(new Error(`Tiempo de procesamiento excedido (${timeoutMs}ms)`));
          }, timeoutMs);
          
          // Añadir a seguimiento
          currentJobTimeouts.set(job.id, timeoutId);
          
          // Procesar el trabajo
          const result = await processingFunction(job.data);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          clearTimeout(timeoutId);
          currentJobTimeouts.delete(job.id);
        }
      });
      
      try {
        // Ejecutar el procesamiento con timeout
        const result = await processWithTimeout;
        
        // Marcar como completado con el resultado
        await updateJobStatus(job.id, JOB_STATES.COMPLETED, { result });
      } catch (error) {
        console.error(`Error al procesar trabajo ${job.id}:`, error.message);
        
        // Verificar si hay reintentos disponibles
        const retriesLeft = job.retriesLeft ? parseInt(job.retriesLeft) : 0;
        
        if (retriesLeft > 0) {
          // Reintento: volver a añadir a la cola con mayor prioridad
          console.log(`Reintentando trabajo ${job.id}, ${retriesLeft} intentos restantes`);
          
          await addJob(
            queueName, 
            job.data, 
            parseInt(job.priority) - 1, // Mayor prioridad en el reintento
            { 
              retryCount: parseInt(job.retryCount),
              retriesLeft: retriesLeft - 1,
              timeout: job.timeout
            }
          );
          
          // Actualizar estado a fallido pero indicando reintento
          await updateJobStatus(job.id, JOB_STATES.FAILED, { 
            error: error.message,
            retried: true,
            remainingRetries: retriesLeft - 1
          });
        } else {
          // Marcar como fallido con el error
          await updateJobStatus(job.id, JOB_STATES.FAILED, { error: error.message });
        }
        
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
  
  // Devolver objeto de control
  return {
    stop: () => {
      shouldContinue = false;
      clearInterval(interval);
      
      // Limpiar todos los timeouts pendientes
      for (const [jobId, timeoutId] of currentJobTimeouts.entries()) {
        clearTimeout(timeoutId);
      }
      
      console.log(`🛑 Deteniendo procesamiento de cola ${queueName}`);
    },
    
    getStatus: () => ({
      activeJobs,
      isRunning: shouldContinue,
      queueName
    })
  };
};

/**
 * Limpia trabajos antiguos y gestiona recursos
 * - Elimina trabajos completados/fallidos antiguos
 * - Gestiona trabajos que excedieron su TTL
 */
const cleanupJobs = async () => {
  try {
    console.log('🧹 Iniciando limpieza de trabajos antiguos...');
    let removedJobs = 0;
    
    // 1. Obtener todas las claves de trabajos
    const jobKeys = await redisClient.keys('jobs:*');
    
    // Procesar cada trabajo
    for (const jobKey of jobKeys) {
      const job = await redisClient.hgetall(jobKey);
      
      // Si el trabajo no existe o está corrupto, eliminarlo
      if (!job || !job.id || !job.state) {
        await redisClient.del(jobKey);
        removedJobs++;
        continue;
      }
      
      // Verificar TTL actual
      const ttl = await getTTL(jobKey);
      
      // Si el TTL es muy bajo (menos de 1 hora) para trabajos pendientes o en proceso,
      // probablemente se trata de un trabajo abandonado
      if ((job.state === JOB_STATES.PENDING || job.state === JOB_STATES.PROCESSING) && 
          ttl < 3600) {
        // Marcar como fallido por abandono
        const jobId = job.id;
        await updateJobStatus(jobId, JOB_STATES.FAILED, { 
          error: 'Trabajo abandonado por exceder TTL'
        });
      }
    }
    
    // 2. Limpiar colas eliminando referencias a trabajos inexistentes
    for (const queueName of Object.values(JOB_QUEUES)) {
      // Obtener todos los IDs de la cola
      const jobIds = await redisClient.zrange(queueName, 0, -1);
      
      for (const jobId of jobIds) {
        // Verificar si el trabajo existe
        const exists = await redisClient.exists(`jobs:${jobId}`);
        
        if (!exists) {
          // Eliminar de la cola si el trabajo ya no existe
          await redisClient.zrem(queueName, jobId);
          removedJobs++;
        }
      }
    }
    
    // Actualizar estadísticas de limpieza
    queueStats.lastCleanup = Date.now();
    
    console.log(`🧹 Limpieza finalizada. ${removedJobs} trabajos eliminados o reparados.`);
    return removedJobs;
  } catch (error) {
    console.error('Error durante la limpieza de trabajos:', error);
    return 0;
  }
};

// Iniciar limpieza periódica
const cleanupInterval = setInterval(cleanupJobs, QUEUE_CONFIG.CLEANUP_INTERVAL);
cleanupInterval.unref(); // No impedir que Node.js termine

/**
 * Obtener estadísticas de rendimiento
 */
const getQueueStats = async () => {
  try {
    // Obtener conteo actual de trabajos por cola
    const queueCounts = {};
    for (const [name, queueName] of Object.entries(JOB_QUEUES)) {
      queueCounts[name] = await redisClient.zcard(queueName);
    }
    
    // Obtener conteo por estado
    const statusCounts = {
      [JOB_STATES.PENDING]: 0,
      [JOB_STATES.PROCESSING]: 0,
      [JOB_STATES.COMPLETED]: 0,
      [JOB_STATES.FAILED]: 0
    };
    
    // Obtener muestra de trabajos para estadísticas (máximo 100)
    const jobKeys = await redisClient.keys('jobs:*');
    const sampleSize = Math.min(jobKeys.length, 100);
    
    if (sampleSize > 0) {
      const sampleKeys = jobKeys.slice(0, sampleSize);
      
      for (const jobKey of sampleKeys) {
        const job = await redisClient.hgetall(jobKey);
        if (job && job.state && statusCounts[job.state] !== undefined) {
          statusCounts[job.state]++;
        }
      }
      
      // Extrapolar para el conjunto completo
      if (sampleSize < jobKeys.length) {
        const factor = jobKeys.length / sampleSize;
        for (const state in statusCounts) {
          statusCounts[state] = Math.round(statusCounts[state] * factor);
        }
      }
    }
    
    return {
      // Estadísticas generales
      jobsProcessed: queueStats.jobsProcessed,
      jobsFailed: queueStats.jobsFailed,
      jobsAdded: queueStats.jobsAdded,
      
      // Tiempos
      uptime: Math.round((Date.now() - queueStats.startTime) / 1000),
      lastCleanup: queueStats.lastCleanup,
      
      // Estado actual
      currentJobCount: jobKeys.length,
      queueCounts,
      statusCounts,
      
      // Rendimiento
      successRate: queueStats.jobsProcessed > 0 
        ? (queueStats.jobsProcessed / (queueStats.jobsProcessed + queueStats.jobsFailed)) * 100 
        : 0
    };
  } catch (error) {
    console.error('Error al obtener estadísticas de cola:', error);
    return { error: error.message };
  }
};

module.exports = {
  JOB_QUEUES,
  JOB_STATES,
  addJob,
  getJobStatus,
  updateJobStatus,
  getNextJob,
  processQueue,
  cleanupJobs,
  getQueueStats
};
