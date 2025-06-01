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
  try {
    // Construir el prompt para la IA
    let prompt = `Estoy buscando recomendaciones musicales. `;
    
    if (context.references && context.references.length > 0) {
      const currentTrack = context.references.find(ref => ref.type === 'current_track');
      if (currentTrack) {
        prompt += `Actualmente estoy escuchando "${currentTrack.name}" de ${currentTrack.artist}. `;
      }
    }
    
    if (context.query) {
      prompt += `Busco música relacionada con: ${context.query}. `;
    }
    
    if (context.genre) {
      prompt += `Del género: ${context.genre}. `;
    }
    
    if (context.basedOn) {
      prompt += `Similares a: ${context.basedOn}. `;
    }
    
    prompt += `

    ⚠️ INSTRUCCIONES ESTRICTAS: FORMATO DE RESPUESTA OBLIGATORIO ⚠️

    Debes responder EXCLUSIVAMENTE con un array JSON válido. NO DEBES INCLUIR NINGÚN OTRO TEXTO.

    🎯 FORMATO ÚNICO PERMITIDO (EJEMPLO):
    [
      { "song": "Nombre de Canción 1", "artist": "Nombre de Artista 1" },
      { "song": "Nombre de Canción 2", "artist": "Nombre de Artista 2" },
      { "song": "Nombre de Canción 3", "artist": "Nombre de Artista 3" },
      { "song": "Nombre de Canción 4", "artist": "Nombre de Artista 4" },
      { "song": "Nombre de Canción 5", "artist": "Nombre de Artista 5" }
    ]

    📌 REGLAS CRÍTICAS:

    1. RESPUESTA EN FORMATO JSON VÁLIDO, sin texto adicional.
    2. SOLO un array con objetos que tengan **exactamente dos claves**: "song" y "artist".
    3. NO incluyas texto antes, después ni fuera del JSON. Nada de frases como “Aquí tienes” o “Estas son mis recomendaciones”.
    4. NO uses etiquetas como \`\`\`, “json:”, ni ningún wrapper.
    5. NO repitas claves dentro de un mismo objeto.
    6. NO envíes más de un array.

    🚫 CUALQUIER TEXTO FUERA DEL ARRAY JSON INVALIDARÁ LA RESPUESTA.

    `;
    
    // Llamar al modelProvider para obtener recomendaciones
    console.log('🤖 Generando recomendaciones con modelo de IA...');
    const response = await modelProvider.generateResponse('', prompt, true);
    // Verificar que hay respuesta
    if (!response) {
      console.error('Error ia', response);
      throw new Error('No se recibió respuesta de la IA');
    }
    
    // Limpiar la respuesta de caracteres no deseados y texto extra
    let cleanResponse = response.trim();
    // Eliminar cualquier stacktrace o logs que puedan estar contaminando la respuesta
    cleanResponse = cleanResponse.replace(/\s+at\s+[\w\.]+\s?\([^)]+\)/g, "");
    cleanResponse = cleanResponse.replace(/\s+at\s+async\s+[^\n]+/g, "");
    
    // Intentar extraer solo el JSON si hay texto adicional (buscando array)
    const jsonStartIndex = cleanResponse.indexOf('[');
    const jsonEndIndex = cleanResponse.lastIndexOf(']') + 1;
    
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      console.log('Encontrado posible JSON entre los índices:', jsonStartIndex, jsonEndIndex);
      cleanResponse = cleanResponse.substring(jsonStartIndex, jsonEndIndex);
      
      // Limpiamos cualquier texto que pudiera estar entre elementos del array
      cleanResponse = cleanResponse.replace(/\}\s+[^\{\}\[\]"]+\s+\{/g, "},{");
    }
    
    // Log simplificado de la respuesta recibida
    console.log(`Respuesta IA recibida (${response.length} caracteres) y procesada para extraer JSON`);
    
    try {
      // Primero intentamos parsear como JSON
      const jsonResponse = JSON.parse(cleanResponse);
      
      // La respuesta puede venir en diferentes formatos, intentamos manejarlos todos
      // Guardamos el formato detectado para un solo log al final
      let formatoDetectado = '';
      
      if (Array.isArray(jsonResponse)) {
        // Caso 1: Array directo de recomendaciones [{ song, artist }, ...]
        formatoDetectado = 'Array de objetos';
        return jsonResponse;
      } 
      else if (jsonResponse.recommendations && Array.isArray(jsonResponse.recommendations)) {
        // Caso 2: Objeto con clave 'recommendations' que contiene el array
        formatoDetectado = 'Objeto con clave "recommendations"';
        return jsonResponse.recommendations;
      } 
      else if (jsonResponse.songs && Array.isArray(jsonResponse.songs)) {
        // Caso 3: Objeto con clave 'songs' que contiene el array
        formatoDetectado = 'Objeto con clave "songs"';
        return jsonResponse.songs;
      } 
      else if (jsonResponse.tracks && Array.isArray(jsonResponse.tracks)) {
        // Caso 4: Objeto con clave 'tracks' que contiene el array
        formatoDetectado = 'Objeto con clave "tracks"';
        return jsonResponse.tracks;
      }
      else if (jsonResponse.song && jsonResponse.artist) {
        // Caso 5: Un único objeto con song y artist (en lugar de un array)
        formatoDetectado = 'Objeto único con song/artist';
        return [jsonResponse]; // Convertirlo en array para mantener consistencia
      }
      else if (typeof jsonResponse === 'object' && Object.keys(jsonResponse).length > 0) {
        // Caso 6: Un objeto con múltiples pares clave-valor que podrían ser canciones
        // Por ejemplo: { "1": { "song": "X", "artist": "Y" }, "2": { ... } }
        const possibleRecommendations = [];
        
        for (const key in jsonResponse) {
          const item = jsonResponse[key];
          if (item && typeof item === 'object' && item.song && item.artist) {
            possibleRecommendations.push(item);
          }
        }
        
        if (possibleRecommendations.length > 0) {
          console.log(`Formato detectado: Objeto con ${possibleRecommendations.length} recomendaciones anidadas`);
          return possibleRecommendations;
        }
      }
      
      // Caso especial: respuesta con claves duplicadas
      // Si recibimos algo como { "song": "X", "artist": "Y", "song": "Z", "artist": "W" }
      // El parseo inicial solo guarda los últimos valores, pero intentamos rescatar más canciones
      const originalResponseStr = response.toString();
      
      // Verificamos si hay múltiples pares song/artist en el texto usando regex
      const songRegex = /"song"\s*:\s*"([^"]+)"/g;
      const artistRegex = /"artist"\s*:\s*"([^"]+)"/g;
      
      // Extraer todas las canciones
      const songs = [];
      let songMatch;
      while ((songMatch = songRegex.exec(originalResponseStr)) !== null) {
        if (songMatch[1]) songs.push(songMatch[1]);
      }
      
      // Extraer todos los artistas
      const artists = [];
      let artistMatch;
      while ((artistMatch = artistRegex.exec(originalResponseStr)) !== null) {
        if (artistMatch[1]) artists.push(artistMatch[1]);
      }
      
      // Si ambos arrays tienen la misma longitud, podemos asumir que corresponden entre sí
      if (songs.length > 0 && songs.length === artists.length) {
        console.log(`Formato detectado: Objeto con claves duplicadas - ${songs.length} pares song/artist`);
        
        // Crear array de recomendaciones
        const rescuedRecommendations = [];
        for (let i = 0; i < songs.length; i++) {
          rescuedRecommendations.push({
            song: songs[i],
            artist: artists[i]
          });
        }
        
        return rescuedRecommendations;
      }
      
      // Si llegamos aquí, no pudimos reconocer el formato de la respuesta JSON
      console.error('Formato de respuesta de IA no reconocido');
      throw new Error('Formato de respuesta de IA no reconocido');
      
    } catch (parseError) {
      // Si falla el parseo JSON, intentamos extraer con regex
      console.error('Error al parsear respuesta de IA:', parseError);
      
      // Intentar extraer recomendaciones usando regex si falló el JSON
      const recommendations = [];
      
      // Patrones de regex para extraer canciones/artistas del texto plano
      const regexPatterns = [
        // Patrón con numeración o guiones
        /(?:\d+\.\s+|\-\s+)?["']?([^"'\-\n]+)["']?\s+(?:by|por|de|[-–])\s+([^,\n.;:"']+)/gi,
        // Patrón artista - canción (invertido)
        /([^,\n.;:]+)\s+[-–]\s+["']?([^"'\n]+)["']?/gi,
        // Buscar cualquier mención de canción y artista
        /"([^"]+)"\s+(?:by|de|por)\s+([^,\.\n]+)/gi
      ];
      
      const responseText = response.toString();
      
      // Intentar cada patrón de regex
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
        console.log(`Formato detectado: Texto plano con ${recommendations.length} recomendaciones extraídas por regex`);
        return recommendations;
      }
      
      // Si no pudimos extraer nada con regex tampoco
      throw new Error('No se pudieron extraer recomendaciones del texto de la IA');
    }
  } catch (error) {
    // Captura cualquier error en el proceso completo
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
  let networkErrors = 0;
  const maxNetworkRetries = 2;
  const networkRetryDelay = 1000; // 1 segundo entre reintentos
  
  // Buscar cada canción recomendada en Spotify
  for (const rec of recommendations) {
    try {
      const songName = rec.song || rec.name || rec.title;
      const artistName = rec.artist || rec.by;
      
      if (!songName || !artistName) {
        console.warn('❌ Recomendación sin nombre de canción o artista');
        continue;
      }
      
      // Estrategia 1: Búsqueda exacta con sintaxis track: artist:
      const searchQuery = `track:${songName} artist:${artistName}`;
      console.log(`🔍 Buscando en Spotify: ${searchQuery}`);
      
      try {
        const searchResults = await spotifyApi.search(searchQuery, ['track'], { limit: 1 });
        
        if (searchResults?.body?.tracks?.items?.length > 0) {
          tracks.push(searchResults.body.tracks.items[0]);
          console.log(`✅ Encontrado: "${songName}" por ${artistName}`);
          continue; // Continuamos con la siguiente recomendación
        }
      } catch (searchError) {
        // Comprobar si es un error de red
        if (searchError.code === 'ETIMEDOUT' || searchError.code === 'ENETUNREACH' || 
            searchError.message?.includes('timeout') || searchError.message?.includes('network')) {
          
          networkErrors++;
          if (networkErrors <= maxNetworkRetries) {
            console.log(`⏳ Error de red, reintentando (${networkErrors}/${maxNetworkRetries})...`);
            await new Promise(resolve => setTimeout(resolve, networkRetryDelay));
            // Reducimos el índice para intentar de nuevo con la misma recomendación
            continue;
          } else {
            console.error('❌ Máximo de reintentos de red alcanzado, omitiendo búsqueda');
            // Continuamos con la siguiente recomendación
            continue;
          }
        }
      }
      
      // Estrategia 2: Búsqueda genérica sin sintaxis especial
      try {
        const fallbackQuery = `${songName} ${artistName}`;
        console.log(`🔍 Intentando búsqueda alternativa: ${fallbackQuery}`);
        
        const fallbackResults = await spotifyApi.search(fallbackQuery, ['track'], { limit: 1 });
        
        if (fallbackResults?.body?.tracks?.items?.length > 0) {
          tracks.push(fallbackResults.body.tracks.items[0]);
          console.log(`✅ Encontrado (búsqueda genérica): "${fallbackResults.body.tracks.items[0].name}"`);
          continue;
        }
      } catch (fallbackError) {
        // Ignoramos errores en la búsqueda de respaldo para intentar la última estrategia
      }
      
      // Estrategia 3: Búsqueda solo por nombre de canción
      try {
        const lastResortQuery = songName;
        console.log(`🔍 Último intento - solo nombre de canción: ${lastResortQuery}`);
        
        const lastResortResults = await spotifyApi.search(lastResortQuery, ['track'], { limit: 3 });
        
        if (lastResortResults?.body?.tracks?.items?.length > 0) {
          // Intentamos encontrar una coincidencia parcial de artista
          const potentialMatches = lastResortResults.body.tracks.items.filter(track => {
            const trackArtists = track.artists.map(a => a.name.toLowerCase());
            return trackArtists.some(a => a.includes(artistName.toLowerCase()) || 
                                    artistName.toLowerCase().includes(a));
          });
          
          if (potentialMatches.length > 0) {
            tracks.push(potentialMatches[0]);
            console.log(`✅ Encontrado (coincidencia parcial): "${potentialMatches[0].name}"`);
          } else {
            // Si no hay coincidencias de artista, usamos el primer resultado
            tracks.push(lastResortResults.body.tracks.items[0]);
            console.log(`✅ Encontrado (mejor esfuerzo): "${lastResortResults.body.tracks.items[0].name}"`);
          }
          continue;
        }
      } catch (lastResortError) {
        // Ignoramos errores en el último intento
      }
      
      console.warn(`❌ No se pudo encontrar: "${songName}" por ${artistName} después de múltiples intentos`);
      
    } catch (error) {
      // Error general en el proceso de búsqueda para esta recomendación
      console.warn(`❌ Error procesando recomendación:`, error.message);
    }
  }
  
  // Si no encontramos suficientes tracks, devolvemos lo que tenemos
  console.log(`📢 Recomendaciones encontradas en Spotify: ${tracks.length}/${recommendations.length}`);
  return tracks;
}

module.exports = {
  getAIRecommendations,
  findTracksInSpotify
};
