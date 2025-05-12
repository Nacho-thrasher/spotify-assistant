/**
 * API para acceder al historial y preferencias del usuario
 * Utiliza los servicios de Redis implementados
 */
const express = require('express');
const router = express.Router();
const userHistory = require('../services/history/userHistory');

/**
 * @route   GET /api/history/debug
 * @desc    Endpoint de depuración para verificar el ID de usuario
 * @access  Private
 */
router.get('/debug', async (req, res) => {
  try {
    // Ahora el ID de usuario viene garantizado por el middleware
    const userId = req.userId;
    
    // Para propósitos de depuración, mostramos de dónde se obtuvo originalmente
    const fromUser = req.user?.id || null;
    const fromSession = req.session?.userId || null;
    const fromHeaders = req.headers['user-id'] || null;
    
    // Revisar el historial existente en Redis
    const historyKey = `history:${userId}`;
    const historyExists = userId ? await require('../config/redis').redisClient.exists(historyKey) : false;
    const itemCount = historyExists ? await require('../config/redis').redisClient.llen(historyKey) : 0;
    
    // Listar todos los keys de history: en Redis
    const allHistoryKeys = await require('../config/redis').redisClient.keys('history:*');
    
    res.json({
      debug: true,
      userIdSources: {
        fromUser,
        fromSession,
        fromHeaders,
        combinedUserId
      },
      historyInfo: {
        historyKey,
        historyExists,
        itemCount
      },
      allHistoryKeys
    });
  } catch (error) {
    console.error('Error en endpoint de depuración:', error);
    res.status(500).json({ error: 'Error de depuración', message: error.message });
  }
});

/**
 * @route   POST /api/history/test
 * @desc    Endpoint de prueba para generar datos de historial
 * @access  Private
 */
router.post('/test', async (req, res) => {
  try {
    const userId = req.userId; // Ahora viene garantizado por el middleware de identificación
    
    if (!userId) {
      return res.status(401).json({
        error: 'No autorizado',
        message: 'Se requiere identificación de usuario'
      });
    }
    
    console.log('🧪 Generando datos de historial de prueba para userId:', userId);
    
    // Generar un comando de prueba
    await userHistory.addToHistory(userId, userHistory.EVENT_TYPES.COMMAND, {
      command: 'play',
      parameters: { query: 'Shape of You' },
      userMessage: 'Reproduce Shape of You de Ed Sheeran',
      responseMessage: 'Reproduciendo Shape of You de Ed Sheeran'
    });
    
    // Generar una reproducción de prueba
    await userHistory.addToHistory(userId, userHistory.EVENT_TYPES.PLAYBACK, {
      trackId: '7qiZfU4dY1lWllzX7mPBI3',
      trackName: 'Shape of You',
      artistId: '6eUKZXaKkcviH0Ku9w2n3V',
      artistName: 'Ed Sheeran',
      action: 'play'
    });
    
    // Generar una búsqueda de prueba
    await userHistory.addToHistory(userId, userHistory.EVENT_TYPES.SEARCH, {
      query: 'Coldplay',
      resultCount: 5
    });
    
    res.json({
      success: true,
      message: 'Datos de historial de prueba generados correctamente',
      userId: userId
    });
  } catch (error) {
    console.error('Error al generar datos de prueba:', error);
    res.status(500).json({
      error: 'Error al generar datos de prueba',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/history/commands
 * @desc    Obtiene los comandos más usados por el usuario
 * @access  Private
 */
router.get('/commands', async (req, res) => {
  try {
    const userId = req.userId; // Ahora viene garantizado por el middleware de identificación
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'No autorizado',
        message: 'Se requiere identificación de usuario'
      });
    }
    
    const limit = parseInt(req.query.limit) || 10;
    const commands = await userHistory.getMostUsedCommands(userId, limit);
    
    // Establecer cabeceras para evitar la caché
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    res.json({
      success: true,
      data: commands
    });
  } catch (error) {
    console.error('Error al obtener historial de comandos:', error);
    res.status(500).json({ 
      error: 'Error al obtener historial',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/history/artists
 * @desc    Obtiene los artistas más escuchados por el usuario
 * @access  Private
 */
router.get('/artists', async (req, res) => {
  try {
    const userId = req.userId; // Ahora viene garantizado por el middleware de identificación
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'No autorizado',
        message: 'Se requiere identificación de usuario'
      });
    }
    
    const limit = parseInt(req.query.limit) || 10;
    const artists = await userHistory.getMostPlayedArtists(userId, limit);
    
    // Establecer cabeceras para evitar la caché
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    res.json({
      success: true,
      data: artists
    });
  } catch (error) {
    console.error('Error al obtener artistas favoritos:', error);
    res.status(500).json({ 
      error: 'Error al obtener artistas',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/history/recent
 * @desc    Obtiene el historial reciente del usuario
 * @access  Private
 */
router.get('/recent', async (req, res) => {
  try {
    const userId = req.userId; // Ahora viene garantizado por el middleware de identificación
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'No autorizado',
        message: 'Se requiere identificación de usuario'
      });
    }
    
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type || null; // Filtro opcional por tipo de evento
    const history = await userHistory.getUserHistory(userId, limit, type);
    
    // Establecer cabeceras para evitar la caché
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error al obtener historial reciente:', error);
    res.status(500).json({ 
      error: 'Error al obtener historial',
      message: error.message 
    });
  }
});

/**
 * @route   DELETE /api/history
 * @desc    Elimina todo el historial del usuario
 * @access  Private
 */
router.delete('/', async (req, res) => {
  try {
    const userId = req.userId; // Ahora viene garantizado por el middleware de identificación
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'No autorizado',
        message: 'Se requiere identificación de usuario'
      });
    }
    
    const success = await userHistory.clearHistory(userId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Historial eliminado correctamente'
      });
    } else {
      res.status(500).json({ 
        error: 'Error al eliminar historial',
        message: 'No se pudo eliminar el historial completamente'
      });
    }
  } catch (error) {
    console.error('Error al eliminar historial:', error);
    res.status(500).json({ 
      error: 'Error al eliminar historial',
      message: error.message 
    });
  }
});

/**
 * @route   DELETE /api/history/item/:itemId
 * @desc    Elimina un elemento específico del historial del usuario
 * @access  Private
 */
router.delete('/item/:itemId', async (req, res) => {
  try {
    const userId = req.userId; // Ahora viene garantizado por el middleware de identificación
    const { itemId } = req.params;

    if (!userId) {
      return res.status(401).json({ 
        error: 'No autorizado',
        message: 'Se requiere identificación de usuario'
      });
    }

    if (!itemId) {
      return res.status(400).json({
        error: 'Solicitud incorrecta',
        message: 'Se requiere el ID del elemento del historial (itemId)'
      });
    }

    const success = await userHistory.deleteHistoryItem(userId, itemId);

    if (success) {
      res.json({
        success: true,
        message: `Elemento de historial ${itemId} eliminado correctamente`
      });
    } else {
      res.status(404).json({ 
        // 404 si el item no se encontró o 500 si hubo otro error en el servicio
        // El servicio userHistory.deleteHistoryItem ya logea el error específico
        error: 'Error al eliminar elemento del historial',
        message: `No se pudo eliminar el elemento de historial ${itemId}. Puede que no exista o haya ocurrido un error.`
      });
    }
  } catch (error) {
    console.error(`Error al eliminar elemento ${req.params.itemId} del historial:`, error);
    res.status(500).json({ 
      error: 'Error interno del servidor al eliminar elemento del historial',
      message: error.message 
    });
  }
});

module.exports = router;
