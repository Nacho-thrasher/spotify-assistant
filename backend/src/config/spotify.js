const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

// En entorno de producción usamos la URL hardcodeada para evitar problemas con variables de entorno
const isProduction = process.env.NODE_ENV === 'production';
const redirectUri = isProduction 
  ? 'https://spotify-assistant-production.up.railway.app/api/auth/callback'
  : process.env.SPOTIFY_REDIRECT_URI;

console.log('Usando URI de redirección:', redirectUri);

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: redirectUri
});

module.exports = spotifyApi;
