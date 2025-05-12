/**
 * Esta función implementa el sistema de recomendaciones con métodos alternativos
 * @param {Object} spotifyApi - Instancia del API de Spotify con caché
 * @param {Object} parameters - Parámetros de recomendación
 * @param {Object} playbackContext - Contexto de reproducción actual
 * @param {string} userId - ID del usuario
 * @returns {Object} Recomendaciones obtenidas
 */
async function processRecommendations(spotifyApi, parameters, playbackContext, userId) {
  console.log('🎶 SPOTIFY: Generando recomendaciones musicales alternativas');
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

  // Preparar variables para almacenar las recomendaciones
  let tracks = [];
  
  try {
    // Obtener información necesaria para las recomendaciones
    let seedTracks = [];
    let seedArtists = [];
    let seedGenres = [];
    
    // Extraer información de parámetros o contexto
    if (playbackContext?.currentlyPlaying?.id) {
      let trackId = playbackContext.currentlyPlaying.id;
      if (trackId.includes(':')) trackId = trackId.split(':').pop();
      if (/^[a-zA-Z0-9]+$/.test(trackId)) seedTracks.push(trackId);
    } 
    else if (parameters?.trackId) {
      let trackId = parameters.trackId;
      if (trackId.includes(':')) trackId = trackId.split(':').pop();
      if (/^[a-zA-Z0-9]+$/.test(trackId)) seedTracks.push(trackId);
    } 
    else if (parameters?.artistId) {
      let artistId = parameters.artistId;
      if (artistId.includes(':')) artistId = artistId.split(':').pop();
      if (/^[a-zA-Z0-9]+$/.test(artistId)) seedArtists.push(artistId);
    } 
    else if (parameters?.genre) {
      seedGenres.push(parameters.genre.toLowerCase());
    } 
    else if (parameters?.query) {
      try {
        const searchResults = await spotifyApi.search(parameters.query, ['artist', 'track'], { limit: 1 });
        if (searchResults.body.tracks?.items?.length > 0) {
          seedTracks.push(searchResults.body.tracks.items[0].id);
        } else if (searchResults.body.artists?.items?.length > 0) {
          seedArtists.push(searchResults.body.artists.items[0].id);
        } else {
          seedGenres.push('pop');
        }
      } catch (error) {
        console.error('Error en búsqueda para recomendaciones:', error.message);
        seedGenres.push('pop');
      }
    } 
    else {
      seedGenres.push('pop');
    }
    
    console.log('Semillas para recomendaciones:', { seedTracks, seedArtists, seedGenres });
    
    // ESTRATEGIA 1: Intentar con artistas relacionados si tenemos un artista semilla
    if (tracks.length === 0 && seedArtists.length > 0) {
      try {
        console.log('🎸 Buscando artistas relacionados');
        const relatedResponse = await spotifyApi.getArtistRelatedArtists(seedArtists[0]);
        
        if (relatedResponse?.body?.artists?.length > 0) {
          const artists = relatedResponse.body.artists.slice(0, 3);
          
          for (const artist of artists) {
            try {
              const topTracks = await spotifyApi.getArtistTopTracks(artist.id, 'US');
              if (topTracks?.body?.tracks?.length > 0) {
                // Añadir 1-2 canciones de cada artista relacionado
                tracks.push(...topTracks.body.tracks.slice(0, 2));
              }
            } catch (error) {
              console.warn(`Error obteniendo tracks de ${artist.name}:`, error.message);
            }
          }
        }
      } catch (error) {
        console.warn('Error buscando artistas relacionados:', error.message);
      }
    }
    
    // ESTRATEGIA 2: Buscar canciones por género si tenemos un género semilla
    if (tracks.length === 0 && seedGenres.length > 0) {
      try {
        console.log(`🎵 Buscando canciones del género: ${seedGenres[0]}`);
        // Esto no usa recomendaciones sino búsqueda por género
        const genreSearchResponse = await spotifyApi.search(`genre:${seedGenres[0]}`, ['track'], { limit: 5 });
        
        if (genreSearchResponse?.body?.tracks?.items?.length > 0) {
          tracks.push(...genreSearchResponse.body.tracks.items);
        }
      } catch (error) {
        console.warn(`Error buscando tracks del género ${seedGenres[0]}:`, error.message);
      }
    }
    
    // ESTRATEGIA 3: Buscar canciones del mismo artista que la pista semilla
    if (tracks.length === 0 && seedTracks.length > 0) {
      try {
        console.log(`🎧 Buscando más canciones relacionadas con la pista: ${seedTracks[0]}`);
        const trackInfo = await spotifyApi.getTrack(seedTracks[0]);
        
        if (trackInfo?.body?.artists?.length > 0) {
          const artistId = trackInfo.body.artists[0].id;
          const topTracks = await spotifyApi.getArtistTopTracks(artistId, 'US');
          
          if (topTracks?.body?.tracks?.length > 0) {
            // Filtrar para no incluir la canción semilla
            tracks.push(...topTracks.body.tracks.filter(t => t.id !== seedTracks[0]));
          }
        }
      } catch (error) {
        console.warn('Error obteniendo tracks del artista:', error.message);
      }
    }
    
    // ESTRATEGIA 4: Último recurso - Usar artistas populares predefinidos
    if (tracks.length === 0) {
      try {
        console.log('🔄 Fallback final: Usando artistas populares predeterminados');
        // Drake, Bad Bunny, The Weeknd, Taylor Swift, Ed Sheeran
        const popularArtists = [
          '3TVXtAsR1Inumwj472S9r4', '4q3ewBCX7sLwd24euuV69X', 
          '1Xyo4u8uXC1ZmMpatF05PJ', '06HL4z0CvFAxyc27GXpf02', 
          '6eUKZXaKkcviH0Ku9w2n3V'
        ];
        
        // Seleccionar un artista aleatorio
        const randomArtist = popularArtists[Math.floor(Math.random() * popularArtists.length)];
        const topTracks = await spotifyApi.getArtistTopTracks(randomArtist, 'US');
        
        if (topTracks?.body?.tracks?.length > 0) {
          tracks.push(...topTracks.body.tracks.slice(0, 5));
        }
      } catch (error) {
        console.error('❌ Todos los intentos fallaron:', error.message);
        return {
          success: false,
          error: 'No se pudieron generar recomendaciones tras múltiples intentos.'
        };
      }
    }
    
    // Verificar que tenemos suficientes tracks
    if (tracks.length === 0) {
      return {
        success: false,
        error: 'No se encontraron canciones recomendadas.'
      };
    }
    
    // Limitar a 5 canciones y formatear la respuesta
    const recommendedTracks = tracks.slice(0, 5).map(track => ({
      name: track.name,
      artist: track.artists[0].name,
      album: track.album.name,
      image: track.album.images[0]?.url,
      uri: track.uri,
      id: track.id
    }));
    
    console.log(`✅ SPOTIFY: Obtenidas ${recommendedTracks.length} recomendaciones alternativas`);
    return {
      success: true,
      recommendations: recommendedTracks
    };
    
  } catch (error) {
    console.error('⚠️ ERROR: Fallo general en recomendaciones alternativas:', error.message || error);
    return {
      success: false,
      error: 'Error al obtener recomendaciones: ' + (error.message || 'Error desconocido')
    };
  }
}

module.exports = {
  processRecommendations
};
