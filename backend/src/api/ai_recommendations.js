/**
 * Recomendaciones basadas en IA usando búsqueda de Spotify
 * Este enfoque reemplaza el endpoint deprecado de recomendaciones de Spotify
 */
const modelProvider = require('../services/ai/modelProvider');

/**
 * Genera recomendaciones musicales usando IA y luego busca las canciones en Spotify
 * @param {Object} spotifyApi - Instancia de SpotifyApi con caché
 * @param {Object} parameters - Parámetros para las recomendaciones
 * @param {Object} playbackContext - Contexto de la reproducción actual (opcional)
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} - Resultado de la recomendación
 */
async function getAIRecommendations(spotifyApi, parameters, playbackContext, userId) {
  console.log('🤖 Generando recomendaciones con IA');
  
  // Verificar que tenemos un userId válido
  if (!userId) {
    console.error('⚠️ ERROR: No hay userId para recomendaciones');
    return {
      success: false,
      error: 'No se pueden obtener recomendaciones. Por favor, inicia sesión nuevamente con Spotify.'
    };
  }

  // Verificar que spotifyApi tenga userId configurado
  if (!spotifyApi.userId) {
    console.log('⚠️ Configurando userId en spotifyApi:', userId);
    spotifyApi.userId = userId;
  }
  
  try {
    // 1. Construir el contexto para la IA
    const promptContext = buildRecommendationContext(parameters, playbackContext);
    
    // 2. Solicitar recomendaciones a la IA
    const aiRecommendations = await getRecommendationsFromAI(promptContext);
    if (!aiRecommendations || aiRecommendations.length === 0) {
      throw new Error('La IA no pudo generar recomendaciones');
    }
    
    console.log(`✅ IA generó ${aiRecommendations.length} sugerencias de canciones`);
    
    // 3. Buscar las canciones en Spotify
    const spotifyTracks = await findTracksInSpotify(spotifyApi, aiRecommendations);
    
    // 4. Formatear los resultados
    if (spotifyTracks.length === 0) {
      return {
        success: false,
        error: 'No se pudieron encontrar las canciones recomendadas en Spotify'
      };
    }
    
    const recommendedTracks = spotifyTracks.map(track => ({
      name: track.name,
      artist: track.artists[0].name,
      album: track.album.name,
      image: track.album.images[0]?.url,
      uri: track.uri,
      id: track.id
    }));
    
    console.log(`✅ Encontradas ${recommendedTracks.length} canciones en Spotify`);
    
    return {
      success: true,
      recommendations: recommendedTracks,
      aiSuggestions: aiRecommendations // Incluimos las sugerencias originales de la IA
    };
  } catch (error) {
    console.error('⚠️ ERROR en recomendaciones con IA:', error.message || error);
    return {
      success: false,
      error: 'Error al obtener recomendaciones: ' + (error.message || 'Error desconocido')
    };
  }
}

/**
 * Construye un contexto para la solicitud de recomendaciones a la IA
 * @param {Object} parameters - Parámetros de la solicitud
 * @param {Object} playbackContext - Contexto de reproducción actual
 * @returns {Object} - Contexto para la IA
 */
function buildRecommendationContext(parameters, playbackContext) {
  const context = {
    type: 'music_recommendation',
    references: []
  };
  
  // Añadir información de la canción actual si está disponible
  if (playbackContext?.currentlyPlaying) {
    context.references.push({
      type: 'current_track',
      name: playbackContext.currentlyPlaying.name,
      artist: playbackContext.currentlyPlaying.artist
    });
  }
  
  // Añadir información de los parámetros
  if (parameters.query) {
    context.query = parameters.query;
  }
  
  if (parameters.genre) {
    context.genre = parameters.genre;
  }
  
  if (parameters.basedOn) {
    context.basedOn = parameters.basedOn;
  }
  
  return context;
}

/**
 * Solicita recomendaciones a la IA usando el modelProvider
 * @param {Object} context - Contexto para la IA
 * @returns {Promise<Array>} - Lista de recomendaciones
 */
