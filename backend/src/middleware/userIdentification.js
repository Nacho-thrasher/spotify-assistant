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
  // ENFOQUE SIMPLIFICADO: Usar SOLO la IP, sin ningún otro factor
  // Esto garantiza que sea 100% consistente para un mismo cliente
  
  // Primero limpiamos la IP para hacerla más consistente
  let ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  // Si es IPv6 local, convertir a formato simple
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }
  
  // Si contiene múltiples IPs, usar solo la primera
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  
  console.log(`Generando ID basado en IP: ${ip}`);
  
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
  
  // Si no tenemos un ID de usuario, intentamos obtenerlo del cliente o creamos uno
  if (!req.userId) {
    // Intentar obtener un identificador de la cookie firmada primero
    const signedCookieUserId = req.signedCookies && req.signedCookies.userId;
    
    // Si ya tenemos una cookie firmada, usarla con prioridad
    if (signedCookieUserId) {
      req.userId = signedCookieUserId;
      console.log(`Restaurado ID de usuario desde cookie firmada: ${req.userId}`);
    } else {
      // En último caso, generar uno nuevo
      if (process.env.NODE_ENV === 'production') {
        // En producción, generamos un ID único para este usuario/dispositivo
        req.userId = generateUniqueUserId(req);
      } else {
        // En desarrollo, usamos un ID predeterminado para pruebas
        req.userId = DEFAULT_USER_ID;
      }
      
      console.log(`Generado nuevo ID de usuario: ${req.userId}`);
    }
    
    // IMPORTANTE: Guardar el ID en TODOS los lugares posibles para maximizar persistencia
    // 1. Guardar en sesión
    if (req.session) {
      req.session.userId = req.userId;
      // Forzar guardado de sesión de inmediato
      if (req.session.save) {
        req.session.save();
      }
    }
    
    // 2. Guardar en cookie directa Y firmada (dura 30 días)
    const COOKIE_OPTIONS = {
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
    
    // Cookie sin firmar (para compatibilidad)
    res.cookie('userId', req.userId, COOKIE_OPTIONS);
    
    // Cookie firmada (más segura)
    res.cookie('userId', req.userId, { 
      ...COOKIE_OPTIONS,
      signed: true 
    });
  } else {
    // IMPORTANTE: Asegurar que todos los lugares tengan el mismo ID
    // Si tenemos un ID pero no está en sesion o cookie, actualizarlos
    if (req.session && req.session.userId !== req.userId) {
      req.session.userId = req.userId;
      // Forzar guardado de sesión de inmediato
      if (req.session.save) {
        req.session.save();
      }
    }
    
    // Solo actualizar cookies si son diferentes del ID actual
    const COOKIE_OPTIONS = {
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
    
    if (!cookieUserId || cookieUserId !== req.userId) {
      res.cookie('userId', req.userId, COOKIE_OPTIONS);
    }
    
    // Actualizar cookie firmada si es necesario
    const signedCookieUserId = req.signedCookies && req.signedCookies.userId;
    if (!signedCookieUserId || signedCookieUserId !== req.userId) {
      res.cookie('userId', req.userId, { 
        ...COOKIE_OPTIONS,
        signed: true 
      });
    }
  }
  
  next();
};

module.exports = {
  ensureUserId
};
