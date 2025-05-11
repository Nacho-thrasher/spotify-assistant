/**
 * Script para añadir IDs únicos a elementos del historial antiguos
 */
require('dotenv').config();
const { redisClient } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');

async function fixHistoryIds() {
  try {
    console.log('🔍 Conectando a Redis...');
    
    // Obtener todos los keys que empiezan con history:
    const historyKeys = await redisClient.keys('history:*');
    console.log(`\n📊 Keys de historial encontrados: ${historyKeys.length}`);
    
    let totalFixed = 0;
    
    if (historyKeys.length > 0) {
      for (const key of historyKeys) {
        const userId = key.split(':')[1];
        console.log(`\n🧑‍💻 Procesando historial de usuario: ${userId}`);
        
        // Obtener los datos de este historial
        const historyItems = await redisClient.lrange(key, 0, -1);
        console.log(`   📜 Items en historial: ${historyItems.length}`);
        
        let itemsFixed = 0;
        
        if (historyItems.length > 0) {
          for (let i = 0; i < historyItems.length; i++) {
            try {
              const item = JSON.parse(historyItems[i]);
              
              // Verificar si el item ya tiene un ID
              if (!item.id) {
                // Añadir ID único
                const newItem = {
                  ...item,
                  id: uuidv4()
                };
                
                // Reemplazar el item en la lista
                // LSET key index element
                await redisClient.lset(key, i, JSON.stringify(newItem));
                itemsFixed++;
                totalFixed++;
                
                if (i < 3) {
                  console.log(`   ✅ Item #${i+1} actualizado con ID: ${newItem.id}`);
                } else if (i === 3) {
                  console.log(`   📝 Más items siendo actualizados...`);
                }
              }
            } catch (err) {
              console.error(`   ❌ Error al procesar item ${i}:`, err);
            }
          }
        }
        
        console.log(`   🔧 Total items corregidos para ${userId}: ${itemsFixed}`);
      }
    } else {
      console.log('\n⚠️ No se encontraron datos de historial en Redis');
    }
    
    console.log(`\n✅ Proceso completado. Total de items corregidos: ${totalFixed}`);
  } catch (error) {
    console.error('❌ Error al procesar datos en Redis:', error);
  } finally {
    // Cerrar conexión a Redis
    await redisClient.quit();
  }
}

// Ejecutar y salir
fixHistoryIds().then(() => {
  console.log('👋 Script finalizado');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error en el script:', err);
  process.exit(1);
});
