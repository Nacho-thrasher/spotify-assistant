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
  // Usar simplemente la IP y un identificador único aleatorio para invitados
  // IMPORTANTE: Ya NO usamos valores que cambian entre peticiones
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const simpleId = crypto
    .createHash('md5')
    .update(ip)
    .digest('hex')
    .substring(0, 12);
    
  return simpleId;
};

/**
 * Middleware que asegura que cada solicitud tenga un ID de usuario válido
 * El ID se almacena en req.userId para un acceso consistente
 */
const ensureUserId = (req, res, next) => {
  // Obtener el ID real de Spotify de todas las posibles fuentes
  const spotifyUserId = req.session?.spotifyUserId || 
                        (req.cookies && req.cookies.spotifyUserId);
  
  // Obtener el ID alternativo (generado localmente) si no hay ID de Spotify
  const cookieUserId = req.cookies && req.cookies.userId;
  
  // Nueva prioridad de fuentes para el ID de usuario
  req.userId = 
    // 1. PRIORIDAD MÁXIMA: ID real de Spotify (de sesión o cookie)
    spotifyUserId ||
    // 2. Si hay un usuario autenticado de otra forma
    req.user?.id || 
    // 3. Si hay un ID en la sesión
    req.session?.userId || 
    // 4. Si hay un ID en cookies (nuevo)
    cookieUserId ||
    // 5. Si se proporcionó explícitamente en los headers
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
    
    // IMPORTANTE: Guardar el ID en TODOS los lugares posibles para maximizar persistencia
    // 1. Guardar en sesión
    if (req.session) {
      req.session.userId = req.userId;
    }
    
    // 2. Guardar en cookie directa (dura 7 días)
    res.cookie('userId', req.userId, {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
      httpOnly: true,
      sameSite: 'lax'
    });
    
    console.log(`Generado nuevo ID de usuario: ${req.userId}`);
  } else {
    // IMPORTANTE: Asegurar que todos los lugares tengan el mismo ID
    // Si tenemos un ID pero no está en sesion o cookie, actualizarlos
    if (req.session && req.session.userId !== req.userId) {
      req.session.userId = req.userId;
    }
    
    if (!cookieUserId || cookieUserId !== req.userId) {
      res.cookie('userId', req.userId, {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
        httpOnly: true,
        sameSite: 'lax'
      });
    }
  }
  
  next();
};

module.exports = {
  ensureUserId
};
