# Implementación de Redis en el Asistente de Spotify

Este documento describe la integración de Redis en el Asistente de Spotify, detallando las mejoras implementadas y cómo aprovechar estas funcionalidades.

## Índice

1. [Visión general](#visión-general)
2. [Configuración inicial](#configuración-inicial)
3. [Servicios implementados](#servicios-implementados)
   - [Caché de API de Spotify](#caché-de-api-de-spotify)
   - [Historial de usuario](#historial-de-usuario)
   - [Cola de tareas asíncronas](#cola-de-tareas-asíncronas)
4. [Iniciar los servicios](#iniciar-los-servicios)
5. [Casos de uso](#casos-de-uso)
6. [Monitoreo y mantenimiento](#monitoreo-y-mantenimiento)

## Visión general

Redis se ha implementado como una capa intermedia para mejorar el rendimiento, la funcionalidad y la experiencia de usuario del Asistente de Spotify. Las principales mejoras incluyen:

- **Caché de datos**: Reducción drástica de llamadas a la API de Spotify
- **Historial de usuario**: Seguimiento de preferencias y comportamiento para personalización
- **Procesamiento asíncrono**: Manejo de tareas intensivas en segundo plano

## Configuración inicial

### Requisitos previos

1. Redis Server (v6.0 o superior)
2. Node.js (v14 o superior)

### Instalación de Redis

#### En Windows (usando Docker)

```bash
docker run --name redis-spotify -p 6379:6379 -d redis
```

#### En macOS (usando Homebrew)

```bash
brew install redis
brew services start redis
```

#### En Linux

```bash
sudo apt-get install redis-server
sudo systemctl start redis-server
```

### Variables de entorno

Asegúrate de tener las siguientes variables configuradas en tu archivo `.env`:

```
# Configuración de Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Tiempos de caché (en segundos)
CACHE_TTL_SHORT=300       # 5 minutos
CACHE_TTL_MEDIUM=1800     # 30 minutos 
CACHE_TTL_LONG=86400      # 24 horas
```

## Servicios implementados

### Caché de API de Spotify

Ubicación: `src/services/cache/spotifyCache.js`

Este servicio almacena temporalmente respuestas de la API de Spotify para:

- Reducir latencia en peticiones repetidas
- Evitar límites de tasa de la API de Spotify
- Mejorar tiempos de respuesta generales

#### Tiempos de caché por tipo de dato

| Tipo de dato | Duración predeterminada | Configuración |
|--------------|-------------------------|---------------|
| Estado de reproducción | 60 segundos | `CACHE_TTL_SHORT` |
| Cola de reproducción | 60 segundos | `CACHE_TTL_SHORT` |
| Resultados de búsqueda | 30 minutos | `CACHE_TTL_MEDIUM` |
| Info de artistas/pistas | 30 minutos | `CACHE_TTL_MEDIUM` |
| Playlists | 1 hora | `CACHE_TTL_LONG` |

#### Uso básico

```javascript
const { getCachedData, invalidateCache } = require('../services/cache/spotifyCache');

// Obtener datos (de caché o frescos)
const searchResults = await getCachedData(
  'search_results', 
  userId,
  () => spotifyApi.search(query), // Función que se ejecuta si no hay caché
  { query },
  1800 // TTL personalizado en segundos (opcional)
);

// Invalidar caché cuando los datos cambian
await invalidateCache('playback_state', userId);
```

### Historial de usuario

Ubicación: `src/services/history/userHistory.js`

Este servicio registra y recupera el historial de interacciones del usuario para:

- Personalizar recomendaciones
- Contextualizar comandos
- Mejorar la comprensión de preferencias

#### Tipos de eventos

- `COMMAND`: Comandos enviados al asistente
- `PLAYBACK`: Acciones de reproducción (play, pause, skip)
- `SEARCH`: Búsquedas realizadas
- `RECOMMENDATION`: Recomendaciones enviadas
- `FAVORITE`: Canciones marcadas como favoritas
- `FEEDBACK`: Feedback sobre recomendaciones

#### Uso básico

```javascript
const userHistory = require('../services/history/userHistory');

// Registrar un evento en el historial
await userHistory.addToHistory(
  userId,
  userHistory.EVENT_TYPES.COMMAND,
  {
    command: 'play',
    parameters: { query: 'Despacito' },
    userMessage: 'Pon Despacito'
  }
);

// Obtener comandos más usados
const topCommands = await userHistory.getMostUsedCommands(userId, 5);

// Obtener artistas más escuchados
const topArtists = await userHistory.getMostPlayedArtists(userId, 5);

// Obtener historial general
const history = await userHistory.getUserHistory(userId, 20);
```

### Cola de tareas asíncronas

Ubicación: `src/services/queue/taskQueue.js`

Este servicio maneja tareas intensivas en segundo plano para:

- Evitar bloquear la interfaz de usuario
- Procesar operaciones complejas sin afectar la latencia
- Mantener la escalabilidad del sistema

#### Tipos de tareas

- `RECOMMENDATION_ANALYSIS`: Análisis avanzado de recomendaciones
- `LYRICS_PROCESSING`: Procesamiento de letras de canciones
- `PLAYLIST_GENERATION`: Generación de playlists
- `SONG_ANALYSIS`: Análisis detallado de características de canciones
- `ARTIST_RESEARCH`: Investigación sobre artistas

#### Uso básico

```javascript
const { enqueueTask, getTaskResult, TASK_TYPES } = require('../services/queue/taskQueue');

// Encolar una tarea de análisis
const taskId = await enqueueTask(
  TASK_TYPES.SONG_ANALYSIS,
  { trackId: '1234567890' },
  userId
);

// Más tarde, verificar resultado
const result = await getTaskResult(taskId);
```

## Iniciar los servicios

Para iniciar el servidor principal con Redis:

```bash
npm run start
```

Para iniciar el worker de procesamiento en segundo plano:

```bash
npm run worker
```

Para desarrollo (con recarga automática):

```bash
npm run dev       # Servidor principal
npm run worker:dev  # Worker de procesamiento
```

Para verificar la conexión a Redis:

```bash
npm run redis:check
```

## Casos de uso

### 1. Recomendaciones personalizadas

El sistema ahora puede generar recomendaciones mucho más personalizadas:

- Analiza el historial de reproducción del usuario
- Identifica patrones en las preferencias
- Procesa análisis de audio en segundo plano
- Combina estos datos para recomendaciones de mayor calidad

### 2. Procesamiento de letras

Para letras de canciones largas o análisis complejos:

- El proceso se maneja en segundo plano
- El usuario recibe una respuesta inmediata
- Los resultados completos se entregan cuando están disponibles

### 3. Generación de playlists personalizadas

Para generación de playlists basadas en múltiples factores:

- El proceso intensivo ocurre en el worker
- Las playlists se crean sin bloquear la interfaz
- El usuario recibe notificaciones cuando la playlist está lista

## Monitoreo y mantenimiento

### Verificación de estado

Para verificar el estado de Redis:

```bash
npm run redis:check
```

### Limpiar caché

Para limpiar toda la caché en Redis (solo en caso necesario):

```javascript
const { redisClient } = require('./src/config/redis');
await redisClient.flushall();
```

### Monitoreo de tareas

Para monitorear las tareas en cola:

```javascript
const { getQueueStats } = require('./src/services/queue/taskQueue');
const stats = await getQueueStats();
console.log(stats);
```

---

## Próximos pasos

1. **Implementar interfaz de administración**: Panel para visualizar estadísticas de Redis
2. **Escalamiento horizontal**: Múltiples workers para procesamiento paralelo
3. **Compresión de datos**: Reducir el tamaño de los datos almacenados en Redis
4. **Expiración inteligente**: Ajustar TTL basado en patrones de uso
