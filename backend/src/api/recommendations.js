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
    
    // Intento 1: Plan original
    try {
      recommendations = await spotifyApi.getRecommendations(recommendationParams);
      success = true;
    } catch (recError) {
      console.warn('⚠️ Error al obtener recomendaciones:', recError.statusCode, recError.message || recError);
      
      if (recError.body) {
        console.error('Detalles del error:', JSON.stringify(recError.body, null, 2));
      }
    }
    
    // Fallback 1: Cambiar mercado a US
    if (!success) {
      try {
        console.log('🔄 Fallback 1: Intentando con mercado US');
        const fallbackParams = {...recommendationParams, market: 'US'};
        recommendations = await spotifyApi.getRecommendations(fallbackParams);
        success = true;
      } catch (fallbackErr1) {
        console.warn('Fallback 1 falló:', fallbackErr1.statusCode);
      }
    }
    
    // Fallback 2: Usar género popular aleatorio
    if (!success) {
      try {
        console.log('🔄 Fallback 2: Intentando con género popular aleatorio');
        const safeGenres = ['pop', 'rock', 'hip-hop', 'latin'];
        const randomGenre = safeGenres[Math.floor(Math.random() * safeGenres.length)];
        
        recommendations = await spotifyApi.getRecommendations({
          seed_genres: randomGenre, 
          limit: 5, 
          market: 'US'
        });
        success = true;
      } catch (fallbackErr2) {
        console.warn('Fallback 2 falló:', fallbackErr2.statusCode);
      }
    }
    
    // Fallback 3: Obtener lista de géneros disponibles
    if (!success) {
      try {
        console.log('🔄 Fallback 3: Obteniendo géneros disponibles');
        
        // Verificar nuevamente que tenemos userId correcto
        if (!spotifyApi.userId) {
          console.log('⚠️ Re-configurando userId en spotifyApi para géneros:', userId);
          spotifyApi.userId = userId;
        }
        
        const genresResponse = await spotifyApi.getAvailableGenreSeeds();
        
        if (genresResponse?.body?.genres?.length > 0) {
          const availableGenres = genresResponse.body.genres;
          const randomIndex = Math.floor(Math.random() * availableGenres.length);
          const validGenre = availableGenres[randomIndex];
          
          console.log(`🔄 Usando género disponible: ${validGenre}`);
          
          recommendations = await spotifyApi.getRecommendations({
            seed_genres: validGenre, 
            limit: 5, 
            market: 'US'
          });
          success = true;
        } else {
          throw new Error('No se pudieron obtener géneros disponibles');
        }
      } catch (fallbackErr3) {
        console.warn('Fallback 3 falló:', fallbackErr3.statusCode || fallbackErr3.message);
      }
    }
    
    // Fallback 4: Artistas populares predefinidos
    if (!success) {
      try {
        console.log('🔄 Fallback 4: Último intento con artistas populares');
        
        // Verificar nuevamente que tenemos userId correcto
        if (!spotifyApi.userId) {
          console.log('⚠️ Re-configurando userId en spotifyApi para artistas:', userId);
          spotifyApi.userId = userId;
        }
        
        // Drake, Bad Bunny, The Weeknd, Taylor Swift, Ed Sheeran
        const popularArtists = [
          '3TVXtAsR1Inumwj472S9r4', '4q3ewBCX7sLwd24euuV69X', 
          '1Xyo4u8uXC1ZmMpatF05PJ', '06HL4z0CvFAxyc27GXpf02', 
          '6eUKZXaKkcviH0Ku9w2n3V'
        ];
        const randomArtist = popularArtists[Math.floor(Math.random() * popularArtists.length)];
        
        recommendations = await spotifyApi.getRecommendations({
          seed_artists: randomArtist, 
          limit: 5, 
          market: 'US'
        });
        success = true;
      } catch (fallbackErr4) {
        console.error('❌ Todos los intentos de recomendaciones fallaron');
        return {
          success: false,
          error: 'No se pudieron obtener recomendaciones después de varios intentos'
        };
      }
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
