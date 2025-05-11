/**
 * Script para verificar datos en Redis directamente
 */
require('dotenv').config();
const { redisClient } = require('../config/redis');

async function checkRedisData() {
  try {
    console.log('🔍 Conectando a Redis para verificar datos...');
    
    // Obtener todos los keys que empiezan con history:
    const historyKeys = await redisClient.keys('history:*');
    console.log(`\n📊 Keys de historial encontrados: ${historyKeys.length}`);
    
    if (historyKeys.length > 0) {
      for (const key of historyKeys) {
        const userId = key.split(':')[1];
        console.log(`\n🧑‍💻 Usuario: ${userId}`);
        
        // Obtener los datos de este historial
        const historyItems = await redisClient.lrange(key, 0, -1);
        console.log(`   📜 Items en historial: ${historyItems.length}`);
        
        if (historyItems.length > 0) {
          console.log('   📝 Muestra de datos:');
          // Mostrar los primeros 3 items
          for (let i = 0; i < Math.min(3, historyItems.length); i++) {
            const item = JSON.parse(historyItems[i]);
            console.log(`   - Item #${i+1}:`);
            console.log(`     ID: ${item.id || 'no-id'}`);
            console.log(`     Tipo: ${item.type}`);
            console.log(`     Timestamp: ${new Date(item.timestamp).toLocaleString()}`);
            console.log(`     Datos: ${JSON.stringify(item.data).substring(0, 150)}...`);
            console.log('');
          }
        }
      }
    } else {
      console.log('\n⚠️ No se encontraron datos de historial en Redis');
      
      // Intentemos crear datos de prueba automáticamente
      console.log('\n🧪 Generando datos de prueba automáticamente...');
      
      const userHistory = require('../services/history/userHistory');
      const testUserId = 'test_user_' + Date.now().toString().substring(7);
      
      // Generar datos de prueba variados
      await userHistory.addToHistory(testUserId, userHistory.EVENT_TYPES.COMMAND, {
        command: 'play',
        parameters: { query: 'Shape of You' },
        userMessage: 'Reproduce Shape of You de Ed Sheeran'
      });
      
      await userHistory.addToHistory(testUserId, userHistory.EVENT_TYPES.PLAYBACK, {
        trackId: '7qiZfU4dY1lWllzX7mPBI3',
        trackName: 'Shape of You',
        artistId: '6eUKZXaKkcviH0Ku9w2n3V',
        artistName: 'Ed Sheeran',
        action: 'play'
      });
      
      await userHistory.addToHistory(testUserId, userHistory.EVENT_TYPES.SEARCH, {
        query: 'Coldplay',
        resultCount: 5
      });
      
      console.log(`✅ Datos de prueba generados para usuario: ${testUserId}`);
      console.log('🔄 Vuelve a ejecutar este script para ver los datos generados');
    }
    
    // Verificar datos de tareas
    console.log('\n🔍 Verificando cola de tareas...');
    const taskKeys = await redisClient.keys('tasks:*');
    console.log(`📊 Keys de tareas encontrados: ${taskKeys.length}`);
    
    if (taskKeys.length > 0) {
      for (const key of taskKeys) {
        console.log(`\n📋 Cola: ${key}`);
        const tasks = await redisClient.lrange(key, 0, -1);
        console.log(`   📜 Tasks en cola: ${tasks.length}`);
        
        if (tasks.length > 0) {
          console.log('   📝 Muestra de tareas:');
          for (let i = 0; i < Math.min(3, tasks.length); i++) {
            const task = JSON.parse(tasks[i]);
            console.log(`   - Task #${i+1}:`);
            console.log(`     ID: ${task.id || 'no-id'}`);
            console.log(`     Tipo: ${task.type}`);
            console.log(`     Usuario: ${task.userId}`);
            console.log(`     Datos: ${JSON.stringify(task.data).substring(0, 150)}...`);
            console.log('');
          }
        }
      }
    } else {
      console.log('⚠️ No se encontraron colas de tareas en Redis');
    }
    
    console.log('\n✅ Verificación completada');
  } catch (error) {
    console.error('❌ Error al verificar datos en Redis:', error);
  } finally {
    // Cerrar conexión a Redis
    await redisClient.quit();
  }
}

// Ejecutar y salir
checkRedisData().then(() => {
  console.log('👋 Script finalizado');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error en el script:', err);
  process.exit(1);
});
