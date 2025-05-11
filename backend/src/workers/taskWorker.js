/**
 * Worker para procesar tareas asíncronas de la cola
 * Este script puede ejecutarse independientemente del servidor principal
 */
const { dequeueTask, completeTask, TASK_TYPES } = require('../services/queue/taskQueue');
const SpotifyApiWithCache = require('../services/spotify/spotifyApiWithCache');
const openaiService = require('../services/ai/openai');

// Intervalo de sondeo en milisegundos
const POLLING_INTERVAL = 1000;

// Flag para controlar la ejecución
let isRunning = true;

/**
 * Procesa una tarea basada en su tipo
 * @param {Object} task - Tarea a procesar
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
async function processTask(task) {
  console.log(`🔄 Procesando tarea: ${task.id} (${task.type})`);
  
  try {
    const { type, data, userId } = task;
    let result;
    
    // Configurar cliente de Spotify con las credenciales del usuario y caché
    const spotifyApi = new SpotifyApiWithCache(userId);
    
    // Procesar según el tipo de tarea
    switch (type) {
      case TASK_TYPES.RECOMMENDATION_ANALYSIS:
        result = await processRecommendationTask(data, spotifyApi);
        break;
        
      case TASK_TYPES.LYRICS_PROCESSING:
        result = await processLyricsTask(data, spotifyApi);
        break;
        
      case TASK_TYPES.PLAYLIST_GENERATION:
        result = await processPlaylistGenerationTask(data, spotifyApi);
        break;
        
      case TASK_TYPES.SONG_ANALYSIS:
        result = await processSongAnalysisTask(data, spotifyApi);
        break;
        
      case TASK_TYPES.ARTIST_RESEARCH:
        result = await processArtistResearchTask(data, spotifyApi);
        break;
        
      default:
        throw new Error(`Tipo de tarea no soportado: ${type}`);
    }
    
    // Completar tarea con éxito
    await completeTask(task.id, result, true);
    return result;
  } catch (error) {
    console.error(`❌ Error al procesar tarea ${task.id}:`, error);
    
    // Completar tarea con error
    await completeTask(task.id, null, false, error.message || 'Error desconocido');
    return null;
  }
}

/**
 * Procesa una tarea de análisis de recomendaciones
 * @param {Object} data - Datos de la tarea
 * @param {Object} spotifyApi - Cliente de Spotify API
 */
async function processRecommendationTask(data, spotifyApi) {
  const { seedTracks, seedArtists, limit = 10 } = data;
  
  // Obtener recomendaciones de Spotify
  const recommendations = await spotifyApi.getRecommendations({
    seed_tracks: seedTracks || [],
    seed_artists: seedArtists || [],
    limit
  });
  
  // Aquí podríamos enriquecer las recomendaciones con análisis de OpenAI
  // Por ejemplo, explicar por qué se recomiendan estas canciones
  
  return {
    recommendations: recommendations.tracks,
    explanation: "Estas canciones se recomiendan basadas en tu historial y preferencias",
    timestamp: Date.now()
  };
}

/**
 * Procesa una tarea de análisis de letras
 * @param {Object} data - Datos de la tarea
 * @param {Object} spotifyApi - Cliente de Spotify API
 */
async function processLyricsTask(data, spotifyApi) {
  // Implementación simulada - En producción conectaríamos con un servicio de letras
  const { trackId, trackName, artistName } = data;
  
  // Aquí se conectaría con un servicio de letras (Musixmatch, Genius, etc.)
  const mockLyrics = `Estas son las letras simuladas para "${trackName}" de ${artistName}...`;
  
  // Se podría usar OpenAI para analizar el significado de las letras
  const analysis = "Análisis simulado de la canción...";
  
  return {
    trackId,
    lyrics: mockLyrics,
    analysis,
    timestamp: Date.now()
  };
}

/**
 * Procesa una tarea de generación de playlist
 * @param {Object} data - Datos de la tarea
 * @param {Object} spotifyApi - Cliente de Spotify API
 */
async function processPlaylistGenerationTask(data, spotifyApi) {
  const { description, name, trackUris, isPublic = false } = data;
  
  // Crear playlist en Spotify
  const playlist = await spotifyApi.createPlaylist(name, {
    description,
    public: isPublic
  });
  
  // Añadir canciones a la playlist
  if (trackUris && trackUris.length > 0) {
    await spotifyApi.addTracksToPlaylist(playlist.id, trackUris);
  }
  
  return {
    playlistId: playlist.id,
    playlistUrl: playlist.external_urls.spotify,
    trackCount: trackUris ? trackUris.length : 0,
    timestamp: Date.now()
  };
}

