/**
 * Esta función implementa el sistema de recomendaciones con fallbacks
 * @param {Object} spotifyApi - Instancia del API de Spotify con caché
 * @param {Object} parameters - Parámetros de recomendación
 * @param {Object} playbackContext - Contexto de reproducción actual
 * @param {string} userId - ID del usuario
 * @returns {Object} Recomendaciones obtenidas
 */
async function processRecommendations(spotifyApi, parameters, playbackContext, userId) {
  console.log('🎶 SPOTIFY: Generando recomendaciones musicales');
  console.log('Parámetros recibidos:', parameters);

  // Verificar que tenemos un userId válido
  if (!userId) {
    console.error('⚠️ ERROR: No hay userId para recomendaciones');
    return {
      success: false,
      error: 'No se pueden obtener recomendaciones. Por favor, inicia sesión nuevamente con Spotify.'
    };
  }

  // Verificamos que el spotifyApi tenga userId configurado correctamente
  if (!spotifyApi.userId) {
    console.log('⚠️ Configurando userId en spotifyApi:', userId);
    spotifyApi.userId = userId;
  }

  try {
    // Obtener recomendaciones basadas en la canción actual o en parámetros
    let seedTracks = [];
    let seedArtists = [];
    let seedGenres = [];
    
    // Si hay una canción en reproducción, usarla como semilla
    if (playbackContext?.currentlyPlaying?.id) {
      // Asegurar que tenemos ID y no URI
      let trackId = playbackContext.currentlyPlaying.id;
      // Limpiar el ID si tiene formato URI o URL
      if (trackId.includes(':')) {
        trackId = trackId.split(':').pop();
      } else if (trackId.includes('/')) {
        trackId = trackId.split('/').pop();
      }
      
      // Verificar si el track ID parece válido (alfanumérico, sin espacios)
      if (/^[a-zA-Z0-9]+$/.test(trackId)) {
        seedTracks.push(trackId);
        console.log('   • Usando canción actual como semilla:', playbackContext.currentlyPlaying.name, `(ID: ${trackId})`);
        
        // Verificar si la pista existe
        try {
          console.log('   • Verificando si la pista existe...');
          await spotifyApi.getTrack(trackId);
          console.log('   • ✅ Pista verificada y existe');
        } catch (trackError) {
          console.warn('   • ⚠️ La pista no se puede verificar:', trackError.statusCode || trackError.message);
          seedTracks = [];
        }
      } else {
        console.warn('   • ⚠️ ID de pista inválido, ignorando:', trackId);
      }
    }
    // Si se proporcionó una canción específica como semilla
    else if (parameters?.trackId) {
      // Asegurar que estamos usando ID y no URI
      let trackId = parameters.trackId;
      if (trackId.includes(':')) {
        trackId = trackId.split(':').pop();
      } else if (trackId.includes('/')) {
        trackId = trackId.split('/').pop();
      }
      
      // Verificar si el track ID parece válido
      if (/^[a-zA-Z0-9]+$/.test(trackId)) {
        seedTracks.push(trackId);
        console.log('   • Usando canción como semilla:', trackId);
        
        // Verificar si la pista existe
        try {
          console.log('   • Verificando si la pista existe...');
          await spotifyApi.getTrack(trackId);
          console.log('   • ✅ Pista verificada y existe');
        } catch (trackError) {
          console.warn('   • ⚠️ La pista no se puede verificar:', trackError.statusCode || trackError.message);
          seedTracks = [];
        }
      } else {
        console.warn('   • ⚠️ ID de pista inválido, ignorando:', trackId);
      }
    }
    // Si se proporcionó un artista como semilla
    else if (parameters?.artistId) {
      // Asegurar que estamos usando ID y no URI
      let artistId = parameters.artistId;
      if (artistId.includes(':')) {
        artistId = artistId.split(':').pop();
      } else if (artistId.includes('/')) {
        artistId = artistId.split('/').pop();
      }
      
      // Verificar si el artist ID parece válido
      if (/^[a-zA-Z0-9]+$/.test(artistId)) {
        seedArtists.push(artistId);
        console.log('   • Usando artista como semilla:', artistId);
        
        // Verificar si el artista existe
        try {
          console.log('   • Verificando si el artista existe...');
          await spotifyApi.getArtist(artistId);
          console.log('   • ✅ Artista verificado y existe');
        } catch (artistError) {
          console.warn('   • ⚠️ El artista no se puede verificar:', artistError.statusCode || artistError.message);
          seedArtists = [];
        }
      } else {
        console.warn('   • ⚠️ ID de artista inválido, ignorando:', artistId);
      }
    }
    // Si se proporcionó un género como semilla
    else if (parameters?.genre) {
      seedGenres.push(parameters.genre.toLowerCase());
      console.log('   • Usando género como semilla:', parameters.genre.toLowerCase());
    }
    // Si no hay semillas, intentar buscar por consulta
    else if (parameters?.query) {
      try {
        // Buscar la canción o artista para usar como semilla
        const searchResults = await spotifyApi.search(parameters.query, ['track', 'artist'], { limit: 1 });
        
        if (searchResults.body.tracks && searchResults.body.tracks.items.length > 0) {
          const track = searchResults.body.tracks.items[0];
          seedTracks.push(track.id); // Ya es un ID, no un URI
          console.log('   • Usando canción de búsqueda como semilla:', track.name, `(ID: ${track.id})`);
        } else if (searchResults.body.artists && searchResults.body.artists.items.length > 0) {
          const artist = searchResults.body.artists.items[0];
          seedArtists.push(artist.id); // Ya es un ID, no un URI
          console.log('   • Usando artista de búsqueda como semilla:', artist.name, `(ID: ${artist.id})`);
        } else {
          seedGenres.push('pop');
          console.log('   • Sin resultados, usando género pop como semilla predeterminada');
        }
      } catch (searchError) {
        console.error('Error en búsqueda para semillas:', searchError);
        seedGenres.push('pop');
        console.log('   • Error en búsqueda, usando género pop como semilla predeterminada');
      }
    }
    // Si no hay nada, usar un género popular
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
    if (!recommendationParams.seed_tracks && !recommendationParams.seed_artists && !recommendationParams.seed_genres) {
      // Si no hay semillas, usar géneros populares seguros
      recommendationParams.seed_genres = 'pop';
      console.log('   • Sin semillas válidas, usando pop como semilla predeterminada');
    }
    
    // Añadir parámetros obligatorios
    recommendationParams.limit = 5;
    recommendationParams.market = 'ES';
    
    console.log('Parámetros de recomendación:', recommendationParams);
    
    // Prueba previa para verificar si las recomendaciones funcionan en general
    try {
      console.log('🧪 Probando conexión a recomendaciones con género pop simple');
      const testRecommendation = await spotifyApi.getRecommendations({
        seed_genres: 'pop', 
        limit: 1,
        market: 'US'
      });
      console.log('✅ Prueba de conexión exitosa:', 
        testRecommendation.body.tracks?.length, 
        'resultados disponibles');
    } catch (testError) {
      console.error('❌ Fallo en prueba de conexión básica:', 
        testError.statusCode || testError);
    }
    
    // Obtener recomendaciones de Spotify
    let recommendations;
    let success = false;
  // NUEVO ENFOQUE: Ya que el endpoint de recomendaciones está marcado como deprecated,
  // utilizamos una combinación de otros endpoints para obtener tracks similares
  try {
    console.log('🔍 Utilizando nuevo método alternativo para recomendaciones');
    let tracksCollection = [];
    
    // Estrategia 1: Si tenemos un artista, buscar artistas relacionados y sus top tracks
    if (seedArtists.length > 0) {
      try {
        console.log('🎸 Buscando artistas relacionados a:', seedArtists[0]);
        
        // Verificar que tenemos userId correcto
        if (!spotifyApi.userId) {
          console.log('⚠️ Configurando userId en spotifyApi:', userId);
          spotifyApi.userId = userId;
        }
        
        // 1. Obtener artistas relacionados
        const relatedResponse = await spotifyApi.getArtistRelatedArtists(seedArtists[0]);
        
        if (relatedResponse?.body?.artists?.length > 0) {
          console.log(`✅ Encontrados ${relatedResponse.body.artists.length} artistas relacionados`);
          
          // 2. Para cada artista relacionado (hasta 3), obtener sus tracks principales
          const artistsToFetch = relatedResponse.body.artists.slice(0, 3);
          
          for (const artist of artistsToFetch) {
            try {
              console.log(`🔎 Obteniendo top tracks de ${artist.name}`);
              const topTracksResponse = await spotifyApi.getArtistTopTracks(artist.id, 'US');
              
              if (topTracksResponse?.body?.tracks?.length > 0) {
                // Añadir 2 tracks aleatorios de este artista
                const shuffledTracks = [...topTracksResponse.body.tracks]
                  .sort(() => 0.5 - Math.random())
                  .slice(0, 2);
                  
                tracksCollection = [...tracksCollection, ...shuffledTracks];
                console.log(`✅ Añadidas ${shuffledTracks.length} canciones de ${artist.name}`);
              }
            } catch (topTracksError) {
              console.warn(`⚠️ Error al obtener top tracks de ${artist.name}:`, topTracksError.statusCode);
            }
          }
        }
      } catch (relatedError) {
        console.warn('⚠️ Error al obtener artistas relacionados:', relatedError.statusCode);
      }
    }
    
    // Estrategia 2: Si tenemos un track, buscar su audio features y luego tracks similares
    else if (seedTracks.length > 0) {
      try {
        console.log('🎧 Buscando pistas con características similares a:', seedTracks[0]);
        
        // 1. Obtener audio features de la track semilla
        const featuresResponse = await spotifyApi.getAudioFeaturesForTrack(seedTracks[0]);
        
        if (featuresResponse?.body) {
          // 2. Obtener la track original para tener más contexto
          const trackResponse = await spotifyApi.getTrack(seedTracks[0]);
          
          if (trackResponse?.body) {
            const track = trackResponse.body;
            console.log(`✅ Analizando características de "${track.name}" por ${track.artists[0].name}`);
            
            // 3. Buscar tracks del mismo género o artista
            const searchQuery = track.artists[0].name;
            const searchResponse = await spotifyApi.search(searchQuery, ['track'], { limit: 10 });
            
            if (searchResponse?.body?.tracks?.items?.length > 0) {
              // Filtrar para excluir la canción original
              const filteredTracks = searchResponse.body.tracks.items.filter(t => t.id !== track.id);
              tracksCollection = [...tracksCollection, ...filteredTracks];
              console.log(`✅ Encontradas ${filteredTracks.length} canciones relacionadas con ${searchQuery}`);
            }
          }
        }
      } catch (featuresError) {
        console.warn('⚠️ Error al trabajar con features de la pista:', featuresError.statusCode);
      }
    }
    
    // Estrategia 3: Si tenemos un género, buscar artistas populares de ese género
    else if (seedGenres.length > 0) {
      try {
        const genre = seedGenres[0];
        console.log(`🎵 Buscando artistas populares del género: ${genre}`);
        
        // 1. Buscar artistas del género
        const searchResponse = await spotifyApi.search(`genre:${genre}`, ['artist'], { limit: 3 });
        
        if (searchResponse?.body?.artists?.items?.length > 0) {
          const artists = searchResponse.body.artists.items;
          console.log(`✅ Encontrados ${artists.length} artistas del género ${genre}`);
          
          // 2. Para cada artista, obtener sus tracks principales
          for (const artist of artists) {
            try {
              const topTracksResponse = await spotifyApi.getArtistTopTracks(artist.id, 'US');
              
              if (topTracksResponse?.body?.tracks?.length > 0) {
                // Añadir 2 tracks aleatorios de este artista
                const shuffledTracks = [...topTracksResponse.body.tracks]
                  .sort(() => 0.5 - Math.random())
                  .slice(0, 2);
                  
                tracksCollection = [...tracksCollection, ...shuffledTracks];
                console.log(`✅ Añadidas ${shuffledTracks.length} canciones de ${artist.name}`);
              }
            } catch (topTracksError) {
              console.warn(`⚠️ Error al obtener top tracks de ${artist.name}:`, topTracksError.statusCode);
            }
          }
        }
      } catch (genreError) {
        console.warn(`⚠️ Error al buscar artistas del género ${seedGenres[0]}:`, genreError.statusCode);
      }
    }
    
    // Estrategia 4: Si no tenemos nada, usar artistas populares predefinidos
    if (tracksCollection.length === 0) {
      try {
        console.log('🔄 Fallback: Usando artistas populares predefinidos');
        
        // Drake, Bad Bunny, The Weeknd, Taylor Swift, Ed Sheeran
        const popularArtists = [
          '3TVXtAsR1Inumwj472S9r4', '4q3ewBCX7sLwd24euuV69X', 
          '1Xyo4u8uXC1ZmMpatF05PJ', '06HL4z0CvFAxyc27GXpf02', 
          '6eUKZXaKkcviH0Ku9w2n3V'
        ];
        
        // Seleccionar 2 artistas aleatorios
        const selectedArtists = popularArtists
          .sort(() => 0.5 - Math.random())
          .slice(0, 2);
        
        // Obtener top tracks de cada uno
        for (const artistId of selectedArtists) {
          try {
            const topTracksResponse = await spotifyApi.getArtistTopTracks(artistId, 'US');
            
            if (topTracksResponse?.body?.tracks?.length > 0) {
              // Añadir 3 tracks aleatorios de este artista
              const shuffledTracks = [...topTracksResponse.body.tracks]
                .sort(() => 0.5 - Math.random())
                .slice(0, 3);
                
              tracksCollection = [...tracksCollection, ...shuffledTracks];
              console.log(`✅ Añadidas ${shuffledTracks.length} canciones del artista ${artistId}`);
            }
          } catch (topTracksError) {
            console.warn(`⚠️ Error al obtener top tracks del artista ${artistId}:`, topTracksError.statusCode);
          }
        }
      } catch (fallbackError) {
        console.error('❌ Todos los intentos de recomendaciones alternativas fallaron');
        return {
          success: false,
          error: 'No se pudieron obtener recomendaciones tras intentar todos los métodos alternativos'
        };
      }
    }
    
    // Preparar respuesta con las pistas recolectadas
    recommendations = {
      body: {
        tracks: tracksCollection.slice(0, 5) // Limitar a 5 pistas
      }
    };
    
    // Verificar que tengamos suficientes pistas
    success = recommendations.body.tracks.length > 0;
  }
  
    if (recommendations && recommendations.body && recommendations.body.tracks && recommendations.body.tracks.length > 0) {
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
      
      return {
        success: true,
        recommendations: recommendedTracks
      };
    } else {
      console.log('❌ SPOTIFY: No se pudieron obtener recomendaciones');
      return {
        success: false,
        error: 'No se encontraron recomendaciones.'
      };
    }
  } catch (error) {
    console.error('⚠️ ERROR: Fallo al obtener recomendaciones:', error.message || error);
    return {
      success: false,
      error: 'Error al obtener recomendaciones: ' + (error.message || 'Error desconocido')
    };
  }
}

module.exports = {
  processRecommendations
};
