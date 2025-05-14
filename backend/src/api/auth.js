const express = require('express');
const router = express.Router();
// Reemplazar la instancia única por el administrador de instancias
const spotifyManager = require('../services/spotify/spotifyManager');

/**
 * @route   GET /api/auth/login
 * @desc    Redirige al usuario a la página de autorización de Spotify
 * @access  Public
 */
router.get('/login', (req, res) => {
  // Obtener URL de redirección personalizada (si existe)
  const redirectUri = req.query.redirect_uri;
  console.log(`🚀 URL de redirección personalizada: ${redirectUri}`);
  // Guardar en sesión para usarla después del callback
  if (redirectUri) {
    req.session = req.session || {};
    req.session.customRedirectUri = redirectUri;
  }
  
  // Definir los permisos que necesitamos
  const scopes = [
    'user-read-private', 
    'user-read-email',
    'user-read-playback-state',
    'user-modify-playback-state',
    'playlist-read-private',
    'playlist-modify-private',
    'user-read-recently-played',
    'user-top-read',
    'user-library-read',
    'user-library-modify'
  ];
  
  // Crear URL de autorización y redirigir al usuario
  res.redirect(spotifyManager.createAuthorizeURL(scopes));
});

/**
 * @route   GET /api/auth/callback
 * @desc    Callback después de la autorización de Spotify
 * @access  Public
 */
router.get('/callback', async (req, res) => {
  const { code, redirect_to } = req.query;
  
  try {
    // Intercambiar código por tokens
    const data = await spotifyManager.authorizationCodeGrant(code);
    const { access_token, refresh_token, expires_in } = data.body;
    console.log('Token obtenido correctamente. Expira en:', expires_in, 'segundos');
    // Crear una instancia temporal de SpotifyAPI para obtener el perfil de usuario
    const tempSpotifyApi = await spotifyManager.createTempInstance(access_token);
    
    // Obtener el ID real de Spotify desde el perfil del usuario
    const userProfile = await tempSpotifyApi.getMe();
    const spotifyUserId = userProfile.body.id;
    
    console.log(`Usuario autenticado con Spotify ID: ${spotifyUserId}`);
    
    // IMPORTANTE: Guardar en la sesión el ID real de Spotify
    if (req.session) {
      req.session.spotifyUserId = spotifyUserId;
    }
    
    // Guardar también en una cookie para mayor persistencia
    res.cookie('spotifyUserId', spotifyUserId, {
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
      httpOnly: true,
      sameSite: 'lax'
    });
    
    // Guardar tokens asociados al ID real de Spotify (no al ID generado localmente)
    const tokenSaveResult = await spotifyManager.setTokensForUser(spotifyUserId, access_token, refresh_token, expires_in);
    console.log('Tokens guardados correctamente:', tokenSaveResult);
    
    // Determinar la URL de redirección en este orden de prioridad:
    // 1. El parámetro redirect_to en la URL de callback
    // 2. La URL guardada en la sesión desde el endpoint /login
    // 3. La variable de entorno FRONTEND_URL
    // 4. El valor predeterminado (http://localhost:3000)
    // URL hardcodeada para producción (la nueva URL del frontend)
    const isProduction = process.env.NODE_ENV === 'production';
    console.log(`🚀 Entorno: ${process.env.NODE_ENV}`);
    let frontendUrl = isProduction 
      ? 'https://spotify-assistant-front.vercel.app' 
      : (process.env.FRONTEND_URL || 'http://localhost:3000');
    
    // 1. Prioridad: Parámetro redirect_to en la URL
    if (redirect_to) {
      console.log(`🔸 Usando redirect_to de la URL: ${redirect_to}`);
      frontendUrl = redirect_to;
    }

    // Verificar que los tokens se guardaron correctamente
    if (tokenSaveResult !== true && tokenSaveResult.error) {
      console.error('Error al guardar tokens:', tokenSaveResult);
      return res.redirect(`${frontendUrl}?error=error_saving_tokens&message=${encodeURIComponent(tokenSaveResult.message || 'Error al guardar tokens')}`);
    }
    // En una aplicación real, aquí deberías:
    // 1. Guardar tokens en una base de datos asociados al usuario
    // 2. Crear una sesión o JWT para la autenticación del cliente
    // 3. Manejar la expiración y refresco de tokens
    
    // 2. Prioridad: Custom redirect from session
    else if (req.session && req.session.customRedirectUri) {
      console.log(`🔸 Usando redirect de sesión: ${req.session.customRedirectUri}`);
      frontendUrl = req.session.customRedirectUri;
      // Limpiar la sesión después de usarla
      delete req.session.customRedirectUri;
    }
    
    console.log(`🔀 Redirigiendo a: ${frontendUrl}`);
    res.redirect(`${frontendUrl}/?access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`);
  } catch (error) {
    console.error('Error durante la autenticación:', error);
    
    // Procesar el error para asegurar que sea serializable
    let errorMessage = 'Error desconocido durante la autenticación';
    
    if (error.body && error.body.error_description) {
      errorMessage = error.body.error_description;
    } else if (error.body && error.body.error) {
      errorMessage = typeof error.body.error === 'string' ? error.body.error : JSON.stringify(error.body.error);
    } else if (error.message) {
      errorMessage = error.message;
    } else if (typeof error === 'object') {
      try {
        errorMessage = JSON.stringify(error);
      } catch (e) {
        errorMessage = 'Error no serializable';
      }
    }
    
    console.error('Mensaje de error detallado:', errorMessage);
    
    // Redirigir al frontend con mensaje de error
    return res.redirect(`${frontendUrl}?error=auth_error&message=${encodeURIComponent(errorMessage)}`);
  }
});

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refrescar el token de acceso usando el refresh token
 * @access  Public
 */
router.post('/refresh-token', async (req, res) => {
  const { refresh_token } = req.body;
  
  // En una app real, obtendrías el refresh token de la sesión del usuario
  // en lugar de recibirlo en la solicitud
  
  try {
    // Obtener userId de la solicitud
    const userId = req.userId;
    
    // Primero actualizamos el refresh token para este usuario
    const spotifyApi = await spotifyManager.getInstance(userId);
    spotifyApi.setRefreshToken(refresh_token);
    
    // Luego renovamos el token
    const result = await spotifyManager.refreshAccessTokenForUser(userId);
    
    // Verificar si hay un error específico de invalid_grant
    if (result && result.error === 'invalid_grant') {
      return res.status(401).json({
        error: 'invalid_grant',
        message: result.message,
        requiresReauth: true
      });
    }
    
    // Si el resultado es false, hubo un error genérico
    if (result === false) {
      return res.status(400).json({
        error: 'Error al refrescar el token',
        message: 'No se pudo renovar la sesión'
      });
    }
    
    // Obtener los tokens actualizados
    const tokens = await spotifyManager.getTokensFromRedis(userId);
    if (!tokens) {
      return res.status(400).json({
        error: 'Error al obtener tokens',
        message: 'No se pudieron recuperar los tokens actualizados'
      });
    }
    
    res.json({
      access_token: tokens.accessToken,
      expires_in: Math.floor((tokens.expiresAt - Date.now()) / 1000) // Convertir a segundos
    });
  } catch (error) {
    console.error('Error al refrescar el token:', error);
    res.status(400).json({ 
      error: 'Error al refrescar el token', 
      message: error.message 
    });
  }
});

module.exports = router;
