const express = require('express');
const router = express.Router();
const SpotifyApiWithCache = require('../services/spotify/spotifyApiWithCache');
const openaiService = require('../services/ai/openai');
const userHistory = require('../services/history/userHistory');
const taskQueue = require('../services/queue/taskQueue');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/**
 * @route   POST /api/assistant/message
 * @desc    Procesa un mensaje del usuario y determina las acciones a realizar
 * @access  Private
 */
router.post('/message', async (req, res) => {
  const { message, userId } = req.body;
  const accessToken = req.headers.authorization?.split(' ')[1] || null;
  
  if (!message) {
    return res.status(400).json({ error: 'Mensaje requerido' });
  }
  
  // Verificar si hay token de autenticación
  if (!accessToken) {
    return res.status(401).json({
      error: 'No autorizado',
      message: 'Se requiere iniciar sesión con Spotify nuevamente'
    });
  }
  
  // Crear instancia de SpotifyApi con caché para este usuario
  const spotifyApi = new SpotifyApiWithCache(userId);
  spotifyApi.setAccessToken(accessToken);
  
  try {
    // Verificar si hay un dispositivo activo antes de procesar comandos de reproducción
    let deviceActive = false;
    let hasDevices = false;
    let playbackContext = null;
    
    try {
      // Intentar obtener dispositivos disponibles
      console.log('Verificando dispositivos disponibles con token:', accessToken.substring(0, 10) + '...');
      const devices = await spotifyApi.getMyDevices();
      
      if (devices && devices.body && devices.body.devices) {
        hasDevices = devices.body.devices.length > 0;
        deviceActive = devices.body.devices.some(device => device.is_active);
        
        console.log(`Dispositivos disponibles: ${devices.body.devices.length}`);
        devices.body.devices.forEach((device, index) => {
          console.log(`Dispositivo ${index+1}: ${device.name} (${device.type}) - Activo: ${device.is_active}`);
        });
      }
      
      // Obtener el contexto actual de reproducción si hay un dispositivo activo
      if (deviceActive) {
        console.log('🎵 Obteniendo información de reproducción actual para contexto...');
        try {
          // Obtener la canción actual
          const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();
          
          // Obtener la cola de reproducción
          const queueResponse = await fetch(`${process.env.API_URL || 'http://localhost:5000'}/api/user/queue`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (queueResponse.ok) {
            const queueData = await queueResponse.json();
            playbackContext = queueData;
            
            console.log('💾 Contexto de reproducción cargado:');
            if (playbackContext.currentlyPlaying) {
              console.log(`   • Canción actual: ${playbackContext.currentlyPlaying.name} - ${playbackContext.currentlyPlaying.artist}`);
              console.log(`   • Estado: ${playbackContext.currentlyPlaying.isPlaying ? 'Reproduciendo' : 'Pausado'}`);
            }
            console.log(`   • Canciones en cola: ${playbackContext.nextInQueue?.length || 0}`);
          }
        } catch (contextError) {
          console.warn('Error al obtener contexto de reproducción:', contextError.message || contextError);
          // Continuamos sin contexto si hay error
        }
      }
    } catch (deviceError) {
      console.warn('Error al verificar dispositivos:', deviceError.message || deviceError);
      // Continuamos aunque haya error, el manejo principal se hará en los comandos específicos
    }
    
    // Procesar el mensaje con OpenAI incluyendo el contexto de reproducción
    console.log('💬 Procesando mensaje del usuario con contexto enriquecido...');
    
    // Obtener historial reciente del usuario para mejorar respuestas
    let userRecentCommands = [];
    if (userId) {
      try {
        userRecentCommands = await userHistory.getMostUsedCommands(userId, 5);
        console.log(`📊 Comandos recientes del usuario: ${userRecentCommands.map(c => c.command).join(', ')}`);
      } catch (historyError) {
        console.warn('⚠️ Error al obtener historial de comandos:', historyError);
      }
    }
    
    // Incluir el historial de comandos en el contexto para OpenAI
    const result = await openaiService.processMessage(message, {
      ...playbackContext,
      userRecentCommands: userRecentCommands.length > 0 ? userRecentCommands : undefined
    });
    
    const { action, parameters, message: responseMessage } = result;
    
    // Registrar este comando en el historial de usuario
    if (userId) {
      try {
        await userHistory.addToHistory(userId, userHistory.EVENT_TYPES.COMMAND, {
          command: action,
          parameters,
          userMessage: message,
          responseMessage
        });
        console.log(`✅ Comando registrado en historial: ${action}`);
      } catch (saveHistoryError) {
        console.warn('⚠️ Error al guardar en historial:', saveHistoryError);
      }
    }
    
    // Realizar acciones según la intención identificada
    let response = {
      action,
      message: responseMessage
    };
    
    // Si no hay dispositivo activo y es un comando de reproducción o cola, mostrar mensaje especial
    if (!deviceActive && ['play', 'pause', 'resume', 'next', 'previous', 'volume', 'queue'].includes(action)) {
      return res.json({
        action: 'error',
        message: 'No hay ningún dispositivo de Spotify activo. Por favor, abre Spotify en tu computadora o móvil y reproduce cualquier canción primero.'
      });
    }
    
    // Ejecutar acciones de Spotify según la acción determinada
    switch (action) {
      case 'play':
        if (parameters && parameters.query) {
          console.log('🔎 SPOTIFY: Iniciando búsqueda');
          console.log('   • Consulta:', parameters.query);
          
          try {
            // Buscar la canción o artista en Spotify
            const searchResults = await spotifyApi.search(parameters.query, ['track'], { limit: 3 });
            
            console.log('💾 SPOTIFY: Resultados de búsqueda');
            console.log('   • Canciones encontradas:', searchResults.body.tracks.items.length);
            
            if (searchResults.body.tracks.items.length > 0) {
              const track = searchResults.body.tracks.items[0];
              console.log('🎧 SPOTIFY: Mejor coincidencia');
              console.log('   • Pista:', track.name);
              console.log('   • Artista:', track.artists[0].name);
              console.log('   • Álbum:', track.album.name);
              
              // Reproducir la canción
              console.log('▶️ SPOTIFY: Ejecutando reproducción');
              await spotifyApi.play({ uris: [track.uri] });
              console.log('   • Comando enviado correctamente');
              console.log('   • URI:', track.uri);
              
              console.log('🔊 SPOTIFY: Reproduciendo');  
              console.log('   • URI:', track.uri);
              const playResult = await spotifyApi.play({ uris: [track.uri] });
              
              // Registrar reproducción en el historial
              if (userId) {
                try {
                  await userHistory.addToHistory(userId, userHistory.EVENT_TYPES.PLAYBACK, {
                    trackId: track.id,
                    trackName: track.name,
                    artistId: track.artists[0].id,
                    artistName: track.artists[0].name,
                    albumName: track.album.name,
                    action: 'play'
                  });
                  
                  // En segundo plano, analizar esta canción para recomendaciones futuras
                  if (track.id) {
                    taskQueue.enqueueTask(
                      taskQueue.TASK_TYPES.SONG_ANALYSIS,
                      { trackId: track.id },
                      userId
                    ).then(taskId => {
                      console.log(`💾 Análisis de canción en cola: ${taskId}`);
                    }).catch(e => console.error('Error al encolar análisis:', e));
                  }
                } catch (historyError) {
                  console.warn('⚠️ Error al registrar reproducción:', historyError);
                }
              }
              
              // Actualizamos el mensaje para ser más preciso
              response.message = `Reproduciendo "${track.name}" de ${track.artists[0].name}`;
              
              // Incluir información de la pista en la respuesta
              response.track = {
                name: track.name,
                artist: track.artists[0].name,
                album: track.album.name,
                image: track.album.images[0]?.url
              };
            } else {
              console.log('❌ SPOTIFY: Sin resultados');
              console.log('   • Consulta fallida:', parameters.query);
              response = {
                action: 'error',
                message: `No encontré "${parameters.query}" en Spotify`
              };
            }
          } catch (err) {
            console.error('⚠️ ERROR: Fallo en búsqueda de Spotify');
            console.error('   • Mensaje:', err.message || err);
            response = {
              action: 'error',
              message: 'Ocurrió un error al buscar en Spotify. Por favor, intenta de nuevo.'
            };
          }
        } else {
          console.log('No se proporcionó consulta para reproducción');
        }
        break;
        
      case 'pause':
        await spotifyApi.pause();
        break;
        
      case 'resume':
        await spotifyApi.play();
        break;
        
      case 'next':
        await spotifyApi.skipToNext();
        
        // Obtener información de la canción actual
        try {
          const currentlyPlaying = await spotifyApi.getMyCurrentPlayingTrack();
          
          if (currentlyPlaying.body && currentlyPlaying.body.item) {
            const track = currentlyPlaying.body.item;
            response.track = {
              name: track.name,
              artist: track.artists[0].name,
              album: track.album.name,
              image: track.album.images[0]?.url
            };
          }
        } catch (err) {
          console.error('Error al obtener información de la canción actual:', err);
        }
        break;
        
      case 'previous':
        await spotifyApi.skipToPrevious();
        break;
        
      case 'volume':
        if (parameters && parameters.level !== undefined) {
          await spotifyApi.setVolume(parameters.level);
        }
        break;
        
      case 'queue':
        if (parameters && parameters.query) {
          console.log('🔍 QUEUE: Buscando para añadir a la cola');
          console.log('   • Consulta:', parameters.query);
          
          try {
            // Buscar la canción en Spotify
            const searchResults = await spotifyApi.search(parameters.query, ['track'], { limit: 3 });
            
            console.log('💾 SPOTIFY: Resultados de búsqueda para cola');
            console.log('   • Canciones encontradas:', searchResults.body.tracks.items.length);
            
            if (searchResults.body.tracks.items.length > 0) {
              const track = searchResults.body.tracks.items[0];
              console.log('🎵 SPOTIFY: Mejor coincidencia para cola');
              console.log('   • Pista:', track.name);
              console.log('   • Artista:', track.artists[0].name);
              
              // Añadir la canción a la cola
              console.log('⏭️ SPOTIFY: Añadiendo a la cola');
              await spotifyApi.addToQueue(track.uri);
              console.log('   • Comando enviado correctamente');
              console.log('   • URI:', track.uri);
              
              // Actualizar el mensaje de respuesta
              response.message = `Añadido "${track.name}" de ${track.artists[0].name} a la cola de reproducción`;
              
              // Incluir información de la canción en la respuesta
              response.track = {
                name: track.name,
                artist: track.artists[0].name,
                album: track.album.name,
                image: track.album.images[0]?.url,
                addedToQueue: true
              };
            } else {
              console.log('❌ SPOTIFY: Sin resultados para cola');
              console.log('   • Consulta fallida:', parameters.query);
              response = {
                action: 'error',
                message: `No encontré "${parameters.query}" en Spotify para añadir a la cola`
              };
            }
          } catch (err) {
            console.error('⚠️ ERROR: Fallo al añadir a la cola');
            console.error('   • Mensaje:', err.message || err);
            response = {
              action: 'error',
              message: 'Ocurrió un error al intentar añadir a la cola. Por favor, intenta de nuevo.'
            };
          }
        } else {
          console.log('No se proporcionó consulta para añadir a la cola');
          response = {
            action: 'error',
            message: 'No entendí qué cancion quieres añadir a la cola.'
          };
        }
        break;
        
      case 'queue_multiple':
        if (parameters && parameters.queries && Array.isArray(parameters.queries) && parameters.queries.length > 0) {
          const songQueries = parameters.queries;
          console.log(`🎼 MULTI-COLA: Procesando ${songQueries.length} solicitudes de canciones`);
          
          // Resultados del procesamiento
          const results = [];
          const successfulTracks = [];
          const failedQueries = [];
          
          // Procesar cada canción secuencialmente
          for (let i = 0; i < songQueries.length; i++) {
            const songQuery = songQueries[i];
            console.log(`🔎 MULTI-COLA [${i+1}/${songQueries.length}]: Buscando "${songQuery}"`);
            
            try {
              // Buscar la canción en Spotify
              const searchResults = await spotifyApi.search(songQuery, ['track'], { limit: 3 });
              
              if (searchResults.body.tracks.items.length > 0) {
                const track = searchResults.body.tracks.items[0];
                console.log(`✅ MULTI-COLA [${i+1}]: Encontrado "${track.name}" de ${track.artists[0].name}`);
                
                // Añadir a la cola
                await spotifyApi.addToQueue(track.uri);
                
                // Registrar éxito
                successfulTracks.push({
                  name: track.name,
                  artist: track.artists[0].name,
                  album: track.album.name,
                  image: track.album.images[0]?.url,
                  uri: track.uri,
                  addedToQueue: true
                });
                
                // Mantener en caché global para seguimiento
                if (!global.spotifyQueueCache) {
                  global.spotifyQueueCache = [];
                }
                
                global.spotifyQueueCache.push({
                  name: track.name,
                  artist: track.artists[0].name,
                  album: track.album.name,
                  image: track.album.images[0]?.url,
                  uri: track.uri
                });
                
                results.push({
                  query: songQuery,
                  success: true,
                  track: track.name,
                  artist: track.artists[0].name
                });
              } else {
                console.log(`❌ MULTI-COLA [${i+1}]: No se encontró "${songQuery}"`);
                failedQueries.push(songQuery);
                results.push({
                  query: songQuery,
                  success: false,
                  message: `No se encontró "${songQuery}"`
                });
              }
            } catch (err) {
              console.error(`⚠️ ERROR MULTI-COLA [${i+1}]:`, err.message || err);
              failedQueries.push(songQuery);
              results.push({
                query: songQuery,
                success: false,
                message: `Error procesando "${songQuery}"`
              });
            }
          }
          
          // Generar mensaje de respuesta basado en resultados
          if (successfulTracks.length > 0) {
            const successMessage = successfulTracks.length === 1 ?
              `Añadido "${successfulTracks[0].name}" de ${successfulTracks[0].artist} a la cola` :
              `Añadidas ${successfulTracks.length} canciones a la cola de reproducción`;
              
            let detailMessage = '';
            if (successfulTracks.length > 1) {
              detailMessage = ': ' + successfulTracks.map(t => `"${t.name}" de ${t.artist}`).join(', ');
            }
            
            let failMessage = '';
            if (failedQueries.length > 0) {
              failMessage = `. No pude encontrar: ${failedQueries.map(q => `"${q}"`).join(', ')}`;
            }
            
            response.message = successMessage + detailMessage + failMessage;
            response.tracks = successfulTracks;
            response.queue = global.spotifyQueueCache || [];
          } else {
            response = {
              action: 'error',
              message: `No pude encontrar ninguna de las canciones solicitadas: ${failedQueries.map(q => `"${q}"`).join(', ')}`
            };
          }
        } else {
          console.log('No se proporcionaron consultas para multi-cola');
          response = {
            action: 'error',
            message: 'No entendí qué canciones quieres añadir a la cola.'
          };
        }
        break;
        
      case 'search':
        if (parameters && parameters.query) {
          const searchResults = await spotifyApi.search(
            parameters.query,
            ['track', 'artist', 'album'],
            { limit: 5 }
          );
          
          // Formatear resultados de búsqueda para incluirlos en la respuesta
          if (searchResults.body.tracks.items.length > 0) {
            response.searchResults = {
              tracks: searchResults.body.tracks.items.map(track => ({
                name: track.name,
                artist: track.artists[0].name,
                album: track.album.name,
                image: track.album.images[0]?.url,
                uri: track.uri
              }))
            };
          } else {
            response.message = `No encontré resultados para "${parameters.query}"`;
          }
        }
        break;
    }
    
    // Enviar respuesta a través de Socket.io si está disponible
    if (global.io && userId) {
      global.io.to(userId).emit('assistant_response', {
        message: response.message
      });
      
      // Si hay actualización de reproducción, enviar evento de actualización
      if (response.track) {
        global.io.to(userId).emit('playback_update', {
          name: response.track.name,
          artist: response.track.artist,
          album: response.track.album,
          image: response.track.image,
          isPlaying: action === 'play' || action === 'resume',
          addedToQueue: action === 'queue' && response.track?.addedToQueue
        });
      }
    }
    
    // Retornar la respuesta al cliente
    return res.json(response);
  } catch (error) {
    console.error('Error al procesar mensaje:', error);
    res.status(500).json({ 
      error: 'Error al procesar tu mensaje', 
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/assistant/status
 * @desc    Verifica el estado del asistente
 * @access  Public
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    capabilities: [
      'control_playback',
      'search_music',
      'text_commands'
    ]
  });
});

module.exports = router;
