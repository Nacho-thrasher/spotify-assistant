/**
 * API para pruebas y administración de Redis
 * Permite probar la integración de Redis de forma aislada
 */

const express = require('express');
const router = express.Router();
const { redisClient, getAsync, setAsync, DEFAULT_EXPIRATION } = require('../config/redis');
const cacheService = require('../services/cache/cacheService');
const getSpotifyForRequest = require('../services/spotify/getSpotifyInstance');
const queueService = require('../services/spotify/queueService');

// Constante para el ID de usuario por defecto
const DEFAULT_USER_ID = 'nacho';

// Función para obtener userId de forma segura
const getUserIdSafe = (req) => {
  return req.user?.id || req.session?.userId || req.headers['user-id'] || DEFAULT_USER_ID;
};

/**
 * @route   GET /api/cache/status
 * @desc    Verificar estado de Redis
 * @access  Private
 */
router.get('/status', async (req, res) => {
  try {
    // Verificar ping
    const pingResult = await redisClient.ping();
    
    // Obtener información general
    const info = await redisClient.info();
    
    // Test simple de almacenamiento/recuperación
    const testKey = 'cache:test:' + Date.now();
    const testValue = { timestamp: Date.now(), message: 'Hello Redis' };
    await setAsync(testKey, testValue, 60);
    
    const retrievedValue = await getAsync(testKey);
    const setGetSuccess = JSON.stringify(testValue) === JSON.stringify(retrievedValue);
    
    // Limpiar la llave de prueba
    await redisClient.del(testKey);
    
    res.json({
      status: 'OK',
      ping: pingResult,
      redis_info: info,
      cache_test: {
        success: setGetSuccess,
        testKey,
        original: testValue,
        retrieved: retrievedValue
      }
    });
  } catch (error) {
    console.error('Error al verificar estado de Redis:', error);
    res.status(500).json({ error: 'Error al verificar Redis', message: error.message });
  }
});

/**
 * @route   GET /api/cache/queue
 * @desc    Obtener cola usando caché Redis
 * @access  Private
 */
router.get('/queue', async (req, res) => {
  try {
    const userId = getUserIdSafe(req);
    const forceRefresh = req.query.force === 'true';
    
    console.log(`🔍 REDIS-CACHE: Obteniendo cola para ${userId} (forzar: ${forceRefresh})...`);
    
    // Si se solicita un refresco, invalidar caché primero
    if (forceRefresh) {
      await cacheService.invalidateCacheByPrefix(cacheService.CACHE_PREFIXES.SPOTIFY_QUEUE);
      console.log('🔄 REDIS-CACHE: Caché de cola invalidada, obteniendo datos frescos...');
    }
    
    // Usar queueService con caché Redis
    console.time('Tiempo total obtener cola');
    const queueData = await queueService.getQueue(userId);
    console.timeEnd('Tiempo total obtener cola');
    
    // Obtener la reproducción actual
    console.time('Tiempo obtener reproducción actual');
    // Obtener instancia específica para este usuario
    const spotifyApi = await getSpotifyForRequest(req);
    
    const playbackData = await cacheService.getCachedData(
      cacheService.CACHE_PREFIXES.SPOTIFY_NOW_PLAYING + userId,
      async () => {
        const response = await spotifyApi.getMyCurrentPlaybackState();
        return response.body;
      },
      forceRefresh ? 1 : cacheService.EXPIRATION_TIMES.NOW_PLAYING
    );
    console.timeEnd('Tiempo obtener reproducción actual');
    
    // Formatear datos para respuesta
    const currentlyPlaying = playbackData?.item ? {
      name: playbackData.item.name,
      artist: playbackData.item.artists[0].name,
      album: playbackData.item.album.name,
      image: playbackData.item.album.images[0]?.url,
      uri: playbackData.item.uri,
      isPlaying: playbackData.is_playing
    } : null;
    
    // Procesar y filtrar datos de la cola
    let nextInQueue = [];
    if (queueData?.queue && queueData.queue.length > 0) {
      nextInQueue = queueData.queue.map(track => ({
        name: track.name,
        artist: track.artists[0].name,
        album: track.album.name,
        image: track.album.images[0]?.url,
        uri: track.uri
      }));
      
      // Eliminar duplicados
      const uniqueUris = new Set();
      nextInQueue = nextInQueue.filter(track => {
        if (uniqueUris.has(track.uri)) return false;
        uniqueUris.add(track.uri);
        return true;
      });
      
      // Eliminar canción actual de la cola
      if (currentlyPlaying) {
        nextInQueue = nextInQueue.filter(track => track.uri !== currentlyPlaying.uri);
      }
    }
    
    // Información de caché para depuración
    const cacheInfo = {
      fromCache: !forceRefresh,
      queueSize: nextInQueue.length,
      currentlyPlayingCached: !!currentlyPlaying,
      timestamp: Date.now()
    };
    
    res.json({
      currentlyPlaying,
      nextInQueue,
      _cache: cacheInfo
    });
  } catch (error) {
    console.error('Error al obtener cola con caché:', error);
    res.status(500).json({
      error: 'Error al obtener cola con caché',
      message: error.message
    });
  }
});

