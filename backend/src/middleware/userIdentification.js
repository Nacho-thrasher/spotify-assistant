/**
 * Middleware para identificación de usuarios
 * Garantiza que cada petición tenga un userId consistente
 */
const crypto = require('crypto');

// Constante para el ID de usuario por defecto durante desarrollo
const DEFAULT_USER_ID = 'nacho';

/**
 * Genera un identificador único para un usuario basado en su IP
 * @param {Object} req - Objeto de solicitud Express
 * @returns {string} - Un ID de usuario único
 */
const generateUniqueUserId = (req) => {
  // Usamos una combinación más robusta de factores para generar ID
  // Especialmente importante en entornos como Railway donde las IPs pueden cambiar
  
  // 1. Recolectar factores de identidad de múltiples fuentes
  const factors = [];
  
  // Factor 1: IP del cliente (limpiada y normalizada)
  let ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  
  // Normalizar IPv6 a IPv4 cuando sea posible
  if (ip === '::1' || ip.includes('::ffff:')) {
    // Convertir ::ffff:127.0.0.1 a 127.0.0.1
    ip = ip.replace(/^.*:/, '');
  }
  
  // Si hay múltiples IPs (proxies), usar la más cercana al cliente original
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  
  factors.push(ip);
  
  // Factor 2: User-Agent si está disponible
  const userAgent = req.headers['user-agent'] || 'unknown-agent';
  factors.push(userAgent);
  
  // Factor 3: Cualquier header único que pueda ayudar con la identificación
  const accept = req.headers['accept'] || '';
  const language = req.headers['accept-language'] || '';
  factors.push(accept.substring(0, 20) + language.substring(0, 10));
  
  console.log(`Generando ID basado en IP: ${ip}`);
  
  // Combinar todos los factores y generar un hash
  const combinedFactors = factors.join('||');
  const simpleId = crypto
    .createHash('md5')
    .update(combinedFactors)
    .digest('hex')
    .substring(0, 12);
    
  return simpleId;
};

/**
 * Middleware para asegurar que cada solicitud tenga un ID de usuario
 * Si no tiene un ID, le asigna uno basado en la IP y cookies
 */
const ensureUserId = (req, res, next) => {
  // Comprobar múltiples fuentes de ID de usuario (en orden de prioridad)
  req.userId = 
    // 1. ID real de Spotify (prioridad máxima)
    req.session?.spotifyUserId || 
    (req.signedCookies && req.signedCookies.spotifyUserId) ||
    (req.cookies && req.cookies.spotifyUserId) ||
    
    // 2. ID generado previamente
    req.userId || 
    (req.signedCookies && req.signedCookies.userId) ||
    (req.cookies && req.cookies.userId) ||
    req.session?.userId || 
    
    // 3. Otros lugares donde podría estar
    req.user?.id || 
    req.headers['user-id'];
  
  // Si encontramos un ID en alguna de las fuentes, usarlo
  if (req.userId) {
    console.log(`Usando ID de usuario existente: ${req.userId}`);
  }
  // Si no hay ID, generamos uno nuevo
  else {
    if (process.env.NODE_ENV === 'production') {
      // En producción, generar ID basado en IP
      req.userId = generateUniqueUserId(req);
    } else {
      // En desarrollo, usar ID fijo para pruebas
      req.userId = DEFAULT_USER_ID;
    }
    console.log(`Generado nuevo ID de usuario: ${req.userId}`);
  }
  
  // IMPORTANTE: Guardar el ID en TODOS los lugares posibles para maximizar persistencia
  
  // 1. Guardar en sesión
  if (req.session) {
    req.session.userId = req.userId;
    // Forzar guardado de sesión inmediato si disponible
    if (req.session.save) {
      req.session.save();
    }
  }
  
  // 2. Configuración común para todas las cookies - optimizada para entornos cloud
  // IMPORTANTE: Usar Domain-less cookies para funcionar con cualquier dominio
  const COOKIE_OPTIONS = {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' para permitir cross-site en producción
    secure: process.env.NODE_ENV === 'production', // Requerido cuando sameSite es 'none'
    path: '/',
  };
  
  // 3. Guardar en cookies (sin firmar y firmadas)
  
  // Cookie normal (sin firmar)
  res.cookie('userId', req.userId, COOKIE_OPTIONS);
  
  // Cookie firmada (más segura)
  res.cookie('userId', req.userId, {
    ...COOKIE_OPTIONS,
    signed: true
  });
  
  // 4. Si hay un ID de Spotify, también guardarlo en cookies
  if (req.session?.spotifyUserId) {
    res.cookie('spotifyUserId', req.session.spotifyUserId, COOKIE_OPTIONS);
    res.cookie('spotifyUserId', req.session.spotifyUserId, {
      ...COOKIE_OPTIONS,
      signed: true
    });
  }
  
  // Continuar con la siguiente función
  next();
};

module.exports = {
  ensureUserId
};
