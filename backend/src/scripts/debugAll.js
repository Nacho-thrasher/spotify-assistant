/**
 * Script de depuración completo
 */
require('dotenv').config();
const { redisClient } = require('../config/redis');

async function debugAll() {
  try {
    console.log('🔍 Conectando a Redis para depuración completa...');
    
    // 1. Revisar todas las claves en Redis para tener una visión general
    console.log('\n📋 TODAS LAS CLAVES EN REDIS:');
    const allKeys = await redisClient.keys('*');
    console.log(`   Total de claves: ${allKeys.length}`);
    
    if (allKeys.length > 0) {
      console.log('   Muestra de claves:');
      allKeys.slice(0, 10).forEach(key => console.log(`   - ${key}`));
      if (allKeys.length > 10) console.log(`   ... y ${allKeys.length - 10} más`);
    }
    
    // 2. Revisar específicamente las claves de historial
    console.log('\n📊 CLAVES DE HISTORIAL:');
    const historyKeys = await redisClient.keys('history:*');
    
    if (historyKeys.length > 0) {
      console.log(`   Total de historiales: ${historyKeys.length}`);
      
      for (const key of historyKeys) {
        const userId = key.split(':')[1];
        console.log(`\n   📝 Historial para usuario: ${userId}`);
        
        // Obtener los datos de este historial
        const historyItems = await redisClient.lrange(key, 0, -1);
        console.log(`      Items en historial: ${historyItems.length}`);
        
        // Verificar si los items tienen ID
        const sampleItem = historyItems.length > 0 ? JSON.parse(historyItems[0]) : null;
        console.log(`      Items tienen ID: ${sampleItem && sampleItem.id ? 'Sí' : 'No'}`);
        
        if (historyItems.length > 0) {
          console.log('      Muestra de datos:');
          // Mostrar los primeros 2 items
          for (let i = 0; i < Math.min(2, historyItems.length); i++) {
            const item = JSON.parse(historyItems[i]);
            console.log(`      - Item #${i+1}:`);
            console.log(`        Tipo: ${item.type}`);
            console.log(`        ID: ${item.id || 'no-id'}`);
            console.log(`        Timestamp: ${new Date(item.timestamp).toLocaleString()}`);
            console.log(`        Datos: ${JSON.stringify(item.data).substring(0, 100)}...`);
          }
        }
      }
    } else {
      console.log('   ⚠️ No se encontraron historiales.');
      
      // Crear historial de prueba automáticamente para el usuario "test-user-forced"
      console.log('\n   🧪 Generando historial de prueba para usuario: test-user-forced');
      
      const userHistory = require('../services/history/userHistory');
      await userHistory.addToHistory('test-user-forced', userHistory.EVENT_TYPES.COMMAND, {
        command: 'play',
        parameters: { query: 'Bohemian Rhapsody' },
        userMessage: 'Reproduce Bohemian Rhapsody'
      });
      
      await userHistory.addToHistory('test-user-forced', userHistory.EVENT_TYPES.PLAYBACK, {
        trackId: '7tFiyTMmKA6HbZW1Zapcr8',
        trackName: 'Bohemian Rhapsody',
        artistId: '1dfeR4HaWDbWqFHLkxsg1d',
        artistName: 'Queen',
        action: 'play'
      });
      
      console.log('   ✅ Datos de prueba creados.');
      console.log('   🔑 Para usar estos datos, asegúrate de usar el ID de usuario: test-user-forced');
    }
    
    // 3. Verificar los datos de tareas
    console.log('\n⚙️ DATOS DE TAREAS:');
    const taskKeys = await redisClient.keys('tasks:*');
    
    if (taskKeys.length > 0) {
      console.log(`   Total de claves de tareas: ${taskKeys.length}`);
      
      for (const key of taskKeys) {
        console.log(`\n   🔧 Cola de tareas: ${key}`);
        const tasks = await redisClient.lrange(key, 0, -1);
        console.log(`      Tasks en cola: ${tasks.length}`);
        
        if (tasks.length > 0) {
          console.log('      Muestra de tareas:');
          for (let i = 0; i < Math.min(2, tasks.length); i++) {
            const task = JSON.parse(tasks[i]);
            console.log(`      - Task #${i+1}:`);
            console.log(`        ID: ${task.id || 'no-id'}`);
            console.log(`        Tipo: ${task.type}`);
            console.log(`        Usuario: ${task.userId}`);
          }
        }
      }
    } else {
      console.log('   ⚠️ No se encontraron colas de tareas.');
      
      // Intentar crear una tarea de prueba
      console.log('\n   🧪 Intentando crear una tarea de prueba...');
      try {
        const { enqueueTask, TASK_TYPES } = require('../services/queue/taskQueue');
        const taskId = await enqueueTask('test-user-forced', TASK_TYPES.RECOMMENDATION_ANALYSIS, {
          seedTracks: ['7tFiyTMmKA6HbZW1Zapcr8'], // Bohemian Rhapsody
          limit: 5
        });
        
        if (taskId) {
          console.log(`   ✅ Tarea de prueba creada con ID: ${taskId}`);
          console.log('   🔑 La tarea debería ser procesada por el worker.');
        } else {
          console.log('   ❌ Error al crear tarea de prueba (sin error específico).');
        }
      } catch (error) {
        console.error('   ❌ Error al crear tarea de prueba:', error.message);
      }
    }
    
    // 4. Verificar la configuración del historial
    console.log('\n🔧 VERIFICANDO COMPONENTES DE HISTORIAL:');
    
    // Verificar importación y exportación de userHistory
    try {
      const userHistory = require('../services/history/userHistory');
      console.log('   ✅ Módulo userHistory cargado correctamente.');
      console.log(`   📊 Tipos de eventos disponibles: ${Object.keys(userHistory.EVENT_TYPES).join(', ')}`);
      console.log(`   📋 Funciones exportadas: ${Object.keys(userHistory).filter(k => typeof userHistory[k] === 'function').join(', ')}`);
    } catch (error) {
      console.error('   ❌ Error al cargar módulo userHistory:', error.message);
    }
    
    // Verificar integraciones en user.js
    try {
      const fs = require('fs');
      const path = require('path');
      const userApiPath = path.join(__dirname, '..', 'api', 'user.js');
      
      if (fs.existsSync(userApiPath)) {
        const userApiContent = fs.readFileSync(userApiPath, 'utf8');
        const hasHistoryImport = userApiContent.includes('userHistory');
        const hasHistoryUsage = userApiContent.includes('userHistory.addToHistory');
        
        console.log(`   📄 API de usuario (user.js):`);
        console.log(`      - Importa userHistory: ${hasHistoryImport ? 'Sí' : 'No'}`);
        console.log(`      - Usa addToHistory: ${hasHistoryUsage ? 'Sí' : 'No'}`);
        
        // Contar ocurrencias de addToHistory
        const matches = userApiContent.match(/userHistory\.addToHistory/g);
        const callCount = matches ? matches.length : 0;
        console.log(`      - Número de llamadas a addToHistory: ${callCount}`);
        
        // Verificar tipos de eventos utilizados
        const commandMatches = userApiContent.match(/EVENT_TYPES\.COMMAND/g);
        const playbackMatches = userApiContent.match(/EVENT_TYPES\.PLAYBACK/g);
        const searchMatches = userApiContent.match(/EVENT_TYPES\.SEARCH/g);
        
        console.log(`      - Usa EVENT_TYPES.COMMAND: ${commandMatches ? 'Sí' : 'No'} (${commandMatches ? commandMatches.length : 0} veces)`);
        console.log(`      - Usa EVENT_TYPES.PLAYBACK: ${playbackMatches ? 'Sí' : 'No'} (${playbackMatches ? playbackMatches.length : 0} veces)`);
        console.log(`      - Usa EVENT_TYPES.SEARCH: ${searchMatches ? 'Sí' : 'No'} (${searchMatches ? searchMatches.length : 0} veces)`);
      } else {
        console.log('   ⚠️ No se encontró el archivo user.js');
      }
    } catch (error) {
      console.error('   ❌ Error al verificar integraciones en user.js:', error.message);
    }
    
    console.log('\n✅ Depuración completa finalizada.');
    
  } catch (error) {
    console.error('❌ Error global en la depuración:', error);
  } finally {
    // Cerrar conexión a Redis
    await redisClient.quit();
  }
}

// Ejecutar y salir
debugAll().then(() => {
  console.log('👋 Script finalizado');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error en el script:', err);
  process.exit(1);
});
