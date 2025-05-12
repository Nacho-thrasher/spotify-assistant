const express = require('express');
const router = express.Router();
const spotifyManager = require('../services/spotify/spotifyManager');

// Simple logger implementation que no requiere módulo externo
const logger = {
  info: (message, ...args) => console.log(`[INFO] ${message}`, ...args),
  error: (message, ...args) => console.error(`[ERROR] ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[WARN] ${message}`, ...args)
};

/**
 * Ruta para diagnosticar problemas con la API de Spotify
 */
router.get('/test-api', async (req, res) => {
  try {
    // Verificamos si tenemos un usuario autenticado
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'No hay usuario autenticado',
        nextStep: 'Iniciar sesión nuevamente'
      });
    }
    
    const spotifyApi = await spotifyManager.getInstance(req.userId);
    
    // Verificamos el token actual
    const token = spotifyApi.spotifyApi.getAccessToken();
    const tokenInfo = {
      exists: Boolean(token),
      preview: token ? `${token.substring(0, 10)}...` : null
    };

    // Verificamos los permisos (scopes)
    let userProfile = null;
    let scopes = null;
    let availableGenres = null;
    let basicRecommendation = null;
    let testErrors = {};

    try {
      // 1. Prueba básica del perfil
      const profileResponse = await spotifyApi.getMe();
      userProfile = profileResponse.body;
      logger.info(`API test: perfil correcto para ${userProfile.display_name}`);
    } catch (error) {
      testErrors.profile = error.message || 'Error desconocido';
      logger.error('API test: error al obtener perfil', error);
    }

    try {
      // 2. Intentar obtener los géneros disponibles
      const genresResponse = await spotifyApi.getAvailableGenreSeeds();
      availableGenres = genresResponse.body;
      logger.info(`API test: ${availableGenres.genres.length} géneros disponibles`);
    } catch (error) {
      testErrors.genres = error.message || 'Error desconocido';
      logger.error('API test: error al obtener géneros', error);
    }

    try {
      // 3. Intentar una recomendación básica con rock
      const recParams = { seed_genres: 'rock', limit: 1 };
      const recResponse = await spotifyApi.getRecommendations(recParams);
      basicRecommendation = {
        success: true,
        tracksCount: recResponse.body.tracks.length,
        firstTrack: recResponse.body.tracks.length > 0 ? 
          {
            name: recResponse.body.tracks[0].name,
            artist: recResponse.body.tracks[0].artists[0].name
          } : null
      };
      logger.info('API test: recomendación básica exitosa');
    } catch (error) {
      testErrors.recommendation = error.message || 'Error desconocido';
      logger.error('API test: error al obtener recomendación básica', error);
      basicRecommendation = { success: false };
    }

    res.json({
      success: true,
      token: tokenInfo,
      userProfile,
      genres: availableGenres ? {
        count: availableGenres.genres.length,
        examples: availableGenres.genres.slice(0, 5)
      } : null,
      basicRecommendation,
      errors: Object.keys(testErrors).length > 0 ? testErrors : null,
      nextSteps: Object.keys(testErrors).length > 0 ? 
        'Cerrar sesión y volver a autenticarse para obtener un nuevo token' :
        'API funciona correctamente'
    });
  } catch (error) {
    logger.error('Error en diagnóstico de API', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error desconocido en diagnóstico'
    });
  }
});

module.exports = router;
