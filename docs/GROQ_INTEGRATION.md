# Integración de Groq con el Asistente de Spotify

## ¿Por qué Groq?

Groq ofrece varias ventajas significativas sobre otros proveedores de modelos de IA:

1. **Velocidad superior**: Los modelos de Groq son extremadamente rápidos, ofreciendo respuestas con latencias mucho menores que OpenAI o Anthropic.
2. **Límites generosos**: Groq ofrece cuotas de uso más altas en su plan gratuito.
3. **Precios competitivos**: Menor costo por token que muchos competidores.
4. **Modelos de calidad**: Acceso a Llama 3 y Mixtral, que tienen excelente rendimiento.
5. **API compatible con OpenAI**: Facilita la migración desde sistemas basados en OpenAI.

## Instalación

Para añadir soporte para Groq a tu asistente, instala la dependencia oficial:

```bash
npm install groq-sdk
```

## Configuración

1. Obtén una API key de [Groq](https://console.groq.com/).
2. Añade la API key a tu archivo `.env`:

```
GROQ_API_KEY=tu_api_key_aquí
```

## Uso

Hemos creado un nuevo proveedor de modelos `modelProvider-groq.js` que soporta tanto Groq como OpenRouter con fallback automático. Para usarlo:

1. Renombra el archivo existente por seguridad:
```bash
mv backend/src/services/ai/modelProvider.js backend/src/services/ai/modelProvider.js.backup
```

2. Utiliza el nuevo proveedor:
```bash
cp backend/src/services/ai/modelProvider-groq.js backend/src/services/ai/modelProvider.js
```

3. Reinicia el servicio:
```bash
docker compose restart backend
```

## Cómo funciona

El nuevo proveedor de modelos implementa una estrategia de fallback:

1. Primero intenta usar **Groq** por su velocidad superior.
2. Si Groq falla o no está disponible, utiliza **OpenRouter**.
3. En cada proveedor, intenta múltiples modelos en orden de preferencia.

```
Usuario -> Solicitud -> modelProvider -> Groq -> OpenRouter -> Respuesta
```

## Modelos soportados

### Groq
- `llama3-8b-8192`: Más rápido, ideal para tareas simples
- `llama3-70b-8192`: Más poderoso, mejor para tareas complejas
- `mixtral-8x7b-32768`: Excelente para contextos largos

### OpenRouter (fallback)
- `openai/gpt-4o`
- `anthropic/claude-3-opus-20240229`
- `meta-llama/llama-3-70b-instruct`
- `google/gemini-pro`

## Personalizando los modelos

Puedes ajustar los modelos disponibles y su orden de prioridad modificando los arrays `MODELS.GROQ` y `MODELS.OPENROUTER` en `modelProvider.js`.

## Ventajas para el Asistente de Spotify

1. **Respuestas más rápidas**: La baja latencia de Groq mejora significativamente la experiencia del usuario.
2. **Mayor fiabilidad**: El sistema de fallback automático garantiza que el asistente siempre responda.
3. **Optimizado para recomendaciones**: Se ajustan los parámetros de temperatura y tokens según el tipo de solicitud.
4. **Estructura JSON consistente**: Ambos proveedores utilizan el mismo formato, manteniendo la compatibilidad.

## Monitoreo y Depuración

Los logs incluyen información detallada sobre qué proveedor y modelo se está utilizando, facilitando la depuración:

```
✅ Cliente Groq inicializado correctamente
🤖 Intentando con modelo Groq: llama3-8b-8192
✅ Respuesta exitosa de Groq (modelo: llama3-8b-8192)
```

## Solución de problemas

### Si no hay respuesta de ningún proveedor

Verifica las API keys en tu archivo `.env`:
```
GROQ_API_KEY=tu_api_key_groq
OPENROUTER_API_KEY=tu_api_key_openrouter
```

### Si las respuestas no tienen el formato correcto

Revisa la función `validateResponse` que garantiza que todas las respuestas cumplan con el esquema requerido por el asistente.
