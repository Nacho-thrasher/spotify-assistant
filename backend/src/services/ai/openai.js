/**
 * Servicio de integración con modelos de IA para procesar mensajes del usuario
 * Versión mejorada con soporte para múltiples modelos a través de OpenRouter
 */
const userFeedback = require('./userFeedback');
const modelProvider = require('./modelProvider');

/**
 * Sistema de instrucciones base para el modelo - mejorado con contexto
 */
const getSystemPrompt = (context) => {
  console.log('🤖 Contexto de reproducción aqui:', context);
  // Construir un mensaje de contexto basado en la reproducción actual
  let contextMessage = '';
  
  if (context && context.currentTrack) {
    contextMessage += `\nCONTEXTO ACTUAL DE REPRODUCCIÓN:\n`;
    const track = context.currentTrack;
    contextMessage += `- Canción actual: "${track.name}" de ${track.artist}\n`;
    contextMessage += `- Álbum: ${track.album}\n`;
    contextMessage += `- Estado: ${track.isPlaying ? 'Reproduciendo' : 'Pausado'}\n`;
    
    // Añadir información de la cola si está disponible
    if (context.queue && context.queue.length > 0) {
      contextMessage += `\nCOLA DE REPRODUCCIÓN (${context.queue.length} ${context.queue.length === 1 ? 'canción' : 'canciones'}):\n`;
      // Limitar a 5 canciones para no saturar el prompt
      const queueToShow = context.queue.slice(0, 5);
      queueToShow.forEach((item, index) => {
        contextMessage += `${index + 1}. "${item.name}" de ${item.artist}\n`;
      });
      
      if (context.queue.length > 5) {
        contextMessage += `... y ${context.queue.length - 5} más\n`;
      }
    } else {
      contextMessage += `\nCOLA DE REPRODUCCIÓN: Vacía\n`;
    }
    
    // Añadir historial si está disponible
    if (context.history && context.history.length > 0) {
      contextMessage += `\nÚLTIMOS COMANDOS:\n`;
      context.history.slice(0, 3).forEach((cmd, index) => {
        contextMessage += `- ${cmd}\n`;
      });
    }
  } else {
    contextMessage = '\nNo hay reproducción activa en este momento.\n';
  }

  return `
# Asistente Musical de Spotify

## Rol
Eres un asistente musical útil, amigable y eficiente. Tu objetivo es ayudar al usuario a controlar Spotify mediante comandos en lenguaje natural.

## Funcionalidades Disponibles
- Reproducir música (por artista, canción, género o playlist)
- Pausar o reanudar la reproducción
- Saltar a la canción anterior o siguiente
- Ajustar el volumen
- Buscar canciones, artistas o playlists
- Crear y modificar playlists
- Añadir canciones (individuales o múltiples) a la cola
- Limpiar la cola de reproducción
- Proporcionar información sobre artistas, canciones, etc.

## Contexto Actual
${contextMessage}

## CRÍTICO: Distinción entre Acciones Play y Recommendations
- SIEMPRE usa la acción "recommendations" (no "play" ni "search") cuando el usuario pide:
  * "música similar a..." o "similar a..."
  * "recomendaciones de..."
  * "recomiéndame canciones como..."
  * "más canciones como esta"
  * "canciones parecidas a..."
  * "algo que suene como..."
  * Cualquier petición que busque SUGERENCIAS, no reproducción inmediata

- SOLO usa la acción "play" cuando el usuario quiere REPRODUCIR música inmediatamente:
  * "reproducir..." o "pon..."
  * "quiero escuchar..."
  * "toca..." o "escuchar..."
  * Peticiones explícitas de reproducción inmediata

## Estructura para Recomendaciones
Cuando uses la acción "recommendations", SIEMPRE incluye:
1. Al menos 3-5 canciones recomendadas
2. Cada canción debe tener "song" y "artist"
3. Un campo "basedOn" que explique en qué se basan las recomendaciones
4. Un mensaje explicativo que mencione por qué recomendaste estas canciones

## Manejo de Ambigüedades
Si la petición del usuario es ambigua entre reproducir o recomendar:
- Ante la duda, usa "recommendations" cuando mencione términos como "similar", "como", "parecido", etc.
- Usa "play" solo cuando esté claro que quiere reproducción inmediata.

## Ejemplos de Entradas y Respuestas

- Usuario: "música similar a toxicity system of a down"
  Respuesta CORRECTA: { "action": "recommendations", "parameters": { "songs": [{"song": "Chop Suey!", "artist": "System of a Down"}, ...], "basedOn": "Toxicity de System of a Down" }, "message": "..." }
  Respuesta INCORRECTA: { "action": "play", "parameters": { "query": "metal alternativo similar a System of a Down" }, "message": "..." }

- Usuario: "reproduce rock alternativo"
  Respuesta CORRECTA: { "action": "play", "parameters": { "query": "rock alternativo" }, "message": "..." }

## Recomendaciones Inteligentes
- Si el usuario pide "más como esto", sugiere contenido similar a lo que se está reproduciendo
- Utiliza la canción o artista actual como referencia cuando sea útil
- Adapta tus respuestas al género musical si es relevante
- Basarse en la cola de reproducción para hacer sugerencias cuando tenga sentido
- Sé proactivo ofreciendo información relevante sobre artistas o canciones cuando corresponda
- Si detectas que el usuario está corrigiendo una acción anterior, aprende de esa corrección

## Instrucciones Generales
1. Responde de forma concisa, conversacional y centrada en música
2. Detecta la intención del usuario y extrae los parámetros necesarios
3. Usa el contexto de reproducción para enriquecer tus respuestas
4. Si una acción no se puede ejecutar, responde con una explicación amable
5. Cuando el usuario solicite información sobre artistas o canciones, proporciona datos interesantes

## Formato de Respuesta
Debes devolver un objeto JSON con los siguientes campos:
- action: la acción a realizar (play, pause, next, previous, volume, search, etc.)
- parameters: objeto con parámetros relevantes para la acción
- message: mensaje conversacional para responder al usuario

## Acciones Disponibles
- "play": reproducir música (requiere query o trackId)
- "pause": pausar reproducción
- "resume": reanudar reproducción
- "next": siguiente canción
- "previous": canción anterior
- "volume": ajustar volumen (requiere level: 0-100)
- "search": buscar música (requiere query)
- "queue": añadir canción a la cola (requiere query o queries para múltiples canciones)
- "clear_queue": limpiar la cola de reproducción
- "info": proporcionar información (usa esta acción cuando solo quieras responder sin realizar una acción en Spotify)
- "recommendations": recomendar música similar (cuando el usuario pide "más como esto")
- "get_info": obtener información sobre artistas, canciones o álbumes (requiere query)

## Ejemplos de Parámetros
- query: "rock de los 80s", "canciones de Coldplay"
- queries: ["Bohemian Rhapsody", "Stairway to Heaven", "Sweet Child O'Mine"]
- trackId: "spotify:track:123456"
- playlistId: "spotify:playlist:123456"
- level: 60 (para volumen)
- target: "artist", "track", "album" (para búsquedas específicas)

## Ejemplos de Respuestas

{ \"action\": \"play\", \"parameters\": { \"query\": \"rock alternativo\" }, \"message\": \"Reproduciendo rock alternativo para ti. ¡Disfruta!\" }

{ \"action\": \"queue\", \"parameters\": { \"queries\": [\"Thunderstruck\", \"Back in Black\"] }, \"message\": \"He añadido Thunderstruck y Back in Black a la cola de reproducción.\" }

{ \"action\": \"recommendations\", \"parameters\": { \"songs\": [{ \"artist\": \"Led Zeppelin\", \"song\": \"Stairway to Heaven\" }, { \"artist\": \"Pink Floyd\", \"song\": \"Comfortably Numb\" }, { \"artist\": \"The Doors\", \"song\": \"Riders on the Storm\" }, { \"artist\": \"Deep Purple\", \"song\": \"Smoke on the Water\" }], \"basedOn\": \"canciones de rock clásico\" }, \"message\": \"Aquí tienes algunas recomendaciones de rock clásico que seguramente te gustarán por su instrumental elaborado y sus solos de guitarra.\" }

## Manejo de Correcciones
Si el usuario corrige una acción anterior (por ejemplo, "No, quería añadir X a la cola, no reproducirlo"), reconoce el error, aplica la corrección y aprende para futuras interacciones.

{ \"action\": \"queue\", \"parameters\": { \"query\": \"Sweet Child O Mine\" }, \"message\": \"Entendido, he añadido Sweet Child O Mine a la cola en lugar de reproducirla directamente.\" }
`;
};
/**
 * Histórico de comandos del usuario para contexto
 */
