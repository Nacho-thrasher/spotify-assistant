# Spotify Assistant

Asistente conversacional para Spotify que permite interactuar con la música mediante comandos en lenguaje natural.

## Estructura del Proyecto

- `backend/`: API Node.js con Express y Socket.io
- `frontend/`: Cliente React
- `docker-compose.yml`: Configuración para desplegar todos los servicios

## Requisitos

- Node.js 18+
- Redis (incluido en docker-compose)
- Cuenta de desarrollador en Spotify
- Clave API de OpenAI

## Configuración

1. Copia el archivo `.env.example` a `.env` en la raíz del proyecto y en el directorio `backend/`
2. Configura las siguientes variables de entorno:
   - `SPOTIFY_CLIENT_ID`: ID de cliente de Spotify
   - `SPOTIFY_CLIENT_SECRET`: Secreto de cliente de Spotify
   - `SPOTIFY_REDIRECT_URI`: URI de redirección (ej: http://localhost:3000/callback)
   - `OPENAI_API_KEY`: Tu clave API de OpenAI

## Ejecución en desarrollo

### Backend:
```bash
cd backend
npm install
npm run dev
```

### Frontend:
```bash
cd frontend
npm install
npm start
```

## Ejecución con Docker Compose

Para levantar todos los servicios:

```bash
docker-compose up -d
```

Esto iniciará:
- Backend en http://localhost:8080
- Redis en puerto 6379
- El frontend debe ejecutarse manualmente en desarrollo

## Notas importantes

- Asegúrate de que Redis esté ejecutándose para las funciones de caché y sesiones
- Configura correctamente los permisos en tu aplicación de Spotify Developer
