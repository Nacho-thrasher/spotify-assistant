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
          const queueResponse = await fetch(`${process.env.API_URL || 'http://localhost:8080'}/api/user/queue`, {
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
        // Manejar tanto consulta única como múltiples consultas
        if (parameters && (parameters.query || (parameters.queries && Array.isArray(parameters.queries)))) {
          // Caso 1: Múltiples canciones (parameters.queries)
          if (parameters.queries && Array.isArray(parameters.queries) && parameters.queries.length > 0) {
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
          }
          // Caso 2: Una sola canción (parameters.query)
          else if (parameters.query) {
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
          }
        } else {
          console.log('No se proporcionó consulta para añadir a la cola');
          response = {
            action: 'error',
            message: 'No entendí qué cancion quieres añadir a la cola.'
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
        
      case 'recommendations':
        console.log('🎶 SPOTIFY: Generando recomendaciones musicales');
        try {
          // Obtener recomendaciones basadas en la canción actual o en parámetros
          let seedTracks = [];
          let seedArtists = [];
          let seedGenres = [];
          
          // Si hay una canción en reproducción, usarla como semilla
          if (playbackContext?.currentlyPlaying?.id) {
            seedTracks.push(playbackContext.currentlyPlaying.id);
            console.log('   • Usando canción actual como semilla:', playbackContext.currentlyPlaying.name);
          }
          // Si se proporcionó una canción específica como semilla
          else if (parameters?.trackId) {
            seedTracks.push(parameters.trackId);
            console.log('   • Usando canción específica como semilla:', parameters.trackId);
          }
          // Si se proporcionó un artista como semilla
          else if (parameters?.artistId) {
            seedArtists.push(parameters.artistId);
            console.log('   • Usando artista como semilla:', parameters.artistId);
          }
          // Si se proporcionó un género como semilla
          else if (parameters?.genre) {
            seedGenres.push(parameters.genre);
            console.log('   • Usando género como semilla:', parameters.genre);
          }
          // Si no hay semillas, intentar buscar por consulta
          else if (parameters?.query) {
            // Buscar la canción o artista para usar como semilla
            const searchResults = await spotifyApi.search(parameters.query, ['track', 'artist'], { limit: 1 });
            
            if (searchResults.body.tracks.items.length > 0) {
              const track = searchResults.body.tracks.items[0];
              seedTracks.push(track.id);
              console.log('   • Usando canción de búsqueda como semilla:', track.name);
            } else if (searchResults.body.artists.items.length > 0) {
              const artist = searchResults.body.artists.items[0];
              seedArtists.push(artist.id);
              console.log('   • Usando artista de búsqueda como semilla:', artist.name);
            } else {
              // Si no hay resultados, usar un género popular
              seedGenres.push('pop');
              console.log('   • Sin resultados, usando género pop como semilla predeterminada');
            }
          }
          // Si no hay nada, usar la última canción reproducida o un género popular
          else {
            seedGenres.push('pop');
            console.log('   • Sin parámetros, usando género pop como semilla predeterminada');
          }
          
          // Preparar parámetros para las recomendaciones
          const recommendationParams = {};
          
          // Solo incluir parámetros que tengan valores
          if (seedTracks.length > 0) {
            recommendationParams.seed_tracks = seedTracks.join(',');
          }
          
          if (seedArtists.length > 0) {
            recommendationParams.seed_artists = seedArtists.join(',');
          }
          
          if (seedGenres.length > 0) {
            recommendationParams.seed_genres = seedGenres.join(',');
          }
          
          // Asegurarse de que al menos un parámetro de semilla esté presente
          if (Object.keys(recommendationParams).length === 0) {
            // Si no hay semillas, usar géneros populares
            recommendationParams.seed_genres = 'pop,rock';
            console.log('   • Sin semillas válidas, usando géneros populares como semilla');
          }
          
          // Añadir límite de resultados
          recommendationParams.limit = 5;
          
          console.log('Parámetros de recomendación:', recommendationParams);
          
          // Obtener recomendaciones de Spotify
          const recommendations = await spotifyApi.getRecommendations(recommendationParams);
          
          if (recommendations.body.tracks.length > 0) {
            console.log(`✅ SPOTIFY: Obtenidas ${recommendations.body.tracks.length} recomendaciones`);
            
            // Formatear recomendaciones para la respuesta
            const recommendedTracks = recommendations.body.tracks.map(track => ({
              name: track.name,
              artist: track.artists[0].name,
              album: track.album.name,
              image: track.album.images[0]?.url,
              uri: track.uri,
              id: track.id
            }));
            
            // Incluir recomendaciones en la respuesta
            response.recommendations = recommendedTracks;
            
            // Actualizar mensaje con las recomendaciones
            let recsMessage = 'Te recomiendo estas canciones: ';
            recsMessage += recommendedTracks.map((t, i) => `${i+1}. "${t.name}" de ${t.artist}`).join(', ');
            
            response.message = recsMessage;
          } else {
            console.log('❌ SPOTIFY: No se pudieron obtener recomendaciones');
            response.message = 'Lo siento, no pude encontrar recomendaciones en este momento. Inténtalo de nuevo más tarde.';
          }
        } catch (error) {
          console.error('⚠️ ERROR: Fallo al obtener recomendaciones:', error.message || error);
          response = {
            action: 'error',
            message: 'Ocurrió un error al buscar recomendaciones. Por favor, intenta de nuevo.'
          };
        }
        break;
        
      case 'get_info':
        console.log('🔍 SPOTIFY: Buscando información');
        try {
          const query = parameters?.query;
          const target = parameters?.target || 'all'; // 'artist', 'track', 'album' o 'all'
          
          if (!query) {
            response = {
              action: 'error',
              message: 'Necesito saber sobre qué artista, canción o álbum quieres información.'
            };
            break;
          }
          
          console.log('   • Consulta:', query);
          console.log('   • Objetivo:', target);
          
          // Determinar qué tipos de elementos buscar
          const types = [];
          if (target === 'all' || target === 'artist') types.push('artist');
          if (target === 'all' || target === 'track') types.push('track');
          if (target === 'all' || target === 'album') types.push('album');
          
          // Buscar en Spotify
          const searchResults = await spotifyApi.search(query, types, { limit: 3 });
          
          // Preparar objeto de respuesta con la información
          const info = {};
          let infoMessage = '';
          
          // Procesar artistas
          if (searchResults.body.artists && searchResults.body.artists.items.length > 0) {
            const artist = searchResults.body.artists.items[0];
            info.artist = {
              name: artist.name,
              genres: artist.genres,
              popularity: artist.popularity,
              followers: artist.followers.total,
              image: artist.images[0]?.url,
              uri: artist.uri,
              id: artist.id
            };
            
            // Obtener más detalles del artista
            try {
              const artistDetails = await spotifyApi.getArtist(artist.id);
              info.artist = {
                ...info.artist,
                ...artistDetails.body
              };
              
              // Obtener los álbumes principales
              try {
                // Método actualizado para obtener álbumes del artista
                const albums = await spotifyApi.getArtistAlbums(artist.id, { limit: 5 });
                if (albums.body.items.length > 0) {
                  info.artist.topAlbums = albums.body.items.map(album => ({
                    name: album.name,
                    releaseDate: album.release_date,
                    image: album.images[0]?.url
                  }));
                }
              } catch (albumError) {
                console.error(`Error al obtener álbumes para artista ${artist.id}:`, albumError.message);
                // Si hay error, continuamos sin álbumes
                info.artist.topAlbums = [];
              }
              
              // Obtener las canciones más populares
              try {
                const topTracks = await spotifyApi.getArtistTopTracks(artist.id, 'ES');
                if (topTracks.body.tracks.length > 0) {
                  info.artist.topTracks = topTracks.body.tracks.map(track => ({
                    name: track.name,
                    album: track.album.name,
                    popularity: track.popularity
                  }));
                }
              } catch (topTracksError) {
                console.error(`Error al obtener canciones populares para artista ${artist.id}:`, topTracksError.message);
                info.artist.topTracks = [];
              }
              
              // Crear mensaje informativo
              infoMessage = `${artist.name} es un artista de ${artist.genres.join(', ') || 'varios géneros'}. `;
              infoMessage += `Tiene ${artist.followers.total.toLocaleString()} seguidores en Spotify. `;
              
              if (info.artist.topTracks) {
                infoMessage += `Sus canciones más populares incluyen: ${info.artist.topTracks.slice(0, 3).map(t => t.name).join(', ')}. `;
              }
              
              if (info.artist.topAlbums) {
                infoMessage += `Entre sus álbumes destacan: ${info.artist.topAlbums.slice(0, 3).map(a => a.name).join(', ')}.`;
              }
            } catch (detailError) {
              console.warn('Error al obtener detalles del artista:', detailError.message);
              // Continuar con la información básica
              infoMessage = `${artist.name} es un artista de ${artist.genres.join(', ') || 'varios géneros'}. `;
              infoMessage += `Tiene ${artist.followers.total.toLocaleString()} seguidores en Spotify.`;
            }
          }
          
          // Procesar canciones
          if (searchResults.body.tracks && searchResults.body.tracks.items.length > 0) {
            const track = searchResults.body.tracks.items[0];
            info.track = {
              name: track.name,
              artist: track.artists[0].name,
              album: track.album.name,
              releaseDate: track.album.release_date,
              popularity: track.popularity,
              duration: Math.round(track.duration_ms / 1000),
              image: track.album.images[0]?.url,
              uri: track.uri,
              id: track.id
            };
            
            // Si no hay información de artista, usar la de la canción
            if (!infoMessage) {
              infoMessage = `"${track.name}" es una canción de ${track.artists[0].name} `;
              infoMessage += `del álbum "${track.album.name}" lanzado en ${track.album.release_date?.split('-')[0] || 'fecha desconocida'}. `;
              infoMessage += `La canción tiene una duración de ${Math.floor(track.duration_ms / 60000)}:${(Math.floor(track.duration_ms / 1000) % 60).toString().padStart(2, '0')}.`;
            }
          }
          
          // Procesar álbumes
          if (searchResults.body.albums && searchResults.body.albums.items.length > 0) {
            const album = searchResults.body.albums.items[0];
            info.album = {
              name: album.name,
              artist: album.artists[0].name,
              releaseDate: album.release_date,
              totalTracks: album.total_tracks,
              image: album.images[0]?.url,
              uri: album.uri,
              id: album.id
            };
            
            // Obtener más detalles del álbum
            try {
              const albumDetails = await spotifyApi.getAlbum(album.id);
              info.album = {
                ...info.album,
                ...albumDetails.body
              };
              
              // Obtener las canciones del álbum
              try {
                const albumTracks = await spotifyApi.getAlbumTracks(album.id, { limit: 20 });
                if (albumTracks.body.items.length > 0) {
                  info.album.tracks = albumTracks.body.items.map(track => ({
                    name: track.name,
                    duration: Math.round(track.duration_ms / 1000),
                    trackNumber: track.track_number
                  }));
                }
              } catch (albumTracksError) {
                console.error(`Error al obtener canciones del álbum ${album.id}:`, albumTracksError.message);
                // Si falla, intentamos usar los tracks del objeto albumDetails
                if (albumDetails.body.tracks && albumDetails.body.tracks.items) {
                  info.album.tracks = albumDetails.body.tracks.items.map(track => ({
                    name: track.name,
                    duration: Math.round(track.duration_ms / 1000),
                    trackNumber: track.track_number
                  }));
                } else {
                  info.album.tracks = [];
                }
              }
              
              // Si no hay información previa, usar la del álbum
              if (!infoMessage) {
                infoMessage = `"${album.name}" es un álbum de ${album.artists[0].name} `;
                infoMessage += `lanzado en ${album.release_date?.split('-')[0] || 'fecha desconocida'}. `;
                infoMessage += `Contiene ${album.total_tracks} canciones`;
                
                if (info.album.tracks) {
                  infoMessage += `, incluyendo: ${info.album.tracks.slice(0, 3).map(t => t.name).join(', ')}.`;
                } else {
                  infoMessage += '.'; 
                }
              }
            } catch (albumError) {
              console.warn('Error al obtener detalles del álbum:', albumError.message);
              // Continuar con la información básica
              if (!infoMessage) {
                infoMessage = `"${album.name}" es un álbum de ${album.artists[0].name} `;
                infoMessage += `lanzado en ${album.release_date?.split('-')[0] || 'fecha desconocida'}. `;
                infoMessage += `Contiene ${album.total_tracks} canciones.`;
              }
            }
          }
          
          // Si no se encontró información
          if (Object.keys(info).length === 0) {
            response = {
              action: 'error',
              message: `No encontré información sobre "${query}" en Spotify.`
            };
          } else {
            // Incluir la información en la respuesta
            response.info = info;
            response.message = infoMessage || `Aquí tienes información sobre "${query}".`;
          }
        } catch (error) {
          console.error('⚠️ ERROR: Fallo al obtener información:', error.message || error);
          response = {
            action: 'error',
            message: 'Ocurrió un error al buscar información. Por favor, intenta de nuevo.'
          };
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
