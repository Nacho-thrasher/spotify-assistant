/**
 * Script para iniciar el worker de procesamiento en segundo plano
 * Este script puede ejecutarse como un proceso independiente 
 * para manejar tareas asíncronas
 */
require('dotenv').config();
const { startWorker } = require('../workers/taskWorker');
const { redisClient } = require('../config/redis');

console.log('🚀 Iniciando worker de procesamiento de tareas...');

// Comprobar conexión a Redis
redisClient.on('connect', async () => {
  console.log('✅ Conexión a Redis establecida correctamente');
  
  try {
    // Verificar cola de tareas pendientes
    const { getQueueStats } = require('../services/queue/taskQueue');
    const stats = await getQueueStats();
    
    console.log(`📊 Estado de la cola:`);
    console.log(`   • Tareas pendientes: ${stats.pendingTasks}`);
    console.log(`   • Tareas completadas: ${stats.completedTasks}`);
    
    // Iniciar worker
    console.log('👷 Iniciando worker...');
    await startWorker();
    
    console.log('⏳ Worker iniciado y esperando tareas...');
    console.log('📝 Presiona Ctrl+C para detener el worker');
  } catch (error) {
    console.error('❌ Error al iniciar worker:', error);
    process.exit(1);
  }
});

// Manejar errores de conexión a Redis
redisClient.on('error', (err) => {
  console.error('❌ Error en conexión Redis:', err);
  console.error('❌ Asegúrate de que Redis está en ejecución y es accesible');
  console.error('   Puedes instalar Redis con: docker run --name redis -p 6379:6379 -d redis');
  process.exit(1);
});

// Manejar señales de cierre
process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo worker...');
  redisClient.quit().then(() => {
    console.log('👋 Conexión a Redis cerrada correctamente');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Recibida señal de terminación...');
  redisClient.quit().then(() => {
    console.log('👋 Conexión a Redis cerrada correctamente');
    process.exit(0);
  });
});
