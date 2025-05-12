/**
 * Servicio para gestionar modelos de IA a través de OpenRouter
 * Permite acceder a múltiples modelos con una única API
 */

const { OpenAI } = require('openai');
require('dotenv').config();

// Configuración de OpenRouter
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Inicializar cliente de OpenRouter (compatible con OpenAI SDK)
const openRouter = OPENROUTER_API_KEY 
  ? new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:8080', // URL de tu aplicación
        'X-Title': 'Spotify Assistant' // Nombre de tu aplicación
      }
    })
  : null;

// Definir modelos por nivel (de más capaz a menos capaz)
const modelTiers = {
  premium: [
    'openai/gpt-4o',
    'anthropic/claude-3-opus-20240229',
    'google/gemini-1.5-pro',
    'meta-llama/llama-3-70b-instruct'
  ],
  standard: [
    'anthropic/claude-3-sonnet-20240229',
    'openai/gpt-4-turbo',
    'google/gemini-1.0-pro',
    'meta-llama/llama-3-8b-instruct'
  ],
  economic: [
    'anthropic/claude-3-haiku-20240307',
    'openai/gpt-3.5-turbo',
    'google/gemini-1.0-flash',
    'mistralai/mistral-7b-instruct'
  ],
  free: [
    'microsoft/phi-4-reasoning-plus:free',
    'nousresearch/deephermes-3-mistral-24b-preview:free',
    'qwen/qwen3-8b:free',
    'qwen/qwen3-14b:free',
    // mantén los anteriores
    'nousresearch/nous-hermes-2-mixtral-8x7b-dpo',
    'openchat/openchat-7b',
    'undi95/toppy-m-7b',
    'huggingfaceh4/zephyr-7b-beta'
  ]
};

// Estado actual de los modelos
let currentTier = 'premium'; // Comenzar con el nivel premium
let failedModels = new Set();
let usageStats = {};

/**
 * Obtiene el siguiente modelo disponible
 * @returns {string} ID del modelo
 */
function getNextAvailableModel() {
  // Obtener modelos del nivel actual
  const modelsInTier = modelTiers[currentTier];
  
  // Buscar un modelo que no haya fallado
  for (const model of modelsInTier) {
    if (!failedModels.has(model)) {
      return model;
    }
  }
  
  // Si todos los modelos del nivel actual han fallado, bajar de nivel
  const tiers = Object.keys(modelTiers);
  const currentIndex = tiers.indexOf(currentTier);
  
  if (currentIndex < tiers.length - 1) {
    // Hay un nivel inferior disponible
    currentTier = tiers[currentIndex + 1];
    console.log(`⚠️ Bajando al nivel ${currentTier} de modelos`);
    failedModels = new Set(); // Reiniciar los fallos para el nuevo nivel
    return getNextAvailableModel();
  }
  
  // Si hemos llegado aquí, todos los modelos en todos los niveles han fallado
  throw new Error('Todos los modelos de IA han fallado');
}

/**
 * Genera una respuesta usando OpenRouter
 * @param {string} prompt - Prompt del sistema
 * @param {string} userMessage - Mensaje del usuario
 * @returns {string} Respuesta generada
 */
async function generateResponse(prompt, userMessage) {
  if (!openRouter) {
    throw new Error('OpenRouter no está configurado. Verifica la clave API.');
  }
  
  let attempts = 0;
  const maxAttempts = Object.values(modelTiers).flat().length; // Total de modelos disponibles
  
  while (attempts < maxAttempts) {
    try {
      // Obtener el siguiente modelo disponible
      const model = getNextAvailableModel();
      console.log(`🤖 Usando modelo: ${model}`);
      
      // Registrar uso
      if (!usageStats[model]) {
        usageStats[model] = { count: 0, errors: 0, lastUsed: null };
      }
      usageStats[model].count++;
      usageStats[model].lastUsed = new Date();
      
      // Generar respuesta
      const completion = await openRouter.chat.completions.create({
        model: model,
        max_tokens: 800,  // Evitar que la respuesta se corte
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userMessage }
        ],
        response_format: { type: "json_object" }
      });
      
      // Éxito - devolver la respuesta
      return completion.choices[0].message.content;
    } catch (error) {
      attempts++;
      
      // Obtener el modelo actual
      const model = getNextAvailableModel();
      
      // Registrar error
      if (usageStats[model]) {
        usageStats[model].errors++;
      }
      
      console.error(`Error con modelo ${model}:`, error.message);
      
      // Marcar este modelo como fallido
      failedModels.add(model);
      
      // Si es el último intento, propagar el error
      if (attempts >= maxAttempts) {
        throw new Error('Todos los modelos han fallado: ' + error.message);
      }
    }
  }
}

/**
 * Reinicia el estado del proveedor (para uso después de un período de tiempo)
 */
function resetProviderState() {
  currentTier = 'premium';
  failedModels = new Set();
}

/**
 * Obtiene estadísticas de uso de los modelos
 * @returns {Object} Estadísticas de uso
 */
function getUsageStats() {
  return {
    currentTier,
    failedModels: Array.from(failedModels),
    usageStats
  };
}

/**
 * Verifica si OpenRouter está configurado y disponible
 * @returns {boolean} true si está disponible
 */
function isAvailable() {
  return !!openRouter;
}

// Obtener el modelo actual en uso
function getCurrentModel() {
  return getNextAvailableModel();
}

module.exports = {
  generateResponse,
  getUsageStats,
  resetProviderState,
  isAvailable,
  getCurrentModel
};
