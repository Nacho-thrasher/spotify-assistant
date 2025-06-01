# Estructura del Proyecto Spotify Assistant

## Visión General

Spotify Assistant es una aplicación full-stack que permite a los usuarios interactuar con Spotify mediante lenguaje natural. El proyecto está dividido en dos componentes principales:

1. **Backend**: API de Node.js con Express, Socket.io y Redis
2. **Frontend**: Aplicación cliente desarrollada en React

## Estructura de Directorios

```
spotify-assistant/
├── backend/                  # Servidor API y lógica de negocio
│   ├── logs/                 # Registros de la aplicación
│   ├── src/                  # Código fuente del backend
│   │   ├── api/              # Controladores de API y rutas
│   │   ├── config/           # Configuraciones de la aplicación
│   │   ├── middleware/       # Middleware personalizado
│   │   ├── public/           # Archivos estáticos
│   │   ├── scripts/          # Scripts de utilidad
│   │   ├── services/         # Servicios y lógica de negocio
│   │   │   ├── ai/           # Integración con modelos de IA
│   │   │   ├── cache/        # Servicios de caché
│   │   │   ├── history/      # Manejo del historial de usuario
│   │   │   ├── queue/        # Sistema de colas
│   │   │   ├── socket/       # Gestión de conexiones Socket.io
│   │   │   └── spotify/      # Integración con la API de Spotify
│   │   ├── workers/          # Trabajadores en segundo plano
│   │   ├── app.js            # Configuración de la aplicación Express
│   │   └── server.js         # Punto de entrada del servidor
│   ├── .env                  # Variables de entorno (desarrollo)
│   └── package.json          # Dependencias del backend
│
├── spotify-assistant-front/  # Cliente React
│   ├── public/               # Archivos estáticos del frontend
│   ├── src/                  # Código fuente del frontend
│   │   ├── components/       # Componentes de React
│   │   │   ├── layouts/      # Componentes de diseño
│   │   │   └── ui/           # Componentes de interfaz de usuario
│   │   ├── contexts/         # Contextos de React
│   │   ├── docs/             # Documentación interna
│   │   ├── hooks/            # Hooks personalizados
│   │   ├── routes/           # Configuración de rutas
│   │   ├── services/         # Servicios del cliente
│   │   ├── styles/           # Estilos y temas
│   │   └── utils/            # Utilidades y funciones auxiliares
│   └── package.json          # Dependencias del frontend
│
├── docs/                     # Documentación del proyecto
│   ├── GROQ_INTEGRATION.md   # Documentación de integración con Groq
│   └── GROQ_MODELS_AND_LIMITS.md # Información sobre modelos y límites
│
├── docker-compose.yml        # Configuración de Docker para desarrollo
└── README.md                 # Documentación general del proyecto
```

## Componentes Principales

### Backend

#### API (`/backend/src/api/`)

Contiene los controladores y rutas para todos los endpoints:

- `auth.js`: Gestión de autenticación con Spotify OAuth
- `assistant.js`: Endpoints para interactuar con el asistente
- `ai_recommendations.js`: Generación de recomendaciones musicales con IA
- `recommendations.js`: Endpoints para recomendaciones de música
- `user.js`: Gestión de perfiles de usuario
- `history.js`: Acceso al historial de interacciones
- `cache.js`: Gestión de la caché
- `diagnostic.js`: Endpoints para diagnóstico y monitoreo

#### Servicios (`/backend/src/services/`)

Contiene la lógica de negocio principal:

- **AI** (`/services/ai/`):
  - `modelProvider.js`: Proveedor para acceder a modelos de IA (Groq/OpenRouter)
  - `modelProvider-groq.js`: Implementación específica para Groq
  - `openai.js`: Lógica de procesamiento y generación de respuestas
  - `userFeedback.js`: Gestión de feedback de usuario para mejorar el modelo

- **Spotify** (`/services/spotify/`):
  - Integración con la API de Spotify para búsqueda, reproducción y control

- **Cache** (`/services/cache/`):
  - Implementación de caché con Redis para mejorar rendimiento

- **Socket** (`/services/socket/`):
  - Gestión de conexiones en tiempo real con Socket.io

### Frontend

#### Componentes (`/spotify-assistant-front/src/components/`)

- **Layouts** (`/components/layouts/`):
  - `AppLayout.js`: Diseño principal de la aplicación
  - `ChatLayout.js`: Interfaz de chat con el asistente
  - `LoginLayout.js`: Pantalla de inicio de sesión

- **UI** (`/components/ui/`):
  - Componentes reutilizables (botones, cards, inputs, etc.)

#### Contextos (`/spotify-assistant-front/src/contexts/`)

- `AuthContext.js`: Estado global de autenticación
- `AssistantContext.js`: Estado global del asistente y conversaciones

## Flujo de Datos

1. El usuario se autentica mediante OAuth con Spotify
2. Las credenciales se almacenan en Redis y se proporciona un token JWT
3. El frontend establece una conexión Socket.io con el backend
4. Las solicitudes del usuario se envían a través de Socket.io
5. El backend procesa la solicitud mediante los servicios apropiados
6. Las respuestas se generan con ayuda de los modelos de IA (Groq/OpenRouter)
7. Los resultados se devuelven al usuario a través de Socket.io

## Integración con IA

El sistema utiliza un enfoque de múltiples proveedores:

1. **Groq** (principal): Proporciona respuestas ultrarrápidas (~50ms) con modelos optimizados
   - `llama3-8b-8192`: Modelo principal para consultas sencillas
   - `llama-3.1-8b-instant`: Alternativa para respuestas rápidas
   - `mixtral-8x7b-32768`: Para consultas que requieren más contexto

2. **OpenRouter** (fallback): Sistema secundario si Groq no está disponible
   - Acceso a diversos modelos como GPT-4o, Claude, Llama, etc.

## Infraestructura y Despliegue

- **Desarrollo**: Docker Compose con servicios de backend y Redis
- **Producción**: 
  - Backend: Railway
  - Frontend: Vercel
  - Redis: Railway
