const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Importar configuraciones
const configureSession = require('./config/session');
const { ensureUserId } = require('./middleware/userIdentification');

// Importar rutas
const authRoutes = require('./api/auth');
const userRoutes = require('./api/user');
const assistantRoutes = require('./api/assistant');
const historyRoutes = require('./api/history');
const cacheRoutes = require('./api/cache'); // Nuevo router para pruebas de cache
const diagnosticRoutes = require('./api/diagnostic'); // Nuevo router para diagnóstico de API

const app = express();

// Middlewares
app.use(cors({
  origin: function(origin, callback) {
    // Permitir solicitudes sin origin (como curl/Postman) en desarrollo
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Lista de dominios permitidos
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'https://spotify-assistant-react.up.railway.app',
      'https://spotify-assistant-front.vercel.app'
    ];
    
    // Verificar si el origin está permitido
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true)
    } else {
      console.warn(`CORS bloqueó solicitud desde: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // IMPORTANTE: Permitir cookies en solicitudes CORS
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'user-id']
}));
app.use(helmet({
  contentSecurityPolicy: false  // Deshabilitar para desarrollo
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Configurar cookie-parser con una clave secreta para firmar cookies
app.use(cookieParser(process.env.SESSION_SECRET || 'spotify_assistant_secret_key')); 
app.use(morgan('dev')); // Logs coloridos para desarrollo

// Configuración de sesiones con Redis
configureSession(app);

// Middleware para asegurar que cada solicitud tenga un ID de usuario
app.use(ensureUserId);

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Ruta de bienvenida/verificación
app.get('/', (req, res) => {
  res.json({ 
    message: 'API del Asistente de Spotify',
    status: 'online',
    documentation: '/api-docs' // Para futura integración con Swagger
  });
});

// Usar rutas
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/cache', cacheRoutes); // Nuevas rutas para pruebas de Redis
app.use('/api/diagnostic', diagnosticRoutes); // Nuevas rutas para diagnóstico de API

// Middleware para rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Middleware para manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
  });
});

// Exportar app para poder usarla en server.js
module.exports = app;
