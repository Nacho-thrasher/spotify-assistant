/**
 * Administrador de instancias de SpotifyAPI por usuario
 * Mantiene una instancia separada para cada usuario, asegurando aislamiento de datos
 */

const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();
const { redisClient } = require('../../config/redis');

// En entorno de producción usamos la URL hardcodeada para evitar problemas con variables de entorno
const isProduction = process.env.NODE_ENV === 'production';
const redirectUri = isProduction 
  ? 'https://spotify-assistant-production.up.railway.app/api/auth/callback'
  : process.env.SPOTIFY_REDIRECT_URI;

// Cache de instancias de SpotifyAPI por usuario (en memoria)
const spotifyInstances = new Map();

/**
 * Guarda tokens de Spotify en Redis para un usuario específico
 */
const saveTokensToRedis = async (userId, accessToken, refreshToken, expiresIn) => {
  try {
    const tokenData = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + (expiresIn * 1000) // Convertir segundos a milisegundos
    };
    
    await redisClient.set(`spotify_tokens:${userId}`, JSON.stringify(tokenData));
    console.log(`Tokens guardados en Redis para usuario ${userId}`);
    return true;
  } catch (error) {
    console.error('Error al guardar tokens en Redis:', error);
    return false;
  }
};

/**
 * Obtiene tokens de Spotify desde Redis para un usuario específico
 */
const getTokensFromRedis = async (userId) => {
  try {
    const tokenData = await redisClient.get(`spotify_tokens:${userId}`);
    if (!tokenData) return null;
    
    return JSON.parse(tokenData);
  } catch (error) {
    console.error('Error al obtener tokens de Redis:', error);
    return null;
  }
};

/**
 * Crea una nueva instancia de SpotifyAPI con las credenciales básicas
 */
const createSpotifyInstance = () => {
  return new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri
  });
};

/**
 * Obtiene una instancia de SpotifyAPI para un usuario específico
 * Si no existe, crea una nueva y la inicializa con sus tokens si están disponibles
 */
const getSpotifyApiForUser = async (userId) => {
  // Si ya existe una instancia en memoria, la devolvemos
  if (spotifyInstances.has(userId)) {
    return spotifyInstances.get(userId);
  }
  
  // Crear nueva instancia
  const spotifyApi = createSpotifyInstance();
  
  // Intentar recuperar tokens desde Redis
  const tokens = await getTokensFromRedis(userId);
  if (tokens) {
    console.log(`Restaurando tokens para usuario ${userId}`);
    spotifyApi.setAccessToken(tokens.accessToken);
    spotifyApi.setRefreshToken(tokens.refreshToken);
  }
  
  // Guardar la instancia en memoria
  spotifyInstances.set(userId, spotifyApi);
  
  return spotifyApi;
};

/**
 * Guarda los tokens para un usuario específico y actualiza su instancia
 */
const setUserTokens = async (userId, accessToken, refreshToken, expiresIn) => {
  try {
    // Guardar en Redis
    await saveTokensToRedis(userId, accessToken, refreshToken, expiresIn);
    
    // Actualizar la instancia en memoria si existe
    if (spotifyInstances.has(userId)) {
      const spotifyApi = spotifyInstances.get(userId);
      spotifyApi.setAccessToken(accessToken);
      spotifyApi.setRefreshToken(refreshToken);
    } else {
      // Crear nueva instancia si no existe
      const spotifyApi = createSpotifyInstance();
      spotifyApi.setAccessToken(accessToken);
      spotifyApi.setRefreshToken(refreshToken);
      spotifyInstances.set(userId, spotifyApi);
    }
    
    console.log(`Tokens actualizados para usuario ${userId}`);
    return true;
  } catch (error) {
    console.error('Error al establecer tokens de usuario:', error);
    return false;
  }
};

/**
 * Intenta renovar el access token usando el refresh token 
 * @returns {boolean} true si se renovó exitosamente, false en caso contrario
 */
const refreshUserTokens = async (userId) => {
  try {
    // Verificar si tenemos instancia para este usuario
    if (!spotifyInstances.has(userId)) {
      // Intentar recuperar desde Redis
      const tokens = await getTokensFromRedis(userId);
      if (!tokens || !tokens.refreshToken) {
        console.error(`No hay refresh token para usuario ${userId}`);
        return false;
      }
      
      // Crear instancia con el refresh token
      const spotifyApi = createSpotifyInstance();
      spotifyApi.setRefreshToken(tokens.refreshToken);
      spotifyInstances.set(userId, spotifyApi);
    }
    
    // Obtener instancia
    const spotifyApi = spotifyInstances.get(userId);
    
    // Intentar renovar token
    const data = await spotifyApi.refreshAccessToken();
    const { access_token, expires_in } = data.body;
    
    console.log(`Token renovado para usuario ${userId}, expira en ${expires_in} segundos`);
    
    // Actualizar tokens
    spotifyApi.setAccessToken(access_token);
    
    // Guardar en Redis (manteniendo el mismo refresh token)
    const tokens = await getTokensFromRedis(userId);
    if (tokens && tokens.refreshToken) {
      await saveTokensToRedis(userId, access_token, tokens.refreshToken, expires_in);
    }
    
    return true;
  } catch (error) {
    console.error(`Error al renovar token para usuario ${userId}:`, error);
    return false;
  }
};

/**
 * Limpia la instancia de un usuario (logout)
 */
const clearUserInstance = async (userId) => {
  // Eliminar de memoria
  spotifyInstances.delete(userId);
  
  // Eliminar de Redis
  await redisClient.del(`spotify_tokens:${userId}`);
  
  console.log(`Instancia y tokens eliminados para usuario ${userId}`);
};

// Este objeto es compatible con la API original
// pero proporciona una "fachada" (facade) que aisla por usuario
const spotifyApiProxy = {
  // Método para obtener una instancia de Spotify para el usuario actual
  async getInstance(userId) {
    return await getSpotifyApiForUser(userId);
  },
  
  // Setters para mantener la compatibilidad con código existente
  async setTokensForUser(userId, accessToken, refreshToken, expiresIn) {
    return await setUserTokens(userId, accessToken, refreshToken, expiresIn);
  },
  
  // Para la redirección de autenticación inicial (no necesita usuario)
  createAuthorizeURL(scopes) {
    const spotifyApi = createSpotifyInstance();
    return spotifyApi.createAuthorizeURL(scopes, 'some-state');
  },
  
  // Para el intercambio de código por tokens (paso de autenticación)
  async authorizationCodeGrant(code) {
    const spotifyApi = createSpotifyInstance();
    return await spotifyApi.authorizationCodeGrant(code);
  },
  
  // Para renovar tokens
  async refreshAccessTokenForUser(userId) {
    return await refreshUserTokens(userId);
  },
  
  // Para limpiar datos de usuario (logout)
  async clearUser(userId) {
    await clearUserInstance(userId);
  }
};

module.exports = spotifyApiProxy;
