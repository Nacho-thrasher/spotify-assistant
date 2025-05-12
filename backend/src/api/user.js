const express = require('express');
const router = express.Router();
// Reemplazar la instancia única por el helper para instancias por usuario
const getSpotifyForRequest = require('../services/spotify/getSpotifyInstance');
const userHistory = require('../services/history/userHistory'); // Importar userHistory
const { EVENT_TYPES } = userHistory; // Importar EVENT_TYPES

// Constante para el ID de usuario por defecto durante desarrollo
const DEFAULT_USER_ID = 'nacho';

// Función para obtener userId de la petición o usar el valor por defecto
const getUserIdSafe = (req) => {
  // Preferimos el ID que proporciona el middleware de identificación de usuario
  return req.userId || req.user?.id || req.session?.userId || req.headers['user-id'] || DEFAULT_USER_ID;
};

/**
 * @route   GET /api/user/profile
 * @desc    Obtener el perfil del usuario autenticado
 * @access  Private
 */
router.get('/profile', async (req, res) => {
  try {
    // Obtener instancia de SpotifyAPI para este usuario específico
    const spotifyApi = await getSpotifyForRequest(req);
    const data = await spotifyApi.getMe();
    res.json(data.body);
  } catch (error) {
    console.error('Error al obtener perfil de usuario:', error);
    
    // Diferenciar entre errores de autenticación y otros errores
    if (error.message && error.message.includes('no autenticado con Spotify')) {
      // Error de usuario no autenticado
      return res.status(401).json({
        error: 'Usuario no autenticado',
        message: 'Debe iniciar sesión con Spotify para acceder a esta funcionalidad',
        requiresAuth: true
      });
    }
    
    res.status(500).json({ error: 'Error al obtener perfil de usuario', message: error.message });
  }
});

/**
 * @route   GET /api/user/playlists
 * @desc    Obtener las playlists del usuario
 * @access  Private
 */
router.get('/playlists', async (req, res) => {
  try {
    const spotifyApi = await getSpotifyForRequest(req);
    const data = await spotifyApi.getUserPlaylists();
    res.json(data.body);
  } catch (error) {
    console.error('Error al obtener playlists:', error);
    res.status(500).json({ error: 'Error al obtener playlists', message: error.message });
  }
});

/**
 * @route   GET /api/user/now-playing
 * @desc    Obtener la canción que está reproduciendo actualmente
 * @access  Private
 */