/**
 * @route   DELETE /api/cache/clear
 * @desc    Limpiar caché por prefijo o clave específica
 * @access  Private
 */
router.delete('/clear', async (req, res) => {
  try {
    const { prefix, key } = req.query;
    const userId = getUserIdSafe(req);
    
    if (!prefix && !key) {
      return res.status(400).json({ error: 'Se requiere prefix o key' });
    }
    
    let keysDeleted = 0;
    
    if (key) {
      // Eliminar una clave específica
      await redisClient.del(key);
      keysDeleted = 1;
      console.log(`🧹 REDIS-CACHE: Limpiada clave específica: ${key}`);
    } else if (prefix) {
      // Eliminar por prefijo
      const prefixPattern = `${prefix}*`;
      const keys = await redisClient.keys(prefixPattern);
      
      if (keys.length > 0) {
        await redisClient.del(...keys);
        keysDeleted = keys.length;
        console.log(`🧹 REDIS-CACHE: Limpiadas ${keysDeleted} claves con prefijo: ${prefix}`);
      }
    }
    
    res.json({
      success: true,
      keysDeleted,
      message: `Se eliminaron ${keysDeleted} claves de caché`
    });
  } catch (error) {
    console.error('Error al limpiar caché:', error);
    res.status(500).json({ error: 'Error al limpiar caché', message: error.message });
  }
});

/**
 * @route   POST /api/cache/play-queue-item
 * @desc    Reproducir un elemento de la cola usando caché
 * @access  Private
 */
router.post('/play-queue-item', async (req, res) => {
  try {
    const userId = getUserIdSafe(req);
    const { index } = req.body;
    
    if (index === undefined || index < 0) {
      return res.status(400).json({ error: 'Se requiere un índice válido' });
    }
    
    console.log(`🎯 REDIS-CACHE: Intentando reproducir elemento #${index} de la cola...`);
    
    // Usar queueService para reproducir la canción
    const result = await queueService.playQueueItem(userId, index);
    
    // Invalidar caché de reproducción y cola después del cambio
    await cacheService.invalidateCache(cacheService.CACHE_PREFIXES.SPOTIFY_NOW_PLAYING + userId);
    await cacheService.invalidateCache(cacheService.CACHE_PREFIXES.SPOTIFY_QUEUE + userId);
    
    res.json({
      success: true,
      message: `Elemento #${index} de la cola reproducido correctamente`,
      trackInfo: result.trackInfo
    });
  } catch (error) {
    console.error('Error al reproducir elemento de cola con caché:', error);
    res.status(error.statusCode || 500).json({
      error: 'Error al reproducir elemento de la cola',
      message: error.message
    });
  }
});

module.exports = router;
