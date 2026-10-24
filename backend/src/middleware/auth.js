const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-pbp-kelompok-05-unira-2026-production';

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  const [bearer, token] = authHeader.split(' ');
  if (bearer !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      status: false,
      message: 'Token tidak ditemukan. Sertakan header Authorization: Bearer <token>',
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      status: false,
      message: 'Token tidak valid atau telah kedaluwarsa. Silakan login kembali.',
    });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: 'Pengguna belum terautentikasi (belum login).',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: false,
        message: `Akses ditolak. Fitur ini hanya dapat diakses oleh: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  JWT_SECRET,
};
