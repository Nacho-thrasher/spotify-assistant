/**
 * Script para probar directamente la función addToHistory
 */
require('dotenv').config();
const userHistory = require('../services/history/userHistory');

async function testAddToHistory() {
  try {
    console.log('🔍 Iniciando prueba de userHistory.addToHistory...');
    
    // Usar el ID de usuario "nacho" que ya existe en Redis
    const userId = 'nacho';
    
    console.log(`\n📝 Agregando nueva entrada de COMMAND para ${userId}...`);
    const result1 = await userHistory.addToHistory(userId, userHistory.EVENT_TYPES.COMMAND, {
      command: 'play',
      parameters: { query: 'Thunderstruck' },
      userMessage: 'Reproduce Thunderstruck de AC/DC',
      responseMessage: 'Reproduciendo Thunderstruck de AC/DC'
    });
    
    console.log(`✅ Resultado de agregar COMMAND: ${result1}`);
    
    console.log(`\n📝 Agregando nueva entrada de PLAYBACK para ${userId}...`);
    const result2 = await userHistory.addToHistory(userId, userHistory.EVENT_TYPES.PLAYBACK, {
      trackId: '57bgtoPSgt236HzfBOd8kj',
      trackName: 'Thunderstruck',
      artistId: '711MCceyCBcFnzjGY4Q7Un',
      artistName: 'AC/DC',
      action: 'play',
      timestamp: Date.now()
    });
    
    console.log(`✅ Resultado de agregar PLAYBACK: ${result2}`);
    
    // Verificar que se hayan agregado las entradas
    console.log('\n🔍 Verificando historial actualizado...');
    const history = await userHistory.getUserHistory(userId, 5);
    
    console.log(`📊 Se encontraron ${history.length} entradas en historial:`);
    history.forEach((item, index) => {
      console.log(`\n📌 Item #${index+1}:`);
      console.log(`   ID: ${item.id || 'no-id'}`);
      console.log(`   Tipo: ${item.type}`);
      console.log(`   Timestamp: ${new Date(item.timestamp).toLocaleString()}`);
      console.log(`   Datos: ${JSON.stringify(item.data).substring(0, 100)}...`);
    });
    
    console.log('\n✅ Prueba completada. Verifica los resultados en la interfaz de usuario.');
    console.log('   Las nuevas entradas deberían aparecer al principio del historial.');
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error);
  } finally {
    // Cerrar conexión a Redis
    await require('../config/redis').redisClient.quit();
  }
}

// Ejecutar y salir
testAddToHistory().then(() => {
  console.log('👋 Script finalizado');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error en el script:', err);
  process.exit(1);
});