const commandHistory = [];
const MAX_HISTORY = 5;

/**
 * Guarda un comando en el histórico para uso futuro
 * @param {string} command - Comando a guardar
 */
const saveToHistory = (command) => {
  // Añadir al principio para mantener los más recientes
  commandHistory.unshift(command);
  
  // Limitar tamaño del histórico
  if (commandHistory.length > MAX_HISTORY) {
    commandHistory.pop();
  }
};

/**
 * Función para procesar un mensaje del usuario utilizando modelos de IA
 * @param {string} message - Mensaje del usuario
 * @param {Object} playbackContext - Contexto actual de reproducción (opcional)
 * @param {string} userId - ID del usuario (opcional)
 * @returns {Object} - Acción a realizar y mensaje de respuesta
 */
async function processMessage(message, playbackContext = null, userId = 'anonymous') {
  // Guardar el comando en el histórico
  saveToHistory(message);
  
  // Verificar si hay proveedores de IA disponibles
  if (!modelProvider.isAvailable()) {
    console.log('⚠️ OpenRouter no está configurado. Usando procesamiento simple.');
    return processMessageSimple(message, userId);
  }
  
  try {
    // Preparar contexto enriquecido para el prompt
    let context = { history: commandHistory };
    console.log('Contexto de reproducción:', playbackContext);
    // Añadir contexto de reproducción si está disponible
    if (playbackContext) {
      try {
        context.currentTrack = playbackContext.currentlyPlaying || null;
        context.queue = playbackContext.nextInQueue || [];
      } catch (contextError) {
        console.warn('⚠️ Error al procesar el contexto de reproducción:', contextError.message);
        // Continuar con el contexto parcial
      }
    } else {
      console.log('Contexto de reproducción no proporcionado. No se incluirá en el prompt.');
    }
    
    try {
      console.log('🤖 Procesando mensaje con IA usando contexto enriquecido');
      
      // Generar el prompt
      console.log('✨ PROCESAMIENTO DE MENSAJE ✨');
      console.log('💬 ENTRADA:', message);
      
      // Detectar si es una solicitud de recomendaciones
      const isRecommendationRequest = 
        message.toLowerCase().includes('recomend') || 
        message.toLowerCase().includes('similar') || 
        message.toLowerCase().includes('más como') ||
        message.toLowerCase().includes('que te parezcan a');
      
      // Procesar mensaje con OpenRouter
      console.log('🤗 Enviando mensaje a modelo de IA...');
      
      // Intentamos con cada modelo disponible, comenzando por el principal
      // Pasamos el flag isRecommendationRequest para activar el esquema JSON apropiado
      const responseContent = await modelProvider.generateResponse(
        getSystemPrompt(context), 
        message,
        { isRecommendationRequest }
      );
      
      // Log detallado de la respuesta
      console.log('✨ RESPUESTA DEL MODELO:');
      console.log('==================== INICIO RESPUESTA MODELO ====================');
      console.log(responseContent);
      console.log('==================== FIN RESPUESTA MODELO ====================');
      
      // Log adicional para análisis
      try {
        const parsedResponse = JSON.parse(responseContent);
        console.log('🔍 ANÁLISIS DE RESPUESTA:');
        console.log('   • Acción detectada:', parsedResponse.action);
        console.log('   • Parámetros:', JSON.stringify(parsedResponse.parameters, null, 2));
        console.log('   • Longitud del mensaje:', parsedResponse.message.length, 'caracteres');
        console.log('   • Modelo usado:', modelProvider.getCurrentModel());
      } catch (parseError) {
        console.warn('⚠️ Error al analizar respuesta JSON:', parseError.message);
      }
      
      try {
        // Limpiar la respuesta antes de intentar parsearla
        let cleanResponse = responseContent.trim();
        
        // Si la respuesta comienza con '(' y termina con ')', intenta extraer el JSON dentro
        if (cleanResponse.startsWith('(') && cleanResponse.endsWith(')')) {
          cleanResponse = cleanResponse.substring(1, cleanResponse.length - 1).trim();
        }
        
        // Eliminar líneas de stacktraces que puedan estar contaminando
        cleanResponse = cleanResponse.replace(/\s+at\s+[\w\.]+\s?\([^)]+\)/g, "");
        cleanResponse = cleanResponse.replace(/\s+at\s+async\s+[^\n]+/g, "");
        
        // Limpiar caracteres de control que pueden romper el JSON
        cleanResponse = cleanResponse.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
        
        // Intentar primero extraer arrays JSON si estamos buscando recomendaciones
        let isRecommendationRequest = message.toLowerCase().includes('recomend') || 
                                      message.toLowerCase().includes('similar') || 
                                      message.toLowerCase().includes('más como');
        
        if (isRecommendationRequest) {
          // Buscar arrays JSON dentro del texto (buscar recomendaciones)
          const arrayStartIndex = cleanResponse.indexOf('[');
          const arrayEndIndex = cleanResponse.lastIndexOf(']') + 1;
          
          if (arrayStartIndex !== -1 && arrayEndIndex !== -1 && arrayEndIndex > arrayStartIndex) {
            console.log('Detectado posible array JSON (recomendaciones) entre los índices:', arrayStartIndex, arrayEndIndex);
            let jsonCandidate = cleanResponse.substring(arrayStartIndex, arrayEndIndex);
            console.log('Candidato JSON (array) extraido:', jsonCandidate.substring(0, Math.min(jsonCandidate.length, 100)) + (jsonCandidate.length > 100 ? '...' : ''));
            
            // Limpieza adicional si hay texto entre elementos del array
            jsonCandidate = jsonCandidate.replace(/\}\s+[^\{\}\[\],:"]+\s+\{/g, "},{");
            
            // Eliminar espacios en blanco adicionales dentro del array
            jsonCandidate = jsonCandidate.replace(/\[\s+\{/g, "[{").replace(/\}\s+\]/g, "}]");
            console.log('Candidato JSON después de limpieza:', jsonCandidate.substring(0, Math.min(jsonCandidate.length, 100)) + (jsonCandidate.length > 100 ? '...' : ''));
            
            try {
              // Intentar parsear el array JSON como recomendaciones
              const recommendations = JSON.parse(jsonCandidate);
              console.log('✨ Éxito al parsear array JSON de recomendaciones');
              
              // Construir una respuesta en el formato esperado con el array detectado
              const actionResponse = {
                action: 'recommendations',
                parameters: { 
                  songs: recommendations,
                  basedOn: message.toLowerCase().includes('tornado') ? 'Tornado of Souls' : 
                          message.toLowerCase().includes('cemetery') ? 'Cemetery Gates' : 
                          message.toLowerCase().includes('pantera') ? 'Pantera' : 
                          message.toLowerCase().includes('megadeth') ? 'Megadeth' : 
                          'detected_recommendations'
                },
                message: 'Aquí tienes algunas recomendaciones similares a lo que pediste.'
              };
              
              // Registrar la interacción
              userFeedback.logInteraction({
                userId,
                userMessage: message,
                detectedAction: 'recommendations',
                parameters: { songs: recommendations },
                successful: true,
                model: modelProvider.getCurrentModel()
              }).catch(err => console.error('Error al registrar interacción:', err));
              
              return actionResponse;
            } catch (arrayParseError) {
              console.warn('Fallo al parsear array de recomendaciones:', arrayParseError.message);
            }
          }
        }
        
        // Si no se detectó un array de recomendaciones, buscar un objeto JSON
        const jsonStartIndex = cleanResponse.indexOf('{');
        const jsonEndIndex = cleanResponse.lastIndexOf('}') + 1;
        
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
          console.log('Detectado posible objeto JSON entre los índices:', jsonStartIndex, jsonEndIndex);
          let jsonCandidate = cleanResponse.substring(jsonStartIndex, jsonEndIndex);
          
          // Limpieza adicional si hay texto entre propiedades JSON
          jsonCandidate = jsonCandidate.replace(/"\s*:\s*"[^"]+"\s+[^\{\}\[\],:"]+\s+"[^"]+"\s*:/g, function(match) {
            const colonPos = match.indexOf(':');
            const lastQuotePos = match.lastIndexOf('"');
            return match.substring(0, colonPos + 1) + ' ' + match.substring(lastQuotePos);
          });
          
          // Intentar parsear el objeto JSON limpio
          try {
            const parsedResponse = JSON.parse(jsonCandidate);
            console.log('✨ Éxito al parsear JSON después de limpieza');
            
            // Registrar la interacción para aprendizaje (asíncrono, no bloqueante)
            userFeedback.logInteraction({
              userId,
              userMessage: message,
              detectedAction: parsedResponse.action,
              parameters: parsedResponse.parameters,
              successful: true,
              model: modelProvider.getCurrentModel()
            }).catch(err => console.error('Error al registrar interacción:', err));
            
            return parsedResponse;
          } catch (innerParseError) {
            console.warn('No se pudo parsear el JSON candidato después de limpieza:', innerParseError.message);
          }
        }
        
        // Si el objeto JSON no se pudo extraer, intentar con la respuesta original
        const parsedResponse = JSON.parse(responseContent);  
        
        // Registrar la interacción para aprendizaje (asíncrono, no bloqueante)
        userFeedback.logInteraction({
          userId,
          userMessage: message,
          detectedAction: parsedResponse.action,
          parameters: parsedResponse.parameters,
          successful: true,
          model: modelProvider.getCurrentModel()
        }).catch(err => console.error('Error al registrar interacción:', err));
        
        return parsedResponse;
      } catch (parseError) {
        console.error('Error al parsear respuesta del modelo:', parseError);
        // Si hay error de parseo, usar el procesamiento simple como fallback
        console.log('⚠️ Usando procesamiento simple como fallback debido a error de parseo');
        return processMessageSimple(message, userId);
      }
    } catch (modelError) {
      // Si todos los proveedores fallan
      console.error('🔴 Error con todos los modelos de IA:', modelError);
      
      // Registrar el error para análisis
      userFeedback.logInteraction({
        userId,
        userMessage: message,
        detectedAction: 'error',
        parameters: { errorType: 'model_error', errorMessage: modelError.message },
        successful: false
      }).catch(err => console.error('Error al registrar interacción con error:', err));
      
      // Usar procesamiento simple como fallback
      console.log('⚠️ Usando procesamiento simple como fallback debido a error en todos los modelos');
      return processMessageSimple(message, userId);
    }
  } catch (generalError) {
    console.error('Error general en processMessage:', generalError);
    return processMessageSimple(message, userId);
  }
}

/**
 * Procesamiento simple de mensajes (fallback si OpenAI no está disponible)
 * @param {string} message - Mensaje del usuario
 * @param {string} userId - ID del usuario (opcional)
 * @returns {Object} - Acción a realizar y mensaje de respuesta
 */
async function processMessageSimple(message, userId = 'anonymous') {
  console.log('\n\n✨ PROCESAMIENTO DE MENSAJE ✨');
  console.log('💬 ENTRADA:', message);
  const lowerMessage = message.toLowerCase();
  let action = 'info';
  let parameters = {};
  let responseMessage = 'No estoy seguro de lo que quieres hacer. Prueba con comandos como "reproducir rock" o "pausar música".';
  
  // Obtener patrones de aprendizaje para mejorar la detección
  let learningPatterns = {};
  try {
    learningPatterns = await userFeedback.getLearningPatterns();
  } catch (error) {
    console.error('Error al obtener patrones de aprendizaje:', error);
  }
  
  // Evaluar si el mensaje parece claramente una solicitud para añadir a la cola
  // MEJORADO: Ahora detecta comandos simples como "cola [canción]" sin necesidad de verbos
  let isQueueRequest = 
    // Caso 1: Palabra "cola" o "queue" al inicio del mensaje (comando simple)
    lowerMessage.startsWith('cola ') || lowerMessage.startsWith('queue ') ||
    
    // Caso 2: Contiene palabras relacionadas con la cola
    (lowerMessage.includes('cola') || lowerMessage.includes('queue') ||
     lowerMessage.includes('siguiente') || lowerMessage.includes('después') ||
     lowerMessage.includes('despues') || lowerMessage.includes('a continuación') ||
     lowerMessage.includes('a continuacion')) && 
    // Y contiene acciones típicas de agregar (opcional para comandos simples)
    (lowerMessage.includes('añade') || lowerMessage.includes('agregar') || 
     lowerMessage.includes('pon') || lowerMessage.includes('poner') ||
     lowerMessage.includes('añadir') || lowerMessage.includes('agrega') ||
     lowerMessage.includes('coloca') || lowerMessage.includes('incluye') ||
     lowerMessage.includes('meter') || lowerMessage.includes('mete') ||
     lowerMessage.includes('add'));
     
  // NUEVO: Detectar comandos simples como "agregar [canción]" sin mencionar explícitamente la cola
  if (!isQueueRequest && 
      (lowerMessage.startsWith('agregar ') || 
       lowerMessage.startsWith('añadir ') || 
       lowerMessage.startsWith('agrega ') || 
       lowerMessage.startsWith('añade '))) {
    // Verificar que no sea otro tipo de comando (como volumen, etc.)
    if (!lowerMessage.includes('volum') && 
        !lowerMessage.includes('anterior') && 
        !lowerMessage.includes('siguiente') && 
        !lowerMessage.includes('pausa') && 
        !lowerMessage.includes('stop') && 
        !lowerMessage.includes('continua')) {
      console.log('🔍 Detectado comando simple de agregar sin mencionar cola');
      isQueueRequest = true;
    }
  }

  // Aplicar patrones de aprendizaje si existen
  if (learningPatterns && Object.keys(learningPatterns).length > 0) {
    // Verificar si algún patrón aprendido coincide con el mensaje actual
    for (const [originalAction, corrections] of Object.entries(learningPatterns)) {
      for (const [correctedAction, patterns] of Object.entries(corrections)) {
        // Buscar coincidencias en los patrones
        const matchingPattern = patterns.find(pattern => 
          lowerMessage.includes(pattern.trigger) || 
          pattern.trigger.includes(lowerMessage)
        );
        
        if (matchingPattern && matchingPattern.count >= 2) { // Aplicar solo si ha ocurrido al menos 2 veces
          console.log(`🧠 APRENDIZAJE: Aplicando corrección de "${originalAction}" a "${correctedAction}"`);
          console.log(`   • Patrón: "${matchingPattern.trigger}" (visto ${matchingPattern.count} veces)`);
          
          // Si estamos por detectar la acción original, cambiarla por la corregida
          if (
            (originalAction === 'queue' && isQueueRequest) ||
            (originalAction === 'play' && (lowerMessage.includes('reproduc') || lowerMessage.includes('play'))) ||
            // Añadir más casos según sea necesario
            (originalAction === 'info' && action === 'info')
          ) {
            console.log(`   • Cambiando acción detectada a: ${correctedAction}`);
            
            // Forzar la acción corregida
            if (correctedAction === 'queue') {
              isQueueRequest = true;
            } else if (correctedAction === 'play') {
              // Forzar detección como reproducción
              action = 'play';
              parameters = { query: lowerMessage };
              responseMessage = `Reproduciendo "${lowerMessage}"`;
              
              // Registrar la aplicación del aprendizaje (asíncrono)
              userFeedback.logInteraction({
                userId,
                userMessage: message,
                detectedAction: correctedAction,
                parameters,
                successful: true,
                appliedLearning: true,
                originalDetection: originalAction
              }).catch(err => console.error('Error al registrar interacción con aprendizaje:', err));
              
              return { action, parameters, message: responseMessage };
            }
            // Añadir más acciones según sea necesario
          }
        }
      }
    }
  }

  // Añadir a la cola (si parece una solicitud de cola)
  if (isQueueRequest) {
    action = 'queue';
    let query = '';
    let matched = false;

    // MEJORADO: Patrones adicionales para comandos de cola
    const regexPatterns = [
      // NUEVO: Comando simple "cola X" o "queue X"
      /^cola\s+(.+)$/i,
      /^queue\s+(.+)$/i,
      
      // NUEVO: Patrones con "a continuación/después"
      /(pon|poner|coloca|colocar|añade|añadir|agrega|agregar|mete|meter)\s+(.+?)\s+(a\s+continuaci[oó]n|despu[eé]s)/i,
      /(a\s+continuaci[oó]n|despu[eé]s)\s+(pon|poner|coloca|colocar|añade|añadir|agrega|agregar|mete|meter)\s+(.+)/i,
      
      // Patrones como "añade X a la cola"
      /añade\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /añadir\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /agrega\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /agregar\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /pon\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /poner\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /coloca\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /incluye\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /mete\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /meter\s+(.+?)\s+(a\s+la\s+cola|en\s+la\s+cola|a\s+cola|en\s+cola)/i,
      /add\s+(.+?)\s+(to\s+queue|to\s+the\s+queue)/i,
      
      // Patrones invertidos como "a la cola añade X"
      /(a\s+la\s+cola|en\s+la\s+cola)\s+(añade|agrega|pon|mete)\s+(.+)/i,
      
      // Patrones con "siguiente" 
      /(pon|poner|coloca|colocar|añade|añadir|agrega|agregar|mete|meter)\s+(.+?)\s+como\s+(siguiente|próxima)\s+(canción|tema|pista)/i,
      /(pon|poner|coloca|colocar|añade|añadir|agrega|agregar|mete|meter)\s+(.+?)\s+(de\s+siguiente|de\s+próxima)/i,
      
      // Comando simple queue
      /queue\s+(.+)$/i,
      
      // Comando simple "a la cola"
      /(añade|agrega|pon|mete)\s+(a|en)\s+(la\s+)?(cola)\s+(.+)$/i,
      
      // Orden inverso
      /(a|en)\s+(la\s+)?(cola)\s+(añade|agrega|pon|mete)\s+(.+)$/i
    ];
    
    // Intentar encontrar coincidencia con regex
    for (const pattern of regexPatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        // Diferentes patrones tienen la consulta en diferentes grupos
        let extractedQuery = '';
        
        // NUEVO: Comando simple "cola X" o "queue X"
        if (pattern.toString().includes('^cola\\s+') || pattern.toString().includes('^queue\\s+')) {
          extractedQuery = match[1].trim();
          console.log(' DETECCIÓN: Comando simple cola/queue');
        }
        // NUEVO: Patrones con "a continuación/después"
        else if (pattern.toString().includes('continuaci[oó]n|despu[eé]s')) {
          if (match[2]) {
            extractedQuery = match[2].trim();
            console.log(' DETECCIÓN: Patrón a continuación/después');
          } else if (match[3]) {
            extractedQuery = match[3].trim();
            console.log(' DETECCIÓN: Patrón invertido a continuación/después');
          }
        }
        // Patrón invertido: "a la cola añade X"
        else if (match[3] && (match[1] || '').includes('cola')) {
          extractedQuery = match[3].trim();
          console.log(' DETECCIÓN: Patrón invertido de cola');
        }
        // Patrón de siguiente canción: "pon X como siguiente canción"
        else if (match[2] && (match[3] || '').includes('siguiente')) {
          extractedQuery = match[2].trim();
          console.log(' DETECCIÓN: Patrón de siguiente canción');
        }
        // Patrón simple de cola: "añade a la cola X"
        else if (match[5] && (match[4] || '').includes('cola')) {
          extractedQuery = match[5].trim();
          console.log(' DETECCIÓN: Patrón simple de cola');
        }
        // Patrón estándar: "añade X a la cola"
        else if (match[1]) {
          extractedQuery = match[1].trim();
          console.log(' DETECCIÓN: Patrón estándar de cola');
        }
        
        if (extractedQuery) {
          query = extractedQuery;
          matched = true;
          console.log('   • Patrón:', pattern);
          console.log('   • Coincidencia:', query);
          break;
        }
      }
    }

    // Si no se ha encontrado patrón, intentar método alternativo
    if (!matched) {
      // MEJORADO: Términos adicionales para detección de cola
      const queueTerms = ['cola', 'queue', 'añadir a la cola', 'agregar a la cola', 'en la cola', 
                          'a continuación', 'a continuacion', 'después', 'despues', 'siguiente canción'];
      for (const term of queueTerms) {
        if (lowerMessage.includes(term)) {
          const parts = lowerMessage.split(term);
          if (parts.length > 1) {
            if (parts[1].trim()) {
              query = parts[1].trim();
              matched = true;
              console.log(' DETECCIÓN: Término de cola encontrado');
              console.log('   • Término:', term);
              console.log('   • Consulta después:', query);
              break;
            } else if (parts[0].trim()) {
              // Buscar en la parte anterior del mensaje
              const preParts = parts[0].split(' ');
              const relevantParts = preParts.slice(Math.max(0, preParts.length - 5)).join(' ').trim();
              if (relevantParts && !relevantParts.match(/^(pon|poner|agregar?|añad[ei]r?)$/i)) {
                query = relevantParts;
                matched = true;
                console.log(' DETECCIÓN: Término de cola encontrado (antes)');
                console.log('   • Término:', term);
                console.log('   • Consulta antes:', query);
                break;
              }
            }
          }
        }
      }
    }
    
    if (query) {
      console.log(' RESULTADO: Consulta para cola encontrada =>', query);
      // Procesar consulta para detectar múltiples canciones
      const songQueries = [];
      // MEJORADO: Buscar patrones de separación de canciones
      // 1. Canciones separadas por 'y', 'and', 'también', etc.
      // Agrego más patrones y hago que los separadores sean menos estrictos
      const splitByConjunctions = query.split(/\s*y\s+|\s+and\s+|\s+tambi[eé]n\s+|\s+junto\s+con\s+|\s+adem[aá]s\s+de\s+|\s*&\s*|\s+m[aá]s\s+|\s*\+\s*|\s*luego\s+|\s+despu[eé]s\s+|\s+seguido\s+de\s+/i);
      // 2. Canciones separadas por comas o punto y coma
      let processedQueries = [];
      splitByConjunctions.forEach(part => {
        // MEJORADO: Divide por comas o punto y coma, pero no dentro de frases como "Guns N' Roses"
        const comaSplit = part.split(/[,;]\s*(?![^()]*\))/);
        processedQueries = [...processedQueries, ...comaSplit];
      });
      // Limpiar y agregar cada consulta
      processedQueries.forEach(songQuery => {
        const cleanQuery = songQuery.trim();
        // MEJORADO: Filtrar palabras vacías y conectores que quedaron aislados
        if (cleanQuery && cleanQuery.length > 1 && 
            !['y', 'and', 'también', 'tambien', 'luego', 'después', 'despues', 'mas', 'más'].includes(cleanQuery.toLowerCase())) {
          songQueries.push(cleanQuery);
        }
      });
      // Si solo hay una canción, usar acción normal de queue
      if (songQueries.length === 1) {
        action = 'queue';
        parameters = { query: songQueries[0] };
        responseMessage = `Añadiendo "${songQueries[0]}" a la cola de reproducción`;
      }
      // Si hay múltiples canciones, usar queue_multiple
      else if (songQueries.length > 1) {
        console.log(` MULTI-COLA: Detectadas ${songQueries.length} solicitudes de canciones`);
        songQueries.forEach((song, index) => {
          console.log(`   • [${index + 1}] ${song}`);
        });
        // MEJORADO: Usar acción queue con múltiples consultas en lugar de multi_queue
        action = 'queue';
        parameters = { queries: songQueries };
        
        // Limitar el número de canciones mostradas en la respuesta para mensajes más cortos
        let displaySongs = songQueries;
        if (songQueries.length > 3) {
          displaySongs = songQueries.slice(0, 3);
          responseMessage = `Añadiendo ${songQueries.length} canciones a la cola: ${displaySongs.map(q => `"${q}"`).join(', ')} y ${songQueries.length - 3} más`;
        } else {
          responseMessage = `Añadiendo ${songQueries.length} canciones a la cola: ${displaySongs.map(q => `"${q}"`).join(', ')}`;
        }
      }
      else {
        action = 'info';
        responseMessage = 'No he entendido qué canciones quieres añadir a la cola. Inténtalo con algo como "añade Bohemian Rhapsody y Stairway to Heaven a la cola".';
      }
    } else {
      action = 'info';
      responseMessage = 'No he entendido qué quieres añadir a la cola. Inténtalo con algo como "añade Bohemian Rhapsody a la cola".';
    }
  }
  // IMPORTANTE: Comandos "más como esto" - recomendaciones basadas en lo actual
  // Colocado ANTES de reproducción para evitar que "recomienda" active reproducción
  else if (lowerMessage.includes('más como') || lowerMessage.includes('similar') || 
           lowerMessage.includes('parecido') || lowerMessage.includes('recomienda') ||
           lowerMessage.includes('recomendación') || lowerMessage.includes('recomendaciones') ||
           (lowerMessage.includes('más') && lowerMessage.includes('como') && lowerMessage.includes('esto'))) {
    action = 'recommendations';
    responseMessage = 'Buscando música similar a la que estás escuchando';
    
    // Si hay contexto específico en el mensaje, extráelo
    let source = 'current'; // Por defecto, recomendar basado en la canción actual
    
    // Verificar si hay una canción específica mencionada
    const songPatterns = [
      /(?:como|similar a|parecido a)\s+(.+?)(?:\s+de|\s+por|$)/i,
      /recomienda\s+(?:canciones|música)\s+(?:como|similar a|parecido a)\s+(.+?)(?:\s+de|\s+por|$)/i,
      /recomienda\s+(?:canciones|música)\s+(?:de|del estilo de|del género de)\s+(.+?)(?:\s+de|\s+por|$)/i
    ];
    
    let basedOn = null;
    
    // Intentar extraer una canción o artista específico
    for (const pattern of songPatterns) {
      const match = lowerMessage.match(pattern);
      if (match && match[1]) {
        basedOn = match[1].trim();
        break;
      }
    }
    
    // Si se mencionó una canción o artista específico
    if (basedOn) {
      parameters = { basedOn };
      responseMessage = `Buscando música similar a ${basedOn}`;
    }
    // Si mencionó específicamente el artista actual
    else if (lowerMessage.includes('artista')) {
      source = 'artist';
      parameters = { source };
      responseMessage = 'Buscando más música de este artista y similares';
    } 
    // Si mencionó específicamente el género actual
    else if (lowerMessage.includes('género') || lowerMessage.includes('genero') || lowerMessage.includes('estilo')) {
      source = 'genre';
      parameters = { source };
      responseMessage = 'Buscando más música de este género';
    }
    // Caso por defecto: basado en la canción actual
    else {
      parameters = { source };
    }
  }
  // Reproducir música (DESPUÉS de procesar recomendaciones)
  else if (lowerMessage.includes('reproduc') || lowerMessage.includes('play') || 
      (lowerMessage.includes('pon') && !isQueueRequest)) {
    action = 'play';
    // Si no es un comando complejo, extraer la consulta
    if (!lowerMessage.includes('volum') && !lowerMessage.includes('anterior') && 
        !lowerMessage.includes('siguiente') && !lowerMessage.includes('next') && 
        !lowerMessage.includes('prev')) {
      // Eliminar palabras clave de reproducción para quedarnos con la consulta
      let query = lowerMessage;
      const playTerms = ['reproducir', 'reproduce', 'play', 'pon', 'poner', 'escuchar', 'escucha'];
      for (const term of playTerms) {
        if (lowerMessage.includes(term)) {
          const parts = lowerMessage.split(term);
          if (parts.length > 1 && parts[1].trim()) {
            query = parts[1].trim();
            break;
          }
        }
      }
      parameters = { query };
      responseMessage = `Reproduciendo "${query}"`;
    }
  }
  // Pausar reproducción - evitar confusión con títulos de canciones
  else if ((lowerMessage.includes('pausa') && !isQueueRequest) || 
           (lowerMessage.includes('pause') && !isQueueRequest) || 
           (lowerMessage.includes('stop') && !isQueueRequest && lowerMessage.length < 15) || // Solo si es un comando corto
           (lowerMessage.includes('para') && !isQueueRequest && lowerMessage.length < 15)) {
    action = 'pause';
    responseMessage = 'Pausando la reproducción';
    console.log('🔕 COMANDO: Interpretando como pausa');
  }
  // Reanudar
  else if (lowerMessage.includes('contin') || lowerMessage.includes('resume') || lowerMessage.includes('reanudar')) {
    action = 'resume';
    responseMessage = 'Reanudando la reproducción';
  }
  // Siguiente canción
  else if (lowerMessage.includes('siguiente') || lowerMessage.includes('next') || lowerMessage.includes('salta')) {
    action = 'next';
    responseMessage = 'Pasando a la siguiente canción';
  }
  // Canción anterior
  else if (lowerMessage.includes('anterior') || lowerMessage.includes('prev') || lowerMessage.includes('previa')) {
    action = 'previous';
    responseMessage = 'Volviendo a la canción anterior';
  }
  // Ajustar volumen
  else if (lowerMessage.includes('volum') || lowerMessage.includes('subir') || lowerMessage.includes('bajar') || lowerMessage.includes('nivel de sonido')) {
    action = 'volume';
    let level = null;
    
    // Detectar nivel de volumen numérico
    const numberMatches = lowerMessage.match(/\b([0-9]{1,3})\b/);
    if (numberMatches && numberMatches[1]) {
      level = parseInt(numberMatches[1], 10);
      // Validar que esté en rango 0-100
      if (level < 0) level = 0;
      if (level > 100) level = 100;
    } 
    // Detectar incrementos o decrementos relativos
    else {
      // Por defecto, ajustar en incrementos de 10%
      const defaultStep = 10;
      
      // Subir volumen
      if ((lowerMessage.includes('subir') || lowerMessage.includes('aumenta') || lowerMessage.includes('más alto')) && 
          lowerMessage.includes('volum')) {
        level = '+' + defaultStep;
      }
      // Bajar volumen
      else if ((lowerMessage.includes('bajar') || lowerMessage.includes('disminu') || lowerMessage.includes('reduc') || 
                lowerMessage.includes('más bajo') || lowerMessage.includes('menos')) && 
               lowerMessage.includes('volum')) {
        level = '-' + defaultStep;
      }
      // Detectar intensidad
      else if (lowerMessage.includes('mucho') || lowerMessage.includes('bastante')) {
        if (lowerMessage.includes('subir') || lowerMessage.includes('aumenta')) {
          level = '+20';
        } else if (lowerMessage.includes('bajar') || lowerMessage.includes('disminu') || lowerMessage.includes('reduc')) {
          level = '-20';
        }
      }
      else if (lowerMessage.includes('poco') || lowerMessage.includes('algo')) {
        if (lowerMessage.includes('subir') || lowerMessage.includes('aumenta')) {
          level = '+5';
        } else if (lowerMessage.includes('bajar') || lowerMessage.includes('disminu') || lowerMessage.includes('reduc')) {
          level = '-5';
        }
      }
    }
    
    // Si se detectó un nivel, configurar parámetros
    if (level !== null) {
      parameters = { level };
      if (typeof level === 'number') {
        responseMessage = `Ajustando volumen al ${level}%`;
      } else if (level.startsWith('+')) {
        responseMessage = `Subiendo volumen ${level.slice(1)}%`;
      } else if (level.startsWith('-')) {
        responseMessage = `Bajando volumen ${level.slice(1)}%`;
      }
    } else {
      responseMessage = 'No he entendido el nivel de volumen. Intenta con "volumen 50%" o "subir volumen".';
    }
  }
  // Buscar
  else if (lowerMessage.includes('busca') || lowerMessage.includes('search') || lowerMessage.includes('encuentra')) {
    action = 'search';
    
    // Extraer la consulta
    let query = lowerMessage;
    const searchTerms = ['busca', 'buscar', 'search', 'encuentra', 'encontrar'];
    for (const term of searchTerms) {
      if (lowerMessage.includes(term)) {
        const parts = lowerMessage.split(term);
        if (parts.length > 1 && parts[1].trim()) {
          query = parts[1].trim();
          break;
        }
      }
    }
    
    parameters = { query };
    responseMessage = `Buscando "${query}"`;
  }
  // Limpiar la cola de reproducción
  else if ((lowerMessage.includes('limpia') || lowerMessage.includes('vacía') || lowerMessage.includes('elimina') || lowerMessage.includes('borra')) && 
           (lowerMessage.includes('cola') || lowerMessage.includes('queue'))) {
    action = 'clear_queue';
    responseMessage = 'Limpiando la cola de reproducción';
  }
  // Preguntas sobre la canción actual
  else if (lowerMessage.includes('canción actual') || lowerMessage.includes('cancion actual') ||
           lowerMessage.match(/qué canción/) || lowerMessage.match(/que canción/) ||
           lowerMessage.match(/que cancion/) || lowerMessage.match(/qué cancion/) ||
           lowerMessage.includes('qué tema') || lowerMessage.includes('que tema') ||
           lowerMessage.includes('detalles de la canción actual') ||
           lowerMessage.includes('muestra detalles') ||
           lowerMessage.includes('qué canción es esta') || lowerMessage.includes('que canción es esta') ||
           lowerMessage.includes('que cancion es esta') || lowerMessage.includes('qué cancion es esta')) {
    action = 'get_info';
    parameters = { infoType: 'track', subject: 'current' };
    responseMessage = 'Mostrando detalles de la canción actual';
  }
  // Los comandos de recomendaciones se procesan más arriba en el código
  // para evitar conflictos con el detector de comandos de reproducción
  // Información sobre artistas, canciones, álbumes
  else if (lowerMessage.includes('quién es') || lowerMessage.includes('quien es') || 
           lowerMessage.includes('información sobre') || lowerMessage.includes('háblame de') ||
           lowerMessage.includes('cuéntame sobre') || lowerMessage.includes('datos de') ||
           lowerMessage.includes('info de')) {
    action = 'get_info';
    let infoType = 'artist'; // Por defecto buscar info de artista
    
    if (lowerMessage.includes('canción') || lowerMessage.includes('tema') || 
        lowerMessage.includes('pista') || lowerMessage.includes('track')) {
      infoType = 'track';
    }
    else if (lowerMessage.includes('álbum') || lowerMessage.includes('album') || 
             lowerMessage.includes('disco')) {
      infoType = 'album';
    }
    
    // Intentar extraer el sujeto específico de la consulta
    let subject = '';
    const infoPatterns = [
      /información sobre\s+(.+?)(\s+de\s+|\s*$)/i,
      /(?:háblame|cuéntame)\s+(?:de|sobre)\s+(.+?)(?:\s+de\s+|\s*$)/i,
      /(?:quién|quien) es\s+(.+?)(?:\s+de\s+|\s*$)/i,
      /datos de\s+(.+?)(?:\s+de\s+|\s*$)/i,
      /info de\s+(.+?)(?:\s+de\s+|\s*$)/i
    ];
    
    // Intentar encontrar coincidencia con patrones
    for (const pattern of infoPatterns) {
      const match = lowerMessage.match(pattern);
      if (match && match[1]) {
        subject = match[1].trim();
        break;
      }
    }
    
    // Si no hemos encontrado un sujeto específico, usar "actual" para referirse
    // al artista/canción/álbum que está sonando actualmente
    if (!subject) {
      subject = 'current';
      responseMessage = `Buscando información sobre ${infoType === 'artist' ? 'el artista' : 
                                                     infoType === 'track' ? 'la canción' : 
                                                     'el álbum'} actual`;
    } else {
      responseMessage = `Buscando información sobre ${subject}`;
    }
    
    parameters = { infoType, subject };
  }
  
  // Registrar la interacción (asincrónicamente)
  userFeedback.logInteraction({
    userId,
    userMessage: message,
    detectedAction: action,
    parameters,
    successful: true
  }).catch(err => console.error('Error al registrar interacción:', err));
  
  // Log detallado del resultado del procesamiento simple
  console.log('🔍 RESULTADO PROCESAMIENTO SIMPLE:');
  console.log('==================== INICIO RESULTADO SIMPLE ====================');
  console.log({
    action,
    parameters: JSON.stringify(parameters, null, 2),
    message: responseMessage
  });
  console.log('==================== FIN RESULTADO SIMPLE ====================');
  
  return { action, parameters, message: responseMessage };
}

/**
 * Registra el feedback del usuario sobre una acción
 * @param {string} userId - ID del usuario
 * @param {string} originalMessage - Mensaje original
 * @param {string} originalAction - Acción detectada originalmente
 * @param {string} correctedAction - Acción correcta según el usuario
 * @param {Object} correctedParameters - Parámetros correctos
 * @returns {boolean} - Si se registró correctamente
 */
async function registerUserCorrection(userId, originalMessage, originalAction, correctedAction, correctedParameters = {}) {
  try {
    await userFeedback.logCorrection({
      userId,
      originalMessage,
      originalAction,
      correctedAction,
      correctedParameters
    });
    
    console.log(`✅ Corrección registrada: "${originalAction}" → "${correctedAction}"`);
    return true;
  } catch (error) {
    console.error('Error al registrar corrección:', error);
    return false;
  }
}

module.exports = {
  processMessage,
  registerUserCorrection
};
