/**
 * Script para probar las recomendaciones de IA
 */
const SpotifyApiWithCache = require('./services/spotify/spotifyApiWithCache');
const { getAIRecommendations } = require('./api/ai_recommendations');
const openaiService = require('./services/ai/openai');
const modelProvider = require('./services/ai/modelProvider');

// Función para probar las recomendaciones
async function testRecommendations() {
  try {
    console.log('🧪 INICIANDO PRUEBA DE RECOMENDACIONES DE IA');
    
    // Comprobar que getCurrentModel funciona correctamente
    console.log('1️⃣ Verificando modelProvider.getCurrentModel:');
    console.log('   • Modelo actual (antes de llamada):', modelProvider.getCurrentModel());
    
    // Crear contexto para recomendaciones
    const prompt = "Rock español de los 90";
    console.log('2️⃣ Probando generación de recomendaciones con prompt:', prompt);
    
    // Crear un contexto de prueba
    const promptContext = {
      prompt,
      currentTrack: null,
      recentTracks: []
    };
    
    // Probar módulo openaiService.processMessage
    console.log('3️⃣ Probando openaiService.processMessage:');
    try {
      const testResponse = await openaiService.processMessage('Dame recomendaciones de ' + prompt, 'test-user');
      console.log('   ✅ openaiService.processMessage completado correctamente');
      console.log('   • Modelo usado:', modelProvider.getCurrentModel());
    } catch (error) {
      console.error('   ❌ Error en openaiService.processMessage:', error.message);
    }
    
    // Crear un spotifyApi de prueba para un usuario demo
    const userId = 'test-user';
    const spotifyApi = new SpotifyApiWithCache(userId);
    
    // Configurar token (solo si tenemos uno disponible)
    // spotifyApi.setAccessToken('...');
    
    // Probar getAIRecommendations directamente
    console.log('4️⃣ Probando getAIRecommendations:');
    try {
      const result = await getAIRecommendations(spotifyApi, {query: prompt}, null, userId);
      console.log('   ✅ getAIRecommendations completado correctamente');
      console.log('   • Sugerencias de IA:', result.aiSuggestions.length);
      console.log('   • Canciones encontradas en Spotify:', result.recommendations.length);
      
      // Mostrar las recomendaciones
      console.log('\n📋 RECOMENDACIONES:');
      if (result.recommendations.length > 0) {
        result.recommendations.forEach((track, i) => {
          console.log(`   ${i+1}. "${track.name}" de ${track.artist}`);
        });
      } else {
        console.log('   No se encontraron recomendaciones en Spotify');
      }
      
      console.log('\n📋 SUGERENCIAS ORIGINALES DE IA:');
      if (result.aiSuggestions.length > 0) {
        result.aiSuggestions.forEach((suggestion, i) => {
          console.log(`   ${i+1}. "${suggestion.song}" de ${suggestion.artist}`);
        });
      }
    } catch (error) {
      console.error('   ❌ Error en getAIRecommendations:', error.message);
    }
    
    console.log('\n✅ PRUEBA FINALIZADA');
  } catch (error) {
    console.error('❌ ERROR GENERAL:', error);
  }
}

// Ejecutar la prueba
testRecommendations()
  .then(() => console.log('Script completado'))
  .catch(err => console.error('Error en script:', err));
