/**
 * Adaptador para Spotify API con caché Redis
 * Envuelve las llamadas a la API de Spotify con caché para optimizar rendimiento
 */
const spotifyApi = require('../../config/spotify');
const { getCachedData, invalidateCache } = require('../cache/spotifyCache');

// Clase adaptadora que extiende la funcionalidad de Spotify API con caché
class SpotifyApiWithCache {
  constructor(userId = null) {
    this.userId = userId;
    this.spotifyApi = spotifyApi;
  }

  /**
   * Establece el token de acceso
   * @param {string} token - Token de acceso
   */
  setAccessToken(token) {
    this.spotifyApi.setAccessToken(token);
  }

  /**
   * Obtiene los dispositivos del usuario
   * @returns {Promise<Object>} - Dispositivos disponibles
   */
  async getMyDevices() {
    return await getCachedData(
      'devices', 
      this.userId,
      () => this.spotifyApi.getMyDevices(),
      {},
      60 // Caché de 1 minuto para dispositivos
    );
  }

  /**
   * Obtiene la canción en reproducción actualmente
   * @returns {Promise<Object>} - Información de reproducción
   */
  async getMyCurrentPlayingTrack() {
    return await getCachedData(
      'playback_state', 
      this.userId,
      () => this.spotifyApi.getMyCurrentPlayingTrack(),
      {},
      30 // Caché de 30 segundos para estado actual
    );
  }

  /**
   * Busca en Spotify
   * @param {string} query - Consulta de búsqueda
   * @param {Array} types - Tipos (track, album, artist, etc)
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} - Resultados de búsqueda
   */
  async search(query, types = ['track'], options = { limit: 5 }) {
    return await getCachedData(
      'search_results', 
      this.userId,
      () => this.spotifyApi.search(query, types, options),
      { query, types: types.join(','), limit: options.limit || 5 },
      1800 // Caché de 30 minutos para búsquedas
    );
  }

  /**
   * Obtiene recomendaciones basadas en semillas
   * @param {Object} options - Opciones de recomendación
   * @returns {Promise<Object>} - Recomendaciones
   */
  async getRecommendations(options) {
    const seedKeys = Object.keys(options).filter(key => key.startsWith('seed_'));
    const seedValues = {};
    
    seedKeys.forEach(key => {
      seedValues[key] = options[key];
    });
    
    return await getCachedData(
      'recommendations', 
      this.userId,
      () => this.spotifyApi.getRecommendations(options),
      seedValues,
      3600 // Caché de 1 hora para recomendaciones
    );
  }

  /**
   * Obtiene información de una pista
   * @param {string} trackId - ID de la pista
   * @returns {Promise<Object>} - Información de la pista
   */
  async getTrack(trackId) {
    return await getCachedData(
      'track_info', 
      this.userId,
      () => this.spotifyApi.getTrack(trackId),
      { trackId },
      1800 // Caché de 30 minutos para info de pistas
    );
  }

  /**
   * Obtiene características de audio de una pista
   * @param {string} trackId - ID de la pista
   * @returns {Promise<Object>} - Características de audio
   */
  async getAudioFeaturesForTrack(trackId) {
    return await getCachedData(
      'audio_features', 
      this.userId,
      () => this.spotifyApi.getAudioFeaturesForTrack(trackId),
      { trackId },
      1800 // Caché de 30 minutos para características
    );
  }

  /**
   * Obtiene información de un artista
   * @param {string} artistId - ID del artista
   * @returns {Promise<Object>} - Información del artista
   */
  async getArtist(artistId) {
    return await getCachedData(
      'artist_info', 
      this.userId,
      () => this.spotifyApi.getArtist(artistId),
      { artistId },
      3600 // Caché de 1 hora para info de artistas
    );
  }

  /**
   * Obtiene los top tracks de un artista
   * @param {string} artistId - ID del artista
   * @param {string} country - Código de país
   * @returns {Promise<Object>} - Top tracks
   */
  async getArtistTopTracks(artistId, country = 'ES') {
    return await getCachedData(
      'artist_top_tracks', 
      this.userId,
      () => this.spotifyApi.getArtistTopTracks(artistId, country),
      { artistId, country },
      3600 // Caché de 1 hora para top tracks
    );
  }

  /**
   * Obtiene artistas relacionados
   * @param {string} artistId - ID del artista
   * @returns {Promise<Object>} - Artistas relacionados
   */
  async getArtistRelatedArtists(artistId) {
    return await getCachedData(
      'artist_related', 
      this.userId,
      () => this.spotifyApi.getArtistRelatedArtists(artistId),
      { artistId },
      3600 // Caché de 1 hora para artistas relacionados
    );
  }

  /**
   * Obtiene las playlists del usuario
   * @returns {Promise<Object>} - Playlists del usuario
   */
  async getUserPlaylists() {
    return await getCachedData(
      'user_playlists', 
      this.userId,
      () => this.spotifyApi.getUserPlaylists(),
      {},
      3600 // Caché de 1 hora para playlists
    );
  }

  // Métodos que modifican estado y requieren invalidación de caché

  /**
   * Inicia o reanuda la reproducción
   * @param {Object} options - Opciones de reproducción
   * @returns {Promise<Object>} - Resultado
   */
  async play(options = {}) {
    const result = await this.spotifyApi.play(options);
    // Invalidar caché de estado de reproducción
    await invalidateCache('playback_state', this.userId);
    return result;
  }

  /**
   * Pausa la reproducción
   * @returns {Promise<Object>} - Resultado
   */
  async pause() {
    const result = await this.spotifyApi.pause();
    // Invalidar caché de estado de reproducción
    await invalidateCache('playback_state', this.userId);
    return result;
  }

  /**
   * Salta a la siguiente pista
   * @returns {Promise<Object>} - Resultado
   */
  async skipToNext() {
    const result = await this.spotifyApi.skipToNext();
    // Invalidar caché de estado de reproducción
    await invalidateCache('playback_state', this.userId);
    return result;
  }

  /**
   * Salta a la pista anterior
   * @returns {Promise<Object>} - Resultado
   */
  async skipToPrevious() {
    const result = await this.spotifyApi.skipToPrevious();
    // Invalidar caché de estado de reproducción
    await invalidateCache('playback_state', this.userId);
    return result;
  }

  /**
   * Establece el volumen
   * @param {number} volumePercent - Porcentaje de volumen (0-100)
   * @returns {Promise<Object>} - Resultado
   */
  async setVolume(volumePercent) {
    return await this.spotifyApi.setVolume(volumePercent);
  }

  /**
   * Añade una pista a la cola
   * @param {string} uri - URI de la pista
   * @returns {Promise<Object>} - Resultado
   */
  async addToQueue(uri) {
    const result = await this.spotifyApi.addToQueue(uri);
    return result;
  }

  /**
   * Crea una playlist
   * @param {string} name - Nombre de la playlist
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} - Playlist creada
   */
  async createPlaylist(name, options = {}) {
    const result = await this.spotifyApi.createPlaylist(name, options);
    // Invalidar caché de playlists del usuario
    await invalidateCache('user_playlists', this.userId);
    return result;
  }

  /**
   * Añade pistas a una playlist
   * @param {string} playlistId - ID de la playlist
   * @param {Array} uris - URIs de las pistas
   * @returns {Promise<Object>} - Resultado
   */
  async addTracksToPlaylist(playlistId, uris) {
    const result = await this.spotifyApi.addTracksToPlaylist(playlistId, uris);
    return result;
  }
}

// Exportar la clase con caché
module.exports = SpotifyApiWithCache;
