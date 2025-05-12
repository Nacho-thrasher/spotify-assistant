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
    
    // Obtener el ID de usuario de la sesión (asegurado por el middleware)
    const userId = req.userId;
    console.log(`Usuario autenticado: ${userId}`);
    
    // Guardar tokens asociados al usuario específico
    await spotifyManager.setTokensForUser(userId, access_token, refresh_token, expires_in);
    
    // En una aplicación real, aquí deberías:
    // 1. Guardar tokens en una base de datos asociados al usuario
    // 2. Crear una sesión o JWT para la autenticación del cliente
    // 3. Manejar la expiración y refresco de tokens
    
    // Determinar la URL de redirección en este orden de prioridad:
    // 1. El parámetro redirect_to en la URL de callback
    // 2. La URL guardada en la sesión desde el endpoint /login
    // 3. La variable de entorno FRONTEND_URL
    // 4. El valor predeterminado (http://localhost:3000)
    // URL hardcodeada para producción (la nueva URL del frontend)
    const isProduction = process.env.NODE_ENV === 'production';
    let frontendUrl = isProduction 
      ? 'https://spotify-assistant-front.vercel.app' 
      : (process.env.FRONTEND_URL || 'http://localhost:3000');
    
    // 1. Prioridad: Parámetro redirect_to en la URL
    if (redirect_to) {
      console.log(`🔸 Usando redirect_to de la URL: ${redirect_to}`);
      frontendUrl = redirect_to;
    }
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
    res.status(400).json({ 
      error: 'Error durante la autenticación', 
      message: error.message 
    });
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
    const data = await spotifyApi.refreshAccessToken();
    const { access_token, expires_in } = data.body;
    
    // Guardar el nuevo access token para este usuario
    await spotifyManager.setTokensForUser(userId, access_token, refresh_token, expires_in);
    
    res.json({
      access_token,
      expires_in
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