async function getRecommendationsFromAI(context) {
  // Construir un prompt para OpenAI con instrucciones detalladas para formato
  let prompt = `INSTRUCCIONES EXTREMADAMENTE IMPORTANTES (NO IGNORAR):

Necesito EXACTAMENTE 5 recomendaciones musicales específicas con nombres de canciones y artistas. `;
  
  // Añadir contexto según lo que tengamos
  if (context.references.length > 0 && context.references[0].type === 'current_track') {
    const track = context.references[0];
    prompt += `Basadas en la canción "${track.name}" de ${track.artist}. `;
  }
  
  if (context.query) {
    prompt += `Relacionadas con: "${context.query}". `;
  }
  
  if (context.genre) {
    prompt += `Del género: ${context.genre}. `;
  }
  
  if (context.basedOn) {
    prompt += `Similares a: ${context.basedOn}. `;
  }
  
  prompt += `

IMPERATIVO: Debes proporcionar SOLO un array JSON con EXACTAMENTE este formato y NADA más:
[
  { "song": "Nombre de Canción 1", "artist": "Nombre de Artista 1" },
  { "song": "Nombre de Canción 2", "artist": "Nombre de Artista 2" },
  { "song": "Nombre de Canción 3", "artist": "Nombre de Artista 3" },
  { "song": "Nombre de Canción 4", "artist": "Nombre de Artista 4" },
  { "song": "Nombre de Canción 5", "artist": "Nombre de Artista 5" }
]

NO AÑADAS TEXTO FUERA DEL JSON. SOLO EL ARRAY JSON Y NADA MÁS.
NO escribas frases como "Aquí tienes" o "Estas son mis recomendaciones".
NO escribas explicaciones antes o después del JSON.
Tu respuesta completa debe ser SOLO el array JSON, sin nada más.`;
  
  try {
    // Llamar al modelProvider para obtener recomendaciones
    console.log('🧠 Generando recomendaciones con modelo de IA...');
    const response = await modelProvider.generateResponse('', prompt);
    
    // Parsear la respuesta
    if (!response) {
      throw new Error('No se recibió respuesta de la IA');
    }
    
    // Limpiar la respuesta de caracteres no deseados y texto extra
    let cleanResponse = response.trim();
    
    // Intentar extraer solo el JSON si hay texto adicional
    const jsonStartIndex = cleanResponse.indexOf('[');
    const jsonEndIndex = cleanResponse.lastIndexOf(']') + 1;
    
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      console.log('Encontrado posible JSON entre los índices:', jsonStartIndex, jsonEndIndex);
      cleanResponse = cleanResponse.substring(jsonStartIndex, jsonEndIndex);
    }
    
    console.log('Respuesta recibida original:', response);
    console.log('Respuesta limpiada para JSON:', cleanResponse);
    
    try {
      const jsonResponse = JSON.parse(cleanResponse);
      
      // La respuesta puede venir en diferentes formatos, intentamos manejarlos todos
      if (Array.isArray(jsonResponse)) {
        return jsonResponse;
      } else if (jsonResponse.recommendations && Array.isArray(jsonResponse.recommendations)) {
        return jsonResponse.recommendations;
      } else if (jsonResponse.songs && Array.isArray(jsonResponse.songs)) {
        return jsonResponse.songs;
      } else {
        // Construir un array a partir de propiedades numeradas
        const songs = [];
        for (let i = 1; i <= 5; i++) {
          if (jsonResponse[`song${i}`] && jsonResponse[`artist${i}`]) {
            songs.push({
              song: jsonResponse[`song${i}`],
              artist: jsonResponse[`artist${i}`]
            });
          }
        }
        
        if (songs.length > 0) {
          return songs;
        }
        
        // Buscar cualquier estructura que tenga song/artist o name/artist
        const recommendations = [];
        for (const key in jsonResponse) {
          const item = jsonResponse[key];
          if (typeof item === 'object' && (item.song || item.name) && item.artist) {
            recommendations.push({
              song: item.song || item.name,
              artist: item.artist
            });
          }
        }
        
        if (recommendations.length > 0) {
          return recommendations;
        }
        
        throw new Error('Formato de respuesta de IA no reconocido');
      }
    } catch (parseError) {
      console.error('Error al parsear respuesta de IA:', parseError);
      
      // Intentar extraer recomendaciones usando regex si falló el JSON
      const recommendations = [];
      // Mejorar regex para capturar más patrones de recomendaciones
      // Buscar diferentes formatos como:
      // - "1. Canción - Artista"
      // - "- Canción por Artista"
      // - "Canción by Artista"
      // - "Canción de Artista"
      const regexPatterns = [
        // Patrón con numeración o guiones
        /(?:\d+\.\s+|\-\s+)?["']?([^"'\-\n]+)["']?\s+(?:by|por|de|[-–])\s+([^,\n.;:"']+)/gi,
        // Patrón artista - canción (invertido)
        /([^,\n.;:]+)\s+[-–]\s+["']?([^"'\n]+)["']?/gi,
        // Patrón con "from"
        /["']?([^"'\n]+)["']?\s+from\s+([^,\n.;:"']+)/gi,
        // Buscar cualquier mención de canción y artista
        /"([^"]+)"\s+(?:by|de|por)\s+([^,\.\n]+)/gi
      ];
      
      const responseText = response.toString();
      // Intentar cada patrón
      for (const regex of regexPatterns) {
        let match;
        while ((match = regex.exec(responseText)) !== null && recommendations.length < 5) {
          // Verificar que son datos válidos (no vacíos)
          if (match[1]?.trim() && match[2]?.trim()) {
            recommendations.push({
              song: match[1].trim(),
              artist: match[2].trim()
            });
          }
        }
        
        // Si ya encontramos suficientes, salimos
        if (recommendations.length >= 3) {
          break;
        }
      }
      
      if (recommendations.length > 0) {
        return recommendations;
      }
      
      throw new Error('No se pudieron extraer recomendaciones del texto de la IA');
    }
  } catch (error) {
    console.error('Error al obtener recomendaciones de IA:', error);
    throw error;
  }
}

/**
 * Busca las canciones recomendadas en Spotify
 * @param {Object} spotifyApi - Instancia de SpotifyApi
 * @param {Array} recommendations - Lista de recomendaciones de la IA
 * @returns {Promise<Array>} - Lista de tracks encontrados en Spotify
 */
async function findTracksInSpotify(spotifyApi, recommendations) {
  const tracks = [];
  
  // Buscar cada canción recomendada en Spotify
  for (const rec of recommendations) {
    try {
      const songName = rec.song || rec.name || rec.title;
      const artistName = rec.artist || rec.by;
      
      if (!songName || !artistName) {
        console.warn('❌ Recomendación sin nombre de canción o artista:', rec);
        continue;
      }
      
      const searchQuery = `track:${songName} artist:${artistName}`;
      console.log(`🔍 Buscando en Spotify: ${searchQuery}`);
      
      const searchResults = await spotifyApi.search(searchQuery, ['track'], { limit: 1 });
      
      if (searchResults?.body?.tracks?.items?.length > 0) {
        tracks.push(searchResults.body.tracks.items[0]);
        console.log(`✅ Encontrado: "${songName}" por ${artistName}`);
      } else {
        // Si no encontramos con la búsqueda exacta, intentamos una búsqueda más genérica
        const fallbackQuery = `${songName} ${artistName}`;
        const fallbackResults = await spotifyApi.search(fallbackQuery, ['track'], { limit: 1 });
        
        if (fallbackResults?.body?.tracks?.items?.length > 0) {
          tracks.push(fallbackResults.body.tracks.items[0]);
          console.log(`✅ Encontrado (búsqueda genérica): "${fallbackResults.body.tracks.items[0].name}"`);
        } else {
          console.warn(`❌ No encontrado: "${songName}" por ${artistName}`);
        }
      }
    } catch (error) {
      console.warn(`❌ Error buscando "${rec.song || rec.name}" por ${rec.artist}:`, error.message);
    }
  }
  
  return tracks;
}

module.exports = {
  getAIRecommendations
};
