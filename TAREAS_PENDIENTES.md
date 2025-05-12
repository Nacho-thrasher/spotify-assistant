# Tareas Pendientes - Spotify Assistant

## ✅ Mejoras Recientes Implementadas (Mayo 2025)
- [x] **Recomendaciones IA:** Implementar recomendaciones de canciones generadas por IA
- [x] **Añadir a cola:** Agregar funcionalidad para añadir canciones recomendadas a la cola
- [x] **UI mejorada:** Mostrar badge e indicador visual para recomendaciones generadas por IA
- [x] **UX mejorada:** Feedback visual y notificaciones toast al añadir canciones a la cola
- [x] **Actualización automática:** Actualizar la cola automáticamente al añadir canciones
- [x] **Gestión del chat:** Implementar función para borrar el historial de chat

## Mejoras de Redis (En progreso)
- [x] Implementar servicio básico de caché con Redis
- [x] Crear endpoints de prueba para la caché
- [x] Implementar caché para cola de reproducción
- [ ] Migrar completamente el almacenamiento de sesiones a Redis
- [ ] Implementar invalidación automática de caché en todos los endpoints relevantes
- [ ] Implementar interfaz de administración para visualizar estadísticas de Redis
- [ ] Configurar escalamiento horizontal con múltiples workers para procesamiento paralelo
- [ ] Implementar compresión de datos para reducir el tamaño de los datos en Redis
- [ ] Desarrollar sistema de expiración inteligente (TTL basado en patrones de uso)

## Nuevos Endpoints y Funcionalidades
- [x] Implementar endpoint de recomendaciones IA basadas en contexto de conversación
- [ ] Crear endpoint para recomendar playlists completas basadas en un tema
- [ ] Implementar endpoint para describir y analizar canciones en detalle
- [ ] Crear endpoint para información detallada de artistas/álbumes
- [ ] Añadir endpoint para letras de canciones con análisis de significado
- [ ] Implementar endpoint de estadísticas personalizadas de escucha

## Sistema de Historial y Persistencia
- [x] Crear endpoint básico de historial
- [x] Implementar guardado del historial de conversación con el asistente
- [ ] Implementar análisis de patrones de escucha
- [ ] Crear recomendaciones basadas en historial
- [ ] Implementar sistema de calificación de canciones
- [ ] Sistema de feedback para mejorar las recomendaciones de IA

## Modo DJ y Funcionalidades Avanzadas
- [ ] Crear sistema para generación automática de playlists basadas en estado de ánimo
- [ ] Implementar transiciones suaves entre canciones
- [ ] Añadir comandos de voz para control sin manos
- [ ] Desarrollar modo fiesta con funcionalidades especiales

## Mejoras de UX/UI
- [x] Implementar feedback visual al añadir canciones a la cola
- [x] Agregar indicadores visibles para recomendaciones generadas por IA
- [ ] Optimizar interfaz para mostrar información en tiempo real
- [ ] Mejorar visualización de cola y recomendaciones
- [ ] Implementar tema oscuro/claro configurable por el usuario
- [ ] Añadir animaciones y transiciones suaves para mejorar la experiencia
- [ ] Implementar indicadores de carga para todas las operaciones asincrónicas
- [ ] Diseñar una vista de detalle para las recomendaciones de IA

## Integración con Base de Datos (MongoDB)
- [ ] Diseñar esquema de base de datos para usuarios y preferencias
- [ ] Implementar sistema de perfiles de usuario con preferencias musicales
- [ ] Migrar historial a MongoDB para búsquedas avanzadas y análisis
- [ ] Crear sistema de respaldo y sincronización
- [ ] Implementar sistema de etiquetado personalizado para canciones

## Despliegue y Escalabilidad
- [ ] Configurar sistema para múltiples usuarios simultáneos
- [ ] Implementar límites de uso para prevenir abuso de API
- [ ] Optimizar rendimiento para grandes volúmenes de datos
- [ ] Configurar monitoreo y alertas para errores y rendimiento
- [ ] Implementar un pipeline CI/CD completo para despliegues automáticos

## Ideas para próximas mejoras (Mayo-Junio 2025)

### 1. Mejoras de Experiencia de Usuario
- [ ] **Recomendaciones por ánimo:** Detectar el estado de ánimo basado en el contexto de la conversación
- [ ] **Previsualización de audio:** Implementar reproducción de fragmentos cortos al hacer hover sobre recomendaciones
- [ ] **Vista de detalles expandible:** Permitir expandir las tarjetas de recomendaciones para mostrar más información
- [ ] **Interacción con arrastrar y soltar:** Permitir reordenar la cola mediante drag & drop

### 2. Inteligencia Artificial Avanzada
- [ ] **Conversación con memoria:** Implementar memoria persistente sobre los gustos musicales del usuario
- [ ] **Explicabilidad:** Proporcionar explicaciones de por qué se recomienda una canción determinada
- [ ] **Seguimiento del contexto:** Mejorar la capacidad de mantener el contexto de conversaciones largas
- [ ] **Descubrimiento inteligente:** Sugerir artistas y géneros nuevos pero relacionados a los gustos del usuario

### 3. Integraciones adicionales
- [ ] **Letras en tiempo real:** Mostrar las letras sincronizadas con la reproducción
- [ ] **Análisis de letras:** Analizar sentimiento y temas de las letras para mejorar recomendaciones
- [ ] **Compartir en redes:** Añadir botones para compartir en redes sociales
- [ ] **Cusión de playlists:** Permitir fusionar playlists existentes usando IA
