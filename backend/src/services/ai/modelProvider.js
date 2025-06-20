/**
 * Proveedor de modelos de IA - Compatible con Groq y OpenRouter
 * 
 * Este módulo proporciona una abstracción para interactuar con diferentes 
 * proveedores de modelos de IA: Groq y OpenRouter.
 */

require('dotenv').config();
const { OpenAI } = require('openai');
const Groq = require('groq-sdk');

// Configuración de OpenRouter (compatible con OpenAI SDK)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Configuración de Groq
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Definición de modelos
const MODELS = {
  // Groq models (priorizados por velocidad y eficiencia)
  // Obtenidos de: https://console.groq.com/docs/models
  GROQ: [
    'llama3-8b-8192',           // Modelo más rápido y eficiente (8B parámetros)
    'llama-3.1-8b-instant',      // Versión más reciente, optimizada para velocidad
    'gemma-2-9b-it',             // Modelo ligero de Google
    'llama-3.1-8b-instant'       // Segunda oportunidad si el primero falla
  ],
  // OpenRouter models (fallback)
  OPENROUTER: [
    'meta-llama/llama-3-8b-instruct',   // Versión más ligera primero
    'openai/gpt-3.5-turbo',             // Más rápido que gpt-4
    'google/gemini-pro',                // Alternativa estable
    'anthropic/claude-instant-v1'       // Versión rápida de Claude
  ]
};

// Inicializar cliente de OpenRouter
let openRouterClient = null;
if (OPENROUTER_API_KEY) {
  try {
    openRouterClient = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL
    });
    console.log('✅ Cliente OpenRouter inicializado correctamente');
  } catch (error) {
    console.error('❌ Error al inicializar cliente OpenRouter:', error.message);
  }
}

// Inicializar cliente de Groq
let groqClient = null;
if (GROQ_API_KEY) {
  try {
    groqClient = new Groq({
      apiKey: GROQ_API_KEY
    });
    console.log('✅ Cliente Groq inicializado correctamente');
  } catch (error) {
    console.error('❌ Error al inicializar cliente Groq:', error.message);
  }
}

// Variable para almacenar el modelo utilizado más recientemente
let currentModel = '';

/**
 * Determina si hay proveedores de IA disponibles
 * @returns {boolean} - true si hay al menos un proveedor disponible
 */
function isAvailable() {
  return Boolean(openRouterClient || groqClient);
}

/**
 * Genera una respuesta utilizando el primer modelo disponible
 * Intenta con Groq primero (por velocidad), luego con OpenRouter
 * 
 * @param {string} systemPrompt - Prompt del sistema
 * @param {string} userMessage - Mensaje del usuario
 * @param {boolean} isRecommendationRequest - Si es una solicitud de recomendaciones
 * @returns {Promise<string>} - Respuesta generada
 */
async function generateResponse(systemPrompt, userMessage, isRecommendationRequest = false) {
  // Primero intentamos con Groq si está disponible (por velocidad)
  if (groqClient) {
    for (const model of MODELS.GROQ) {
      try {
        console.log(`🤖 Intentando con modelo Groq: ${model}`);
        console.log(`🔍 Tipo de solicitud: ${isRecommendationRequest ? 'Recomendación' : 'Comando normal'}`);
        
        // Preparar mensajes para Groq
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ];
        
        // Configurar parámetros según el tipo de solicitud
        const params = {
          messages: messages,
          model: model,
          temperature: isRecommendationRequest ? 0.9 : 0.7, // Mayor creatividad para recomendaciones
          max_tokens: isRecommendationRequest ? 800 : 500,
          // Para recomendaciones, no forzamos formato JSON_OBJECT ya que esperamos un array
          response_format: isRecommendationRequest ? undefined : { type: "json_object" }
        };
        
        // Solo log básico de la solicitud
        console.log(`🤖 Enviando solicitud a Groq modelo: ${model}, tipo: ${isRecommendationRequest ? 'recomendación' : 'comando'}`);
        
        // Hacer la solicitud a Groq
        const completion = await groqClient.chat.completions.create(params);
        
        // Guardar el modelo utilizado
        currentModel = model;
        
        // Extraer el contenido de la respuesta
        const responseContent = completion.choices[0].message.content;
        console.log(`✅ Respuesta exitosa de Groq (modelo: ${model})`);
        
        return responseContent;
      } catch (error) {
        console.error(`❌ Error con modelo Groq ${model}: ${error.message}`);
        // Solo loggear código de error importante
        if (error.code || error.status) {
          console.error(`Error status: ${error.status || 'N/A'}, code: ${error.code || 'N/A'}`);
        }
        continue; // Intentar con el siguiente modelo de Groq
      }
    }
  }
  
  // Si Groq falla o no está disponible, intentamos con OpenRouter
  if (openRouterClient) {
    for (const model of MODELS.OPENROUTER) {
      try {
        console.log(`🤖 Intentando con modelo OpenRouter: ${model}`);
        
        // Preparar mensajes para OpenRouter
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ];
        
        // Configurar parámetros según el tipo de solicitud
        const params = {
          model: model,
          messages: messages,
          temperature: isRecommendationRequest ? 0.9 : 0.7,
          max_tokens: isRecommendationRequest ? 800 : 500,
          // Para recomendaciones, no forzamos formato JSON_OBJECT ya que esperamos un array
          response_format: isRecommendationRequest ? undefined : { type: "json_object" }
        };
        
        // Hacer la solicitud a OpenRouter
        const completion = await openRouterClient.chat.completions.create(params);
        
        // Guardar el modelo utilizado
        currentModel = model;
        
        // Extraer el contenido de la respuesta
        const responseContent = completion.choices[0].message.content;
        console.log(`✅ Respuesta exitosa de OpenRouter (modelo: ${model})`);
        
        return responseContent;
      } catch (error) {
        console.error(`❌ Error con modelo OpenRouter ${model}: ${error.message}`);
        // Solo loggear código de error importante
        if (error.code || error.status) {
          console.error(`Error status: ${error.status || 'N/A'}, code: ${error.code || 'N/A'}`);
        }
        continue; // Intentar con el siguiente modelo
      }
    }
  }
  
  // Si llegamos aquí, todos los modelos fallaron
  throw new Error('Todos los modelos de IA han fallado');
}

