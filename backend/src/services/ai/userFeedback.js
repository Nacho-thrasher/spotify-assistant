/**
 * Servicio para recopilar y analizar feedback del usuario
 * Permite mejorar el asistente con el tiempo
 */

const { redisClient } = require('../../config/redis');
const { v4: uuidv4 } = require('uuid');

// Prefijos para almacenamiento en Redis
const REDIS_KEYS = {
  INTERACTIONS: 'feedback:interactions:',
  PATTERNS: 'feedback:patterns:',
  CORRECTIONS: 'feedback:corrections:',
  STATS: 'feedback:stats'
};

// TTL para datos de feedback (30 días)
const FEEDBACK_TTL = 30 * 24 * 60 * 60;

/**
 * Registra una interacción del usuario con el asistente
 * @param {Object} interaction - Datos de la interacción
 * @param {string} interaction.userId - ID del usuario
 * @param {string} interaction.userMessage - Mensaje original del usuario
 * @param {string} interaction.detectedAction - Acción detectada por el asistente
 * @param {Object} interaction.parameters - Parámetros detectados
 * @param {boolean} interaction.successful - Si la acción fue exitosa
 * @returns {string} ID de la interacción
 */
const logInteraction = async (interaction) => {
  try {
    const interactionId = uuidv4();
    const data = {
      id: interactionId,
      timestamp: Date.now(),
      ...interaction
    };

    // Guardar interacción en Redis
    await redisClient.set(
      `${REDIS_KEYS.INTERACTIONS}${interactionId}`, 
      JSON.stringify(data),
      'EX',
      FEEDBACK_TTL
    );

    // Actualizar estadísticas
    await updateStats(interaction);

    return interactionId;
  } catch (error) {
    console.error('Error al registrar interacción:', error);
    return null;
  }
};

/**
 * Registra una corrección explícita del usuario
 * @param {Object} correction - Datos de la corrección
 * @param {string} correction.userId - ID del usuario
 * @param {string} correction.originalMessage - Mensaje original mal interpretado
 * @param {string} correction.originalAction - Acción detectada incorrectamente
 * @param {string} correction.correctedAction - Acción correcta según el usuario
 * @param {Object} correction.correctedParameters - Parámetros correctos
 * @returns {string} ID de la corrección
 */
const logCorrection = async (correction) => {
  try {
    const correctionId = uuidv4();
    const data = {
      id: correctionId,
      timestamp: Date.now(),
      ...correction
    };

    // Guardar corrección en Redis
    await redisClient.set(
      `${REDIS_KEYS.CORRECTIONS}${correctionId}`, 
      JSON.stringify(data),
      'EX',
      FEEDBACK_TTL
    );

    // Actualizar patrones de corrección para aprendizaje
    await updatePatterns(correction);

    return correctionId;
  } catch (error) {
    console.error('Error al registrar corrección:', error);
    return null;
  }
};

/**
 * Actualiza estadísticas generales de uso
 * @param {Object} interaction - Datos de la interacción
 */
const updateStats = async (interaction) => {
  try {
    // Obtener estadísticas actuales
    const currentStats = await redisClient.get(REDIS_KEYS.STATS);
    const stats = currentStats ? JSON.parse(currentStats) : {
      totalInteractions: 0,
      successfulInteractions: 0,
      actionCounts: {},
      lastUpdated: Date.now()
    };

    // Actualizar estadísticas
    stats.totalInteractions++;
    if (interaction.successful) {
      stats.successfulInteractions++;
    }

    // Contar por tipo de acción
    const action = interaction.detectedAction;
    stats.actionCounts[action] = (stats.actionCounts[action] || 0) + 1;
    
    stats.lastUpdated = Date.now();

    // Guardar estadísticas actualizadas
    await redisClient.set(REDIS_KEYS.STATS, JSON.stringify(stats));
  } catch (error) {
    console.error('Error al actualizar estadísticas:', error);
  }
};

/**
 * Actualiza patrones de corrección para aprendizaje
 * @param {Object} correction - Datos de la corrección
 */
const updatePatterns = async (correction) => {
  try {
    const { originalMessage, originalAction, correctedAction } = correction;
    
    // Normalizar mensaje para crear un patrón de aprendizaje
    const normalizedMessage = originalMessage.toLowerCase().trim();
    
    // Crear o actualizar patrón
    const patternKey = `${REDIS_KEYS.PATTERNS}${originalAction}:${correctedAction}`;
    
    // Obtener patrones existentes
    const existingPatterns = await redisClient.get(patternKey);
    const patterns = existingPatterns ? JSON.parse(existingPatterns) : [];
    
    // Añadir nuevo patrón si no existe uno similar
    const similarExists = patterns.some(pattern => 
      normalizedMessage.includes(pattern.trigger) || 
      pattern.trigger.includes(normalizedMessage)
    );
    
    if (!similarExists) {
      patterns.push({
        trigger: normalizedMessage,
        count: 1,
        firstSeen: Date.now()
      });
    } else {
      // Incrementar contador para patrón similar
      const similarPattern = patterns.find(pattern => 
        normalizedMessage.includes(pattern.trigger) || 
        pattern.trigger.includes(normalizedMessage)
      );
      similarPattern.count++;
      similarPattern.lastSeen = Date.now();
    }
    
    // Guardar patrones actualizados
    await redisClient.set(patternKey, JSON.stringify(patterns));
  } catch (error) {
    console.error('Error al actualizar patrones:', error);
  }
};

/**
 * Obtiene patrones de aprendizaje para mejorar el procesamiento de mensajes
 * @returns {Object} Patrones de aprendizaje
 */
const getLearningPatterns = async () => {
  try {
    // Obtener todas las claves de patrones
    const keys = await redisClient.keys(`${REDIS_KEYS.PATTERNS}*`);
    
    const patterns = {};
    
    // Procesar cada conjunto de patrones
    for (const key of keys) {
      const value = await redisClient.get(key);
      if (value) {
        // Extraer acciones del nombre de la clave
        const actionPair = key.replace(REDIS_KEYS.PATTERNS, '');
        const [originalAction, correctedAction] = actionPair.split(':');
        
        if (!patterns[originalAction]) {
          patterns[originalAction] = {};
        }
        
        patterns[originalAction][correctedAction] = JSON.parse(value);
      }
    }
    
    return patterns;
  } catch (error) {
    console.error('Error al obtener patrones de aprendizaje:', error);
    return {};
  }
};

/**
 * Obtiene estadísticas de uso del asistente
 * @returns {Object} Estadísticas de uso
 */
const getStats = async () => {
  try {
    const stats = await redisClient.get(REDIS_KEYS.STATS);
    return stats ? JSON.parse(stats) : null;
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return null;
  }
};

module.exports = {
  logInteraction,
  logCorrection,
  getLearningPatterns,
  getStats
};