router.get('/now-playing', async (req, res) => {
  const userId = getUserIdSafe(req);
  
  try {
    console.log(`Obteniendo canción actual para usuario: ${userId}`);
    
    // Obtener instancia de SpotifyAPI con verificación automática de token
    // requireAuth=false (intentar usar tokens si existen, pero no exigir autenticación)
    // verifyToken=true (verificar y renovar el token automáticamente)
    const spotifyApi = await getSpotifyForRequest(req, false, true);
    
    if (!spotifyApi) {
      return res.status(401).json({
        error: 'Usuario no autenticado',
        message: 'No hay tokens disponibles para este usuario o han expirado',
        requiresAuth: true
      });
    }
    
    // Hacer la llamada a la API con el token ya verificado
    console.log(`Obteniendo track actual para usuario ${userId}...`);
    const data = await spotifyApi.getMyCurrentPlayingTrack();
    
    // Devolver la respuesta
    return res.json(data.body);
  } catch (error) {
    console.error('Error al obtener canción actual:', error);
    
    // Diferenciar entre errores de autenticación y otros errores
    if (error.message && (error.message.includes('no autenticado con Spotify') || 
                         error.message.includes('Sesión de Spotify expirada'))) {
      return res.status(401).json({
        error: 'Usuario no autenticado',
        message: 'Debe iniciar sesión con Spotify para acceder a esta funcionalidad',
        requiresAuth: true
      });
    }
    
    if (error.statusCode === 401 || 
       (error.body && error.body.error && error.body.error.status === 401)) {
      return res.status(401).json({
        error: 'Token expirado',
        message: 'Su sesión ha expirado. Por favor inicie sesión nuevamente',
        requiresAuth: true
      });
    }
    
    return res.status(500).json({ 
      error: 'Error al obtener canción actual', 
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/user/play
 * @desc    Reproducir una canción, álbum o playlist
 * @access  Private
 */
router.post('/play', async (req, res) => {
  const { uri, type, position, query } = req.body;
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'
  
  try {
    // Obtener instancia de SpotifyAPI para este usuario específico
    const spotifyApi = await getSpotifyForRequest(req);
    
    // Verificar dispositivos disponibles
    const devices = await spotifyApi.getMyDevices();
    const hasActiveDevice = devices.body.devices.some(device => device.is_active);
    
    // Si hay consulta de búsqueda pero no URI, hacer búsqueda automática
    if (query && !uri) {
      console.log(`🔍 Buscando: ${query}`);
      const searchResult = await spotifyApi.searchTracks(query, { limit: 1 });
      
      if (searchResult.body.tracks.items.length > 0) {
        const track = searchResult.body.tracks.items[0];
        console.log(`🎵 Encontrado: ${track.name} - ${track.artists[0].name}`);
        req.body.uri = track.uri;
        req.body.type = 'track';
      } else {
        return res.status(404).json({ error: 'No se encontraron resultados para la búsqueda' });
      }
    }
    
    let playOptions = {};
    
    if (req.body.type === 'track') {
      playOptions.uris = [req.body.uri];
    } else {
      // Para álbumes o playlists
      playOptions.context_uri = req.body.uri;
      if (position !== undefined) {
        playOptions.offset = { position };
      }
    }
    
    // Si no hay dispositivo activo, intentar transferir la reproducción
    if (!hasActiveDevice && devices.body.devices.length > 0) {
      const deviceId = devices.body.devices[0].id;
      console.log(`💬 Activando dispositivo: ${devices.body.devices[0].name}`);
      await spotifyApi.transferMyPlayback([deviceId], { play: true });
    }
    
    await spotifyApi.play(playOptions);
    
    // Registrar reproducción en el historial si es una pista específica
    // Siempre intentamos registrar en el historial, usando userId que nunca será falsy
if (req.body.type === 'track' && req.body.uri) {
      try {
        // Para obtener trackName, artistName, etc., necesitaríamos hacer otra llamada a Spotify
        // o que el frontend envíe esta información. Por ahora, registramos lo que tenemos.
        // Idealmente, si 'uri' es un track URI, podríamos extraer el ID.
        const trackId = req.body.uri.startsWith('spotify:track:') ? req.body.uri.split(':')[2] : null;
        if (trackId) {
          // Se necesitaría una forma de obtener el nombre de la pista y artista.
          // Esto podría hacerse con spotifyApi.getTrack(trackId)
          // Por simplicidad, vamos a omitir trackName y artistName por ahora si no están disponibles fácilmente.
          await userHistory.addToHistory(userId, EVENT_TYPES.PLAYBACK, {
            action: 'play',
            trackId: trackId,
            uri: req.body.uri,
            // trackName: 'Unknown Track', // Requeriría llamada adicional
            // artistName: 'Unknown Artist' // Requeriría llamada adicional
          });
        }
      } catch (historyError) {
        console.error('Error al registrar reproducción en historial:', historyError);
      }
    }

    res.json({ success: true, uri: req.body.uri });
  } catch (error) {
    console.error('Error al reproducir:', error);
    
    // Manejar específicamente error de dispositivo
    if (error.statusCode === 404 || 
        (error.body && error.body.error && 
         error.body.error.reason === 'NO_ACTIVE_DEVICE')) {
      return res.status(404).json({
        error: 'No hay dispositivo activo',
        message: 'Por favor, abre Spotify en tu computadora o teléfono primero.'
      });
    }
    
    res.status(error.statusCode || 500).json({
      error: 'Error al reproducir',
      message: 'No se pudo iniciar la reproducción. Intenta abrir Spotify manualmente.',
      details: error.message
    });
  }
});

/**
 * @route   PUT /api/user/pause
 * @desc    Pausar la reproducción
 * @access  Private
 */
router.put('/pause', async (req, res) => {
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'
  try {
    // Obtener instancia de SpotifyAPI para este usuario específico
    const spotifyApi = await getSpotifyForRequest(req);
    
    // Verificar primero el estado actual de la reproducción
    const currentPlayback = await spotifyApi.getMyCurrentPlaybackState();
    
    // Si no hay dispositivo activo o ya está pausado, dar ok
    if (!currentPlayback.body || !currentPlayback.body.is_playing) {
      return res.json({ success: true, message: 'Ya está pausado o no hay reproducción activa' });
    }
    
    // Intentar pausar
    await spotifyApi.pause();

    // Registrar en el historial
    if (userId) {
      try {
        const currentTrackData = await spotifyApi.getMyCurrentPlayingTrack();
        if (currentTrackData.body && currentTrackData.body.item) {
          const item = currentTrackData.body.item;
          await userHistory.addToHistory(userId, EVENT_TYPES.PLAYBACK, {
            action: 'pause',
            trackId: item.id,
            trackName: item.name,
            artistId: item.artists[0].id,
            artistName: item.artists[0].name,
            uri: item.uri
          });
        }
      } catch (historyError) {
        console.error('Error al registrar pausa en historial:', historyError);
      }
    }

    res.json({ success: true, message: 'Reproducción pausada' });
  } catch (error) {
    console.error('Error al pausar:', error);
    
    // Manejar específicamente el error 403 por restricción
    if (error.statusCode === 403) {
      // Si es error de restricción, intentar una alternativa
      try {
        // Alternativa: usar un endpoint diferente o modificar volumen
        await spotifyApi.setVolume(0); // Silenciar como alternativa
        return res.json({ 
          success: true, 
          message: 'Modo alternativo: volumen reducido a 0'
        });
      } catch (secondError) {
        console.error('Error en alternativa de pausa:', secondError);
      }
    }
    
    // Devolver error con respuesta amigable
    res.status(error.statusCode || 500).json({ 
      error: 'Error al pausar', 
      message: 'No se pudo pausar. Por favor, intenta usando la app de Spotify directamente.',
      details: error.message 
    });
  }
});

/**
 * @route   POST /api/user/next
 * @desc    Siguiente canción
 * @access  Private
 */
router.post('/next', async (req, res) => {
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'
  try {
    // Obtener instancia de SpotifyAPI para este usuario específico
    const spotifyApi = await getSpotifyForRequest(req);
    
    // Verificar que haya reproducción activa
    const currentPlayback = await spotifyApi.getMyCurrentPlaybackState();
    
    if (!currentPlayback.body || !currentPlayback.body.device) {
      return res.status(400).json({ 
        error: 'No hay reproducción activa',
        message: 'No hay una sesión de reproducción activa para cambiar de canción.'
      });
    }
    
    // Guardar primer elemento de la cola antes de avanzar
    const queueFirstItem = global.spotifyQueueCache && global.spotifyQueueCache.length > 0 ? 
                          global.spotifyQueueCache[0] : null;
    
    if (queueFirstItem) {
      console.log('⏭️ Avanzando a siguiente canción en cola:', queueFirstItem.name);
    }
    
    await spotifyApi.skipToNext();
    
    // Delay para que Spotify actualice el estado (aumentado para evitar el "flash" visual)
    console.log('⏱️ Esperando que Spotify sincronice la pista actual...');
    await new Promise(resolve => setTimeout(resolve, 700));
    
    // Obtener información del nuevo track
    const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();
    
    // Actualizar la caché global - quitar la primera canción si existe
    if (global.spotifyQueueCache && global.spotifyQueueCache.length > 0) {
      console.log('🔄 Actualizando caché global después de next');
      
      // Eliminar el primer elemento de la cola
      global.spotifyQueueCache.shift();
    }
    
    // Registrar en el historial
    if (currentTrack.body && currentTrack.body.item) {
      try {
        const item = currentTrack.body.item;
        await userHistory.addToHistory('nacho', EVENT_TYPES.PLAYBACK, {
          action: 'next',
          trackId: item.id,
          trackName: item.name,
          artistId: item.artists[0].id,
          artistName: item.artists[0].name,
          uri: item.uri
        });
      } catch (historyError) {
        console.error('Error al registrar \'next\' en historial:', historyError);
      }
    }

    res.json({ 
      success: true,
      currentTrack: currentTrack.body?.item ? {
        name: currentTrack.body.item.name,
        artist: currentTrack.body.item.artists[0].name,
        album: currentTrack.body.item.album.name,
        image: currentTrack.body.item.album.images[0]?.url,
        uri: currentTrack.body.item.uri,
        isPlaying: currentTrack.body.is_playing
      } : null
    });
  } catch (error) {
    console.error('Error al saltar a siguiente:', error);
    
    if (error.statusCode === 403) {
      return res.status(403).json({ 
        error: 'Restricción de Spotify',
        message: 'Spotify no permite esta acción en este momento. Prueba directamente desde la app de Spotify.'
      });
    }
    
    res.status(error.statusCode || 500).json({ 
      error: 'Error al saltar a siguiente', 
      message: 'No se pudo cambiar a la siguiente canción.', 
      details: error.message 
    });
  }
});

/**
 * @route   DELETE /api/user/queue
 * @desc    Limpiar la cola de reproducción
 * @access  Private
 */
router.delete('/queue', async (req, res) => {
  try {
    // Verificar que haya reproducción activa
    const currentPlayback = await spotifyApi.getMyCurrentPlaybackState();
    
    if (!currentPlayback.body || !currentPlayback.body.device) {
      return res.status(400).json({ 
        error: 'No hay reproducción activa',
        message: 'Necesitas tener un dispositivo de Spotify activo para limpiar la cola'
      });
    }
    
    // Limpiar la caché global
    console.log('🗑️ COLA: Limpiando cola de reproducción');
    global.spotifyQueueCache = [];
    
    // NOTA: La API de Spotify no proporciona un endpoint para limpiar la cola.
    // Sin embargo, podemos mantener nuestra propia caché vacía para no mostrar elementos.
    
    res.json({ 
      success: true,
      message: 'Cola limpiada exitosamente'
    });
  } catch (error) {
    console.error('Error al limpiar la cola:', error);
    res.status(error.statusCode || 500).json({ 
      error: 'Error al limpiar la cola', 
      message: 'No se pudo limpiar la cola.', 
      details: error.message 
    });
  }
});

/**
 * @route   POST /api/user/previous
 * @desc    Canción anterior
 * @access  Private
 */
router.post('/previous', async (req, res) => {
  const userId = getUserIdSafe(req);
  
  try {
    // Obtener instancia de SpotifyAPI para este usuario específico
    const spotifyApi = await getSpotifyForRequest(req);
    
    // Verificar que haya reproducción activa
    const currentPlayback = await spotifyApi.getMyCurrentPlaybackState();
    
    if (!currentPlayback.body || !currentPlayback.body.device) {
      return res.status(400).json({ 
        error: 'No hay reproducción activa',
        message: 'No hay una sesión de reproducción activa para cambiar de canción.'
      });
    }
    
    await spotifyApi.skipToPrevious();

    // Obtener información del nuevo track
    // Esperar un breve momento para que Spotify actualice el estado
    await new Promise(resolve => setTimeout(resolve, 500));
    const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();

    // Registrar en el historial
    if (currentTrack.body && currentTrack.body.item) {
      try {
        const item = currentTrack.body.item;
        await userHistory.addToHistory('nacho', EVENT_TYPES.PLAYBACK, {
          action: 'previous',
          trackId: item.id,
          trackName: item.name,
          artistId: item.artists[0].id,
          artistName: item.artists[0].name,
          uri: item.uri
        });
      } catch (historyError) {
        console.error('Error al registrar \'previous\' en historial:', historyError);
      }
    }

    res.json({ 
      success: true,
      currentTrack: currentTrack.body?.item ? {
        name: currentTrack.body.item.name,
        artist: currentTrack.body.item.artists[0].name,
        album: currentTrack.body.item.album.name,
        image: currentTrack.body.item.album.images[0]?.url,
        uri: currentTrack.body.item.uri,
        isPlaying: currentTrack.body.is_playing
      } : null
    });
  } catch (error) {
    console.error('Error al saltar a anterior:', error);
    
    // Si es error de restricción (403)
    if (error.statusCode === 403) {
      return res.status(403).json({
        error: 'Restricción de Spotify',
        message: 'Spotify no permite esta acción en este momento. Prueba directamente desde la app de Spotify.'
      });
    }
    
    res.status(error.statusCode || 500).json({ 
      error: 'Error al saltar a anterior', 
      message: 'No se pudo cambiar a la canción anterior.', 
      details: error.message 
    });
  }
});

/**
 * @route   GET /api/user/search
 * @desc    Buscar canciones, artistas, albums o playlists
 * @access  Private
 */
router.get('/search', async (req, res) => {
  const { query, type } = req.query;
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'
  
  if (!query) {
    return res.status(400).json({ error: 'Se requiere un término de búsqueda' });
  }
  
  const types = type ? type.split(',') : ['track', 'artist', 'album', 'playlist'];
  
  try {
    const searchResults = await spotifyApi.search(query, types, { limit });

    // Registrar búsqueda en el historial
    if (userId) {
      try {
        await userHistory.addToHistory(userId, EVENT_TYPES.SEARCH, {
          query: query,
          types: types,
          resultCount: (searchResults.body.tracks?.items.length || 0) +
                       (searchResults.body.artists?.items.length || 0) +
                       (searchResults.body.albums?.items.length || 0) +
                       (searchResults.body.playlists?.items.length || 0)
        });
      } catch (historyError) {
        console.error('Error al registrar búsqueda en historial:', historyError);
      }
    }

    res.json(searchResults.body);
  } catch (error) {
    console.error('Error en búsqueda:', error);
    res.status(500).json({ error: 'Error en búsqueda', message: error.message });
  }
});

/**
 * @route   POST /api/user/queue
 * @desc    Añadir una canción a la cola de reproducción
 * @access  Private
 */
router.post('/queue', async (req, res) => {
  const { uri, type } = req.body;
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'
  
  if (!uri) {
    return res.status(400).json({ error: 'Se requiere el URI de la canción' });
  }
  
  try {
    // Verificar dispositivos disponibles
    const devices = await spotifyApi.getMyDevices();
    const hasActiveDevice = devices.body.devices.some(device => device.is_active);
    
    if (!hasActiveDevice) {
      return res.status(400).json({
        error: 'No hay dispositivo activo',
        message: 'Necesitas tener un dispositivo de Spotify activo para añadir a la cola'
      });
    }
    
    await spotifyApi.addToQueue(uri);

    // Registrar en el historial
    if (userId) {
      try {
        // Para obtener trackName, artistName, etc., necesitaríamos más info o una llamada adicional
        const trackId = uri.startsWith('spotify:track:') ? uri.split(':')[2] : null;
        if (trackId) {
          // De nuevo, obtener nombres requeriría más lógica o llamadas.
          // O el frontend podría enviar estos datos.
          await userHistory.addToHistory(userId, EVENT_TYPES.PLAYBACK, {
            action: 'queue_add',
            trackId: trackId,
            uri: uri,
            // trackName: 'Unknown Track', 
            // artistName: 'Unknown Artist'
          });
        }
      } catch (historyError) {
        console.error('Error al registrar \'queue_add\' en historial:', historyError);
      }
    }

    // Después de añadir a la cola, obtener la cola actualizada
    const queue = await spotifyApi.getMyCurrentPlaybackState();
    res.json({ success: true, message: 'Canción añadida a la cola correctamente' });
  } catch (error) {
    console.error('Error al añadir a la cola:', error);
    res.status(error.statusCode || 500).json({
      error: 'Error al añadir a la cola', 
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user/search-and-queue
 * @desc    Buscar una canción y añadirla a la cola
 * @access  Private
 */
router.post('/search-and-queue', async (req, res) => {
  const { query, limit = 1 } = req.body;
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'
  
  if (!query) {
    return res.status(400).json({ error: 'Se requiere un término de búsqueda' });
  }
  
  try {
    // Buscar la canción
    console.log(`🔍 Buscando canción para cola: ${query}`);
    const searchResult = await spotifyApi.searchTracks(query, { limit });
    
    if (searchResult.body.tracks.items.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'No se encontró la canción', 
        message: `No se encontraron resultados para "${query}"` 
      });
    }
    
    // Verificar dispositivos disponibles
    const devices = await spotifyApi.getMyDevices();
    const hasActiveDevice = devices.body.devices.some(device => device.is_active);
    
    if (!hasActiveDevice) {
      return res.status(400).json({
        error: 'No hay dispositivo activo',
        message: 'Necesitas tener un dispositivo de Spotify activo para añadir a la cola'
      });
    }
    
    // Añadir a la cola
    const track = searchResult.body.tracks.items[0];
    await spotifyApi.addToQueue(track.uri);
    
    console.log(`🎵 Añadido a la cola: ${track.name} - ${track.artists[0].name}`);
    
    // Preparar objeto de canción para la caché y respuesta
    const trackInfo = {
      name: track.name,
      artist: track.artists[0].name,
      album: track.album.name,
      image: track.album.images[0]?.url,
      uri: track.uri
    };
    
    // Inicializar la caché global si no existe
    if (!global.spotifyQueueCache) {
      global.spotifyQueueCache = [];
    }
    
    // Obtener información de la pista actual en reproducción para evitar duplicados
    let currentTrack = null;
    try {
      const currentPlayingResponse = await spotifyApi.getMyCurrentPlayingTrack();
      if (currentPlayingResponse.body?.item) {
        currentTrack = {
          uri: currentPlayingResponse.body.item.uri
        };
      }
    } catch (err) {
      console.error('Error al obtener pista actual:', err);
    }
    
    // Solo agregar a la cache si no es la misma que la canción actual
    if (!currentTrack || currentTrack.uri !== trackInfo.uri) {
      console.log(`💾 Añadiendo a caché de cola: ${trackInfo.name}`);
      
      // Verificar si ya existe en la cola para evitar duplicados
      const exists = global.spotifyQueueCache.some(item => item.uri === trackInfo.uri);
      if (!exists) {
        global.spotifyQueueCache.push(trackInfo);
        console.log('✅ Canción añadida a caché de cola correctamente');
      } else {
        console.log('❗️ Canción ya existe en la caché de cola, no duplicada');
      }
    } else {
      console.log('❗️ No se agrega a caché: es la canción actual en reproducción');
    }
    
    // Obtener la cola actualizada para respuesta
    const queueInfo = {
      currentlyPlaying: currentTrack ? {
        // Incluiríamos más detalles si los necesitamos
        uri: currentTrack.uri
      } : null,
      addedToQueue: trackInfo
    };
    
    // Mostrar el estado actual de la cola en caché
    console.log('📊 COLA: Estado actual de cache:');
    global.spotifyQueueCache.forEach((item, i) => {
      console.log(`   • [${i+1}] ${item.name} - ${item.artist}`);
    });
    
    // Devolver información de la canción añadida
    res.json({
      success: true,
      track: trackInfo,
      queueInfo,
      queue: global.spotifyQueueCache // Devolvemos la cola completa
    });
  } catch (error) {
    console.error('Error en search-and-queue:', error);
    res.status(error.statusCode || 500).json({
      error: 'Error al buscar y añadir a la cola', 
      message: error.message
    });
  }
});

/**
 * @route   GET /api/user/queue
 * @desc    Obtener la cola de reproducción actual
 * @access  Private
 */
router.get('/queue', async (req, res) => {
  const userId = getUserIdSafe(req); // Obtener userId
  let nextInQueue = [];
  let currentlyPlaying = null;
  
  console.log('🔎 COLA: Obteniendo información de la cola...');
  
  try {
    // 1. Obtener instancia de SpotifyAPI para este usuario específico
    const spotifyApi = await getSpotifyForRequest(req);
    
    // 2. Primero obtenemos la información de la canción actual
    console.log('🎵 COLA: Obteniendo pista actual...');
    const currentPlayingTrack = await spotifyApi.getMyCurrentPlayingTrack();
    
    // Extraer información actual
    currentlyPlaying = currentPlayingTrack.body?.item ? {
      name: currentPlayingTrack.body.item.name,
      artist: currentPlayingTrack.body.item.artists[0].name,
      album: currentPlayingTrack.body.item.album.name,
      image: currentPlayingTrack.body.item.album.images[0]?.url,
      uri: currentPlayingTrack.body.item.uri,
      isPlaying: currentPlayingTrack.body.is_playing
    } : null;
    
    console.log('💾 COLA: Datos de reproducción recibidos:', currentlyPlaying);
    
    // 3. Verificar el estado actual de la caché de cola
    console.log('🗨️ COLA: Estado de la cola en cache:');
    if (!global.spotifyQueueCache || global.spotifyQueueCache.length === 0) {
      console.log('   • Cola vacía');
    } else {
      console.log(`   • ${global.spotifyQueueCache.length} elementos en caché`);
    }
    
    // 4. Obtener la cola actual de Spotify
    console.log('🔍 COLA: Intentando obtener directamente con petición HTTP...');
    
    // Importar el helper de SpotifyHelpers para manejo de cola
    const spotifyHelpers = require('../services/spotify/spotifyHelpers');
    
    try {
      // Verificar sesión antes de obtener la cola
      const sessionValid = await spotifyHelpers.verifySpotifySession(spotifyApi, userId);
      if (!sessionValid) {
        console.error(`🔴 Sesión inválida para ${userId} al obtener cola - token no válido o expirado`);
        return res.status(401).json({
          error: 'Sesión expirada',
          message: 'Tu sesión con Spotify ha expirado. Por favor, inicia sesión nuevamente.',
          requiresAuth: true
        });
      }
      
      console.log(`🔵 Obteniendo cola para usuario ${userId}...`); 
      
      // Obtener cola con soporte de refresco de token automático
      let queueData;
      try {
        queueData = await spotifyHelpers.getQueue(spotifyApi);
      } catch (queueError) {
        console.error(`🔴 Error al obtener cola:`, queueError.message || queueError);
        
        // Si el error es de dispositivo no activo, enviar mensaje más amigable
        if (queueError.message && queueError.message.includes('404')) {
          return res.status(404).json({
            error: 'No hay dispositivo activo',
            message: 'Para ver la cola de reproducción, necesitas tener Spotify abierto en algún dispositivo',
          });
        }
        
        throw queueError; // Re-lanzar para que lo maneje el catch principal
      }
      
      if (queueData && queueData.queue) {
        console.log(`👉 COLA REAL SPOTIFY: ${queueData.queue.length} elementos encontrados`);
        
        // CORREGIDO: La respuesta de la API de Spotify incluye:
        // - currently_playing: la canción actual que se está reproduciendo
        // - queue: la cola de canciones DESPUÉS de la que se está reproduciendo
        
        // Comprobar si tenemos información de canción actual en la respuesta de la API
        if (queueData.currently_playing) {
          console.log(`💿 API Spotify dice que se está reproduciendo: ${queueData.currently_playing.name} - ${queueData.currently_playing.artists[0].name}`);
          
          // Actualizar currentlyPlaying si la respuesta de la API incluye esta información
          currentlyPlaying = {
            name: queueData.currently_playing.name,
            artist: queueData.currently_playing.artists[0].name,
            album: queueData.currently_playing.album.name,
            image: queueData.currently_playing.album.images[0]?.url,
            duration_ms: queueData.currently_playing.duration_ms,
            uri: queueData.currently_playing.uri,
            isPlaying: true // Si lo devuelve la API, asumimos que está reproduciendo
          };
        }
        
        // Mapear SOLO la cola futura (sin incluir la canción actual) - Este es el comportamiento correcto
        nextInQueue = queueData.queue.map(track => ({
          name: track.name,
          artist: track.artists[0].name,
          album: track.album.name,
          image: track.album.images[0]?.url,
          duration_ms: track.duration_ms,
          uri: track.uri
        }));
        
        // IMPORTANTE: NO APLICAMOS FILTROS NI MODIFICACIONES AL ORDEN
        // Respetamos estrictamente el orden enviado por la API de Spotify
        // para que coincida exactamente con la app oficial
        
        console.log('Respetando estrictamente el orden de canciones de Spotify:');
        nextInQueue.forEach((track, index) => {
          console.log(`  ${index + 1}. ${track.name} - ${track.artist}`);
        });
        
        console.log(`📈 Cola actual de Spotify: ${nextInQueue.length} elementos`);
        
        // NO filtramos más canciones para mantener coherencia con Spotify
        // La app oficial puede mostrar la canción actual en la cola también, así que
        // la mantenemos para mostrar exactamente lo mismo que la app oficial
        if (currentlyPlaying && currentlyPlaying.uri) {
          console.log(`🔄 COLA: Canción actual (${currentlyPlaying.name}) - respetando contenido original de cola`);
        }
        
        // Actualizar nuestra caché global
        global.spotifyQueueCache = nextInQueue;
        
        console.log('✅ COLA: Cola actualizada con datos directos de Spotify');
      } else {
        console.log('⚠️ COLA: Spotify no devolvió información de cola, usando cache');
        // Mantener la cola existente en cache
        nextInQueue = global.spotifyQueueCache || [];
      }
    } catch (spotifyQueueError) {
      console.error('❌ Error al obtener cola de Spotify:', spotifyQueueError.message);
      console.log('💾 COLA: Usando información de caché como respaldo');
      
      // En caso de error, usamos nuestra caché global
      nextInQueue = global.spotifyQueueCache || [];
    }
    
    // Construir respuesta
    const response = {
      currentlyPlaying,
      nextInQueue,
      // Incluir metadatos sobre el estado de la cola
      _meta: {
        userId,
        timestamp: new Date().toISOString(),
        queueSize: nextInQueue.length,
        fromCache: nextInQueue === global.spotifyQueueCache
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error general al obtener cola:', error.message || error);
    
    // En caso de error general, devolver lo que tengamos en cache
    res.json({
      currentlyPlaying: null,
      nextInQueue: global.spotifyQueueCache || [],
      _meta: {
        error: true,
        errorMessage: error.message || 'Error desconocido',
        fromCache: true,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route   POST /api/user/volume
 * @desc    Ajustar el volumen
 * @access  Private
 */
router.post('/volume', async (req, res) => {
  const { volume_percent } = req.body;
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'

  if (volume_percent === undefined || volume_percent < 0 || volume_percent > 100) {
    return res.status(400).json({ error: 'Volumen inválido' });
  }
  
  try {
    await spotifyApi.setVolume(volume_percent);

    // Registrar en el historial
    if (userId) {
      try {
        await userHistory.addToHistory(userId, EVENT_TYPES.PLAYBACK, {
          action: 'set_volume',
          volume_percent: volume_percent
        });
      } catch (historyError) {
        console.error('Error al registrar \'set_volume\' en historial:', historyError);
      }
    }

    res.json({ success: true, message: `Volumen ajustado al ${volume_percent}%` });
  } catch (error) {
    console.error('Error al ajustar volumen:', error);
    res.status(error.statusCode || 500).json({
      error: 'Error al ajustar volumen', 
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user/shuffle
 * @desc    Activar o desactivar el modo aleatorio
 * @access  Private
 */
router.post('/shuffle', async (req, res) => {
  const { state } = req.body; // true para activar, false para desactivar
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'

  if (typeof state !== 'boolean') {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  
  try {
    await spotifyApi.setShuffle(state);

    // Registrar en el historial
    if (userId) {
      try {
        await userHistory.addToHistory(userId, EVENT_TYPES.PLAYBACK, {
          action: 'set_shuffle',
          state: state
        });
      } catch (historyError) {
        console.error('Error al registrar \'set_shuffle\' en historial:', historyError);
      }
    }

    res.json({ success: true, message: `Modo aleatorio ${state ? 'activado' : 'desactivado'}` });
  } catch (error) {
    console.error('Error al ajustar modo aleatorio:', error);
    res.status(error.statusCode || 500).json({
      error: 'Error al ajustar modo aleatorio', 
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user/repeat
 * @desc    Ajustar el modo de repetición
 * @access  Private
 */
router.post('/repeat', async (req, res) => {
  const { state } = req.body; // 'track', 'context' o 'off'
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'

  if (!['track', 'context', 'off'].includes(state)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  
  try {
    await spotifyApi.setRepeat(state);

    // Registrar en el historial
    if (userId) {
      try {
        await userHistory.addToHistory(userId, EVENT_TYPES.PLAYBACK, {
          action: 'set_repeat',
          state: state
        });
      } catch (historyError) {
        console.error('Error al registrar \'set_repeat\' en historial:', historyError);
      }
    }

    res.json({ success: true, message: `Modo de repetición ajustado a '${state}'` });
  } catch (error) {
    console.error('Error al ajustar modo de repetición:', error);
    res.status(error.statusCode || 500).json({
      error: 'Error al ajustar modo de repetición', 
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user/log-playback
 * @desc    Registrar reproducción automática en el historial
 * @access  Private
 */
router.post('/log-playback', async (req, res) => {
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'
  const { trackId, trackName, artistId, artistName, uri, action } = req.body;
  
  try {
    if (!trackId || !trackName) {
      return res.status(400).json({ error: 'Se requiere información de la pista' });
    }
    
    console.log(`📝 Registrando reproducción en historial: ${trackName} - ${artistName}`);
    
    // Registrar en el historial
    await userHistory.addToHistory(userId, EVENT_TYPES.PLAYBACK, {
      trackId,
      trackName,
      artistId,
      artistName,
      uri,
      action: action || 'auto_play'
    });
    
    res.json({ success: true, message: 'Reproducción registrada correctamente' });
  } catch (error) {
    console.error('Error al registrar reproducción:', error);
    res.status(500).json({
      error: 'Error al registrar reproducción',
      message: error.message
    });
  }
});

/**
 * @route   POST /api/user/play-queue-item
 * @desc    Reproducir un elemento específico de la cola por su posición
 * @access  Private
 */
router.post('/play-queue-item', async (req, res) => {
  const userId = getUserIdSafe(req); // Obtener userId con fallback a 'nacho'
  const { index } = req.body;
  
  try {
    // Obtener instancia de SpotifyAPI para este usuario específico
    const spotifyApi = await getSpotifyForRequest(req);
    if (index === undefined || index < 0) {
      return res.status(400).json({ error: 'Se requiere un índice válido' });
    }
    
    console.log(`🎯 Intentando reproducir elemento de cola en posición ${index}`);
    
    // Necesitamos un método alternativo que funcione con las restricciones de Spotify
    console.log(`Buscando información de la cola para el elemento #${index}`);
    
    // Primero obtenemos la cola actual del cliente
    const queueResponse = await fetch('http://localhost:8080/api/user/queue');
    const queueData = await queueResponse.json();
    
    if (!queueData || !queueData.nextInQueue || queueData.nextInQueue.length === 0) {
      return res.status(404).json({ error: 'No hay canciones en la cola para reproducir' });
    }
    
    if (index >= queueData.nextInQueue.length) {
      return res.status(400).json({ 
        error: 'Índice fuera de rango', 
        message: `El índice ${index} es mayor que el tamaño de la cola (${queueData.nextInQueue.length})` 
      });
    }
    
    // Obtener la URI de la canción en la posición seleccionada
    const selectedTrack = queueData.nextInQueue[index];
    if (!selectedTrack || !selectedTrack.uri) {
      return res.status(400).json({ error: 'No se pudo obtener información de la canción seleccionada' });
    }
    
    console.log(`Reproduciendo directamente canción: ${selectedTrack.name} usando URI: ${selectedTrack.uri}`);
    
    // Reproducir directamente esta canción específica usando su URI
    await spotifyApi.play({
      uris: [selectedTrack.uri]
    });
    
    // Obtener la canción actual para el registro
    const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();
    const trackInfo = currentTrack.body?.item;
    
    // Registrar en el historial
    if (userId && trackInfo) {
      try {
        await userHistory.addToHistory(userId, EVENT_TYPES.PLAYBACK, {
          trackId: trackInfo.id,
          trackName: trackInfo.name,
          artistId: trackInfo.artists[0]?.id,
          artistName: trackInfo.artists[0]?.name,
          uri: trackInfo.uri,
          action: 'play_from_queue',
          queuePosition: index
        });
      } catch (historyError) {
        console.error('Error al registrar "play_from_queue" en historial:', historyError);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Elemento #${index} de la cola reproducido correctamente`,
      currentTrack: trackInfo ? {
        name: trackInfo.name,
        artist: trackInfo.artists[0]?.name,
        album: trackInfo.album?.name,
        image: trackInfo.album?.images[0]?.url,
        uri: trackInfo.uri
      } : null
    });
    
  } catch (error) {
    console.error('Error al reproducir elemento de la cola:', error);
    res.status(error.statusCode || 500).json({
      error: 'Error al reproducir elemento de la cola', 
      message: error.message
    });
  }
});

module.exports = router;
