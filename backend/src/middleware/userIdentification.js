/**
 * Middleware para la identificación consistente de usuarios
 * Asegura que cada solicitud tenga un ID de usuario válido y único
 */

const crypto = require('crypto');

// ID de usuario por defecto solo para pruebas - NO USAR en producción
const DEFAULT_USER_ID = 'guest';

/**
 * Genera un ID único para un usuario basado en información de sesión
 * @param {Object} req - La solicitud HTTP
 * @returns {string} - Un ID de usuario único
 */
const generateUniqueUserId = (req) => {
  // Usar un hash del IP + user agent para crear un identificador único para invitados
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  return crypto
    .createHash('sha256')
    .update(`${ip}-${userAgent}-${Date.now()}`)
    .digest('hex')
    .substring(0, 24); // Un ID de tamaño razonable
};

/**
 * Middleware que asegura que cada solicitud tenga un ID de usuario válido
 * El ID se almacena en req.userId para un acceso consistente
 */
const ensureUserId = (req, res, next) => {
  // Prioridad de fuentes para el ID de usuario
  req.userId = 
    // 1. Si hay un usuario autenticado
    req.user?.id || 
    // 2. Si hay un ID en la sesión
    req.session?.userId || 
    // 3. Si se proporcionó explícitamente en los headers
    req.headers['user-id'];
  
  // Si no tenemos un ID de usuario, creamos uno y lo guardamos en la sesión
  if (!req.userId) {
    if (process.env.NODE_ENV === 'production') {
      // En producción, generamos un ID único para este usuario/dispositivo
      req.userId = generateUniqueUserId(req);
    } else {
      // En desarrollo, usamos un ID predeterminado para pruebas
      req.userId = DEFAULT_USER_ID;
    }
    
    // Guardar en sesión para solicitudes futuras
    if (req.session) {
      req.session.userId = req.userId;
    }
    
    console.log(`Generado nuevo ID de usuario: ${req.userId}`);
  }
  
  // Para debugging
  // console.log(`Request de usuario con ID: ${req.userId}`);
  
  next();
};

module.exports = {
  ensureUserId
};
