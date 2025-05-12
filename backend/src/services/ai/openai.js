/**
 * Servicio de integración con OpenAI para procesar mensajes del usuario
 */
const OpenAI = require('openai');
const userFeedback = require('./userFeedback');

// Inicializar cliente de OpenAI si hay una clave API disponible
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

/**
 * Sistema de instrucciones base para el modelo - mejorado con contexto
 */
const getSystemPrompt = (context) => {
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
Eres un asistente musical de Spotify útil y amigable.
Tu objetivo es ayudar al usuario a controlar Spotify mediante comandos en lenguaje natural.

CAPACIDADES:
- Reproducir música (artistas, canciones, géneros, playlists)
- Pausar/reanudar reproducción
- Saltar a canción anterior/siguiente
- Ajustar volumen
- Buscar música
- Crear y modificar playlists
- Proporcionar información sobre artistas, canciones, etc.
- Añadir canciones a la cola (individual o múltiples)
- Limpiar la cola de reproducción

CONTEXTO ACTUAL:${contextMessage}

RECOMENDACIONES INTELIGENTES:
- Si el usuario pide "más como esto", sugerir música similar a la canción actual o artistas relacionados.
- Si hay una canción en reproducción, puedes referirte a ella para dar contexto a tus respuestas.
- Adapta tus respuestas al género actual si es relevante.
- Ofrece sugerencias basadas en la cola actual cuando tenga sentido.

INSTRUCCIONES:
1. Responde de forma concisa y conversacional.
2. Identifica la intención del usuario y los parámetros necesarios.
3. Proporciona respuestas amigables y centradas en música.
4. Usa el contexto de reproducción para dar respuestas más personalizadas.
5. Si no puedes realizar una acción, explica amablemente por qué.

FORMATO DE RESPUESTA:
Debes devolver un objeto JSON con los siguientes campos:
- action: la acción a realizar (play, pause, next, previous, volume, search, etc.)
- parameters: objeto con parámetros relevantes para la acción
- message: mensaje conversacional para responder al usuario

Ejemplos de acciones:
- "play": reproducir música (requiere query o trackId)
- "pause": pausar reproducción
- "resume": reanudar reproducción
- "next": siguiente canción
- "previous": canción anterior
- "volume": ajustar volumen (requiere level: 0-100)
- "search": buscar música (requiere query)
- "queue": añadir canción a la cola (requiere query)
- "multi_queue": añadir múltiples canciones a la cola (requiere queries: ["canción 1", "canción 2"])
- "clear_queue": limpiar la cola de reproducción
- "info": proporcionar información (usa esta acción cuando solo quieras responder sin realizar una acción en Spotify)

Ejemplos de parámetros:
- query: "rock de los 80s", "canciones de Coldplay"
- queries: ["Bohemian Rhapsody", "Stairway to Heaven", "Sweet Child O'Mine"]
- trackId: "spotify:track:123456"
- playlistId: "spotify:playlist:123456"
- level: 60 (para volumen)
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
function saveToHistory(command) {
  // Añadir al inicio para tener los más recientes primero
  commandHistory.unshift(command);
  // Mantener solo los últimos N comandos
  if (commandHistory.length > MAX_HISTORY) {
    commandHistory.pop();
  }
}

/**
 * Función para procesar un mensaje del usuario utilizando OpenAI
 * @param {string} message - Mensaje del usuario
 * @param {Object} playbackContext - Contexto actual de reproducción (opcional)
 * @param {string} userId - ID del usuario (opcional)
 * @returns {Object} - Acción a realizar y mensaje de respuesta
 */
async function processMessage(message, playbackContext = null, userId = 'anonymous') {
  // Guardar el comando en el histórico
  saveToHistory(message);
  
  try {
    // Si OpenAI está disponible, usar el modelo
    if (openai) {
      // Preparar el contexto completo para el prompt
      let context = {
        currentTrack: null,
        queue: [],
        history: commandHistory.slice(1) // Excluir el comando actual
      };
      
      // Manejar posibles errores al obtener el contexto de reproducción
      if (playbackContext) {
        try {
          context.currentTrack = playbackContext.currentlyPlaying || null;
          context.queue = playbackContext.nextInQueue || [];
        } catch (error) {
          console.warn('⚠️ Error al procesar el contexto de reproducción:', error.message);
          // Continuar con el contexto vacío
        }
      }
      
      try {
        console.log('🤖 Procesando mensaje con OpenAI usando contexto enriquecido');
        
        // Generar el prompt con el contexto actual
        const systemPrompt = getSystemPrompt(context);
        
        // Enviar mensaje a OpenAI
        const completion = await openai.chat.completions.create({
          model: "gpt-4o", // o "gpt-3.5-turbo" para un modelo más ligero y económico
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          response_format: { type: "json_object" }
        });

        // Extraer y procesar la respuesta
        const responseContent = completion.choices[0].message.content;
        console.log('✨ RESPUESTA DE OPENAI:', responseContent);
        
        try {
          // Intentar parsear la respuesta como JSON
          const parsedResponse = JSON.parse(responseContent);
          
          // Registrar la interacción para aprendizaje (asíncrono, no bloqueante)
          userFeedback.logInteraction({
            userId,
            userMessage: message,
            detectedAction: parsedResponse.action,
            parameters: parsedResponse.parameters || {},
            successful: true // Asumimos éxito inicial
          }).catch(err => console.error('Error al registrar interacción:', err));
          
          return parsedResponse;
        } catch (error) {
          console.error('Error al parsear la respuesta JSON:', error);
          throw new Error('No se pudo interpretar la respuesta de OpenAI como JSON válido');
        }
      } catch (error) {
        console.error('Error procesando mensaje con OpenAI:', error);
        // Fallback a procesamiento simple
        console.log('♻️ Fallback: Usando procesamiento simple por error');
        const result = await processMessageSimple(message, userId);
        return result;
      }
    } else {
      // Fallback a procesamiento simple
      console.log('⚠️ OpenAI no disponible, usando procesamiento simple');
      const result = await processMessageSimple(message, userId);
      return result;
    }
  } catch (error) {
    console.error('Error procesando mensaje:', error);
    throw new Error('Error al procesar el mensaje');
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
      const splitByConjunctions = query.split(/\s*y\s+|\s+and\s+|\s+tambi[eé]n\s+|\s+junto\s+con\s+|\s+adem[aá]s\s+de\s+|\s*&\s*|\s+m[aá]s\s+|\s*\+\s*|\s+luego\s+|\s+despu[eé]s\s+|\s+seguido\s+de\s+/i);
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
  // Reproducir música
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
  // Comandos "más como esto" - recomendaciones basadas en lo actual
  else if (lowerMessage.includes('más como') || lowerMessage.includes('similar') || 
           lowerMessage.includes('parecido') || lowerMessage.includes('recomienda') ||
           (lowerMessage.includes('más') && lowerMessage.includes('como') && lowerMessage.includes('esto'))) {
    action = 'recommendations';
    responseMessage = 'Buscando música similar a la que estás escuchando';
    
    // Si hay contexto específico en el mensaje, extráelo
    let source = 'current'; // Por defecto, recomendar basado en la canción actual
    
    if (lowerMessage.includes('artista')) {
      source = 'artist';
      responseMessage = 'Buscando más música de este artista y similares';
    } 
    else if (lowerMessage.includes('género') || lowerMessage.includes('genero') || lowerMessage.includes('estilo')) {
      source = 'genre';
      responseMessage = 'Buscando más música de este género';
    }
    
    parameters = { source };
  }
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
  
  // Registrar la interacción para aprendizaje (asíncrono, no bloqueante)
  userFeedback.logInteraction({
    userId,
    userMessage: message,
    detectedAction: action,
    parameters,
    successful: true // Asumimos éxito inicial
  }).catch(err => console.error('Error al registrar interacción:', err));
  
  return {
    action,
    parameters,
    message: responseMessage
  };
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