/**
 * Valida que una respuesta de IA cumpla con el esquema esperado
 * @param {string} responseStr - Respuesta de la IA como string
 * @param {boolean} isRecommendationRequest - Si es una solicitud de recomendaciones
 * @returns {Object} - Respuesta validada y parseada
 */
function validateResponse(responseStr, isRecommendationRequest = false) {
  try {
    // Intentar parsear la respuesta como JSON
    let response = typeof responseStr === 'string' ? JSON.parse(responseStr) : responseStr;
    
    // Validar estructura básica
    if (!response.action || typeof response.action !== 'string') {
      throw new Error('La respuesta no tiene un campo "action" válido');
    }
    
    // Normalizar action a minúsculas
    response.action = response.action.toLowerCase();
    
    // Si es una solicitud de recomendaciones, validar campos adicionales
    if (isRecommendationRequest && response.action === 'recommendations') {
      if (!response.tracks || !Array.isArray(response.tracks)) {
        throw new Error('La respuesta no tiene un campo "tracks" válido para recomendaciones');
      }
      
      // Validar que cada pista tenga los campos necesarios
      let missingFields = 0;
      response.tracks = response.tracks.map((track, index) => {
        if (!track.name) {
          track.name = 'Canción desconocida';
          missingFields++;
        }
        if (!track.artist) {
          track.artist = 'Artista desconocido';
          missingFields++;
        }
        return track;
      });
      if (missingFields > 0) {
        console.warn(`⚠️ ${missingFields} campos faltantes en las recomendaciones fueron completados automáticamente`);
      }
    }
    
    // Verificar campos específicos para cada tipo de acción
    switch (response.action) {
      case 'play':
        if (!response.query) {
          throw new Error('La acción "play" requiere un campo "query"');
        }
        break;
      
      case 'volume':
        if (typeof response.level !== 'number' && typeof response.level !== 'string') {
          throw new Error('La acción "volume" requiere un campo "level" numérico o texto');
        }
        break;
      
      case 'get_info':
        if (!response.query) {
          throw new Error('La acción "get_info" requiere un campo "query"');
        }
        break;
      
      // Añadir validaciones para otras acciones según sea necesario
    }
    
    // Si todo está bien, devolver la respuesta validada
    return response;
  } catch (error) {
    console.error('❌ Error al validar respuesta:', error.message);
    
    // Devolver una respuesta fallback simple
    return {
      action: 'error',
      message: 'No pude entender lo que quieres hacer. ¿Podrías intentar con otra frase?'
    };
  }
}

/**
 * Devuelve el nombre del modelo utilizado en la última solicitud exitosa
 * @returns {string} Nombre del modelo o string vacío si no se ha utilizado ninguno
 */
function getCurrentModel() {
  return currentModel;
}

/**
 * Función para probar la conexión con Groq
 * @returns {Promise<boolean>} true si la conexión es exitosa, false en caso contrario
 */
async function testGroqConnection() {
  if (!groqClient) {
    console.error('❌ Cliente Groq no inicializado');
    return false;
  }
  
  try {
    // Prueba simple de conexión sin logs excesivos
    const response = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: 'Responde con "OK" si puedes leer este mensaje.' }],
      model: 'llama3-8b-8192',
      max_tokens: 10
    });
    
    return true;
  } catch (error) {
    console.error('❌ Error al probar conexión con Groq:', error.message);
    return false;
  }
}

// Ejecutar prueba de conexión al iniciar sin mensajes innecesarios
testGroqConnection().then(isConnected => {
  console.log(`🔌 Groq: ${isConnected ? 'Conectado' : 'Desconectado'}`);
});

module.exports = {
  isAvailable,
  generateResponse,
  validateResponse,
  testGroqConnection,
  getCurrentModel
};
