const { Prisma } = require('@prisma/client');

function notFoundHandler(req, res) {
  res.status(404).json({
    status: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan di server`,
  });
}

function globalErrorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: false,
      message: 'Format JSON pada body request tidak valid',
    });
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return res.status(503).json({
      status: false,
      message: 'Tidak dapat terhubung ke database server MySQL. Pastikan service MySQL di XAMPP telah dinyalakan (Running).',
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = err.meta && err.meta.target ? ` pada field (${err.meta.target})` : '';
      return res.status(400).json({
        status: false,
        message: `Data sudah terdaftar dalam sistem${target}`,
        code: err.code,
      });
    }

    if (err.code === 'P2025') {
      return res.status(404).json({
        status: false,
        message: 'Data yang dicari tidak ditemukan dalam database',
        code: err.code,
      });
    }

    if (err.code === 'P2003') {
      return res.status(400).json({
        status: false,
        message: 'Relasi data tidak valid atau berelasi dengan data lain',
        code: err.code,
      });
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      status: false,
      message: 'Format data masukan tidak sesuai dengan skema database',
    });
  }

  console.error('[UNHANDLED SERVER ERROR]:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Terjadi kesalahan internal pada server';

  res.status(statusCode).json({
    status: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = {
  notFoundHandler,
  globalErrorHandler,
};