/**
 * Procesa una tarea de análisis de canción
 * @param {Object} data - Datos de la tarea
 * @param {Object} spotifyApi - Cliente de Spotify API
 */
async function processSongAnalysisTask(data, spotifyApi) {
  const { trackId } = data;
  
  // Obtener información de audio features de Spotify
  const audioFeatures = await spotifyApi.getAudioFeaturesForTrack(trackId);
  
  // Obtener información completa de la pista
  const trackInfo = await spotifyApi.getTrack(trackId);
  
  // Crear un análisis simplificado basado en características de audio
  const analysis = {
    energy: audioFeatures.energy,
    danceability: audioFeatures.danceability,
    tempo: audioFeatures.tempo,
    valence: audioFeatures.valence,
    acousticness: audioFeatures.acousticness,
    // Añadir interpretación basada en las características
    interpretation: generateInterpretation(audioFeatures)
  };
  
  return {
    trackId,
    trackName: trackInfo.name,
    artists: trackInfo.artists.map(a => a.name),
    analysis,
    timestamp: Date.now()
  };
}

/**
 * Genera una interpretación basada en características de audio
 * @param {Object} features - Características de audio
 * @returns {string} - Interpretación en texto
 */
function generateInterpretation(features) {
  // Esta función podría usar OpenAI para generar una interpretación más sofisticada
  // Por ahora implementamos algo simple basado en reglas
  
  let interpretation = [];
  
  if (features.energy > 0.8) interpretation.push("muy energética");
  else if (features.energy > 0.5) interpretation.push("energética");
  else interpretation.push("relajada");
  
  if (features.danceability > 0.7) interpretation.push("muy bailable");
  else if (features.danceability > 0.4) interpretation.push("bailable");
  
  if (features.valence > 0.7) interpretation.push("alegre");
  else if (features.valence < 0.3) interpretation.push("melancólica");
  
  if (features.acousticness > 0.7) interpretation.push("acústica");
  
  return `Esta canción es ${interpretation.join(", ")}, con un tempo de ${Math.round(features.tempo)} BPM.`;
}

/**
 * Procesa una tarea de investigación de artista
 * @param {Object} data - Datos de la tarea
 * @param {Object} spotifyApi - Cliente de Spotify API
 */
async function processArtistResearchTask(data, spotifyApi) {
  const { artistId, artistName } = data;
  
  // Obtener info del artista
  const artistInfo = artistId 
    ? await spotifyApi.getArtist(artistId)
    : await spotifyApi.searchArtists(artistName).then(res => res.artists.items[0]);
  
  if (!artistInfo) {
    throw new Error(`No se encontró información para el artista: ${artistName || artistId}`);
  }
  
  // Obtener top tracks del artista
  const topTracks = await spotifyApi.getArtistTopTracks(artistInfo.id, 'ES');
  
  // Obtener artistas relacionados
  const relatedArtists = await spotifyApi.getArtistRelatedArtists(artistInfo.id);
  
  // Aquí se podría usar OpenAI para generar una biografía o análisis del artista
  
  return {
    artistId: artistInfo.id,
    name: artistInfo.name,
    genres: artistInfo.genres,
    popularity: artistInfo.popularity,
    topTracks: topTracks.tracks.map(t => ({
      id: t.id,
      name: t.name,
      popularity: t.popularity
    })),
    relatedArtists: relatedArtists.artists.slice(0, 5).map(a => ({
      id: a.id,
      name: a.name
    })),
    timestamp: Date.now()
  };
}

/**
 * Bucle principal del worker
 */
async function workerLoop() {
  while (isRunning) {
    try {
      // Intentar obtener una tarea de la cola
      const task = await dequeueTask();
      
      if (task) {
        // Procesar la tarea
        await processTask(task);
      } else {
        // Si no hay tareas, esperar antes de volver a consultar
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
      }
    } catch (error) {
      console.error('❌ Error en el bucle del worker:', error);
      // Esperar antes de reintentar
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL * 5));
    }
  }
}

/**
 * Inicia el worker
 */
async function startWorker() {
  console.log('🚀 Iniciando worker de procesamiento de tareas...');
  isRunning = true;
  await workerLoop();
}

/**
 * Detiene el worker
 */
function stopWorker() {
  console.log('⏹️ Deteniendo worker...');
  isRunning = false;
}

// Manejar señales del sistema
process.on('SIGINT', () => {
  console.log('Recibida señal SIGINT. Deteniendo worker...');
  stopWorker();
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  console.log('Recibida señal SIGTERM. Deteniendo worker...');
  stopWorker();
  setTimeout(() => process.exit(0), 1000);
});

// Iniciar worker si se ejecuta directamente
if (require.main === module) {
  startWorker();
}

module.exports = {
  startWorker,
  stopWorker,
  processTask
};
