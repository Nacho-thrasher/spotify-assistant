/**
 * Script para probar la implementación de caché Redis
 * Ejecutar con: node src/scripts/testRedisCache.js
 */

require('dotenv').config();
const { redisClient, getAsync, setAsync } = require('../config/redis');
const cacheService = require('../services/cacheService');
const spotifyApi = require('../config/spotify');
const spotifyCache = require('../services/cache/spotifyCache');
const queueService = require('../services/spotify/queueService');

// Simular un ID de usuario
const userId = 'nacho';

// Función para probar el almacenamiento y recuperación básica
async function testBasicCaching() {
  console.log('=== PRUEBA DE CACHÉ BÁSICA ===');
  
  const testKey = 'test:basic';
  const testData = { message: 'Hello Redis', timestamp: Date.now() };
  
  console.log('Guardando datos en caché...');
  await setAsync(testKey, testData, 60);
  
  console.log('Recuperando datos de caché...');
  const retrievedData = await getAsync(testKey);
  
  console.log('Datos originales:', testData);
  console.log('Datos recuperados:', retrievedData);
  console.log('Éxito:', JSON.stringify(testData) === JSON.stringify(retrievedData));
  
  console.log('Eliminando clave de prueba...');
  await redisClient.del(testKey);
  console.log();
}

// Función para probar el caché de la API de Spotify
async function testSpotifyApiCaching() {
  console.log('=== PRUEBA DE CACHÉ DE API DE SPOTIFY ===');
  
  try {
    console.log('1. Probando caché de estado de reproducción...');
    console.time('Primera llamada (sin caché)');
    const firstCallData = await spotifyCache.getCachedData(
      'playback_state',
      userId,
      async () => {
        const response = await spotifyApi.getMyCurrentPlaybackState();
        return response.body;
      }
    );
    console.timeEnd('Primera llamada (sin caché)');
    
    console.log('Información de reproducción:', firstCallData ? {
      isPlaying: firstCallData.is_playing,
      trackName: firstCallData.item?.name,
      artist: firstCallData.item?.artists[0]?.name
    } : 'No hay reproducción activa');
    
    // Segunda llamada debería ser mucho más rápida si la caché funciona
    console.log('\n2. Probando recuperación desde caché...');
    console.time('Segunda llamada (con caché)');
    const secondCallData = await spotifyCache.getCachedData(
      'playback_state',
      userId,
      async () => {
        const response = await spotifyApi.getMyCurrentPlaybackState();
        return response.body;
      }
    );
    console.timeEnd('Segunda llamada (con caché)');
    
    console.log('\n3. Invalidando caché...');
    await spotifyCache.invalidateCache('playback_state', userId);
    console.log('Caché invalidada.');
    
    // Tercera llamada debería ser lenta nuevamente
    console.log('\n4. Llamada después de invalidar caché...');
    console.time('Tercera llamada (caché invalidada)');
    const thirdCallData = await spotifyCache.getCachedData(
      'playback_state',
      userId,
      async () => {
        const response = await spotifyApi.getMyCurrentPlaybackState();
        return response.body;
      }
    );
    console.timeEnd('Tercera llamada (caché invalidada)');
    
  } catch (error) {
    console.error('Error en prueba de caché de Spotify:', error.message);
  }
  console.log();
}

// Función para probar el caché global que estamos implementando
async function testServiceCache() {
  console.log('=== PRUEBA DE SERVICIO DE CACHÉ ===');
  
  try {
    // Probar caché para obtener la cola
    console.log('1. Probando caché de cola de reproducción...');
    console.time('Primera llamada a cola (sin caché)');
    
    // Usar nuestro nuevo servicio de cola
    const firstQueueData = await queueService.getQueue(userId);
    console.timeEnd('Primera llamada a cola (sin caché)');
    
    console.log('Cola encontrada:', firstQueueData?.queue ? 
      `${firstQueueData.queue.length} elementos` : 
      'No se encontró cola');
    
    // Mostramos un poco de información de la cola si existe
    if (firstQueueData?.queue && firstQueueData.queue.length > 0) {
      const firstTrack = firstQueueData.queue[0];
      console.log('Primera canción en cola:', {
        name: firstTrack.name,
        artist: firstTrack.artists[0]?.name,
        album: firstTrack.album?.name
      });
    }
    
    // Segunda llamada para verificar caché
    console.log('\n2. Segunda llamada a cola (debería usar caché)...');
    console.time('Segunda llamada a cola (con caché)');
    const secondQueueData = await queueService.getQueue(userId);
    console.timeEnd('Segunda llamada a cola (con caché)');
    
    // Verificar si usó caché
    console.log(`¿Usó caché? ${secondQueueData === firstQueueData ? 'Sí, es la misma referencia' : 'Parece que no'}`);
    
    // Invalidar caché y reintentar
    console.log('\n3. Invalidando la caché de cola...');
    await spotifyCache.invalidateCache('queue', userId);
    console.log('Caché de cola invalidada.');
    
    // Tercera llamada después de invalidar
    console.log('\n4. Tercera llamada a cola (caché invalidada)...');
    console.time('Tercera llamada a cola');
    const thirdQueueData = await queueService.getQueue(userId);
    console.timeEnd('Tercera llamada a cola');
    
    console.log(`La tercera llamada devolvió ${thirdQueueData?.queue?.length || 0} elementos.`);
    
  } catch (error) {
    console.error('Error en prueba de servicio de caché:', error.message);
  }
}

// Ejecutar todas las pruebas
async function runTests() {
  try {
    // Verificar conexión a Redis
    console.log('Verificando conexión a Redis...');
    const pingResult = await redisClient.ping();
    console.log(`Respuesta de Redis: ${pingResult}\n`);
    
    // Ejecutar pruebas
    await testBasicCaching();
    await testSpotifyApiCaching();
    await testServiceCache();
    
    console.log('Todas las pruebas completadas.');
  } catch (error) {
    console.error('Error en pruebas:', error);
  } finally {
    // Cerrar conexión a Redis
    console.log('\nCerrando conexión a Redis...');
    await redisClient.quit();
    process.exit(0);
  }
}

// Ejecutar pruebas
runTests();
