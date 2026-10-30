const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/rekap', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const [totalUser, totalBuku, totalPinjam, totalDenda] = await Promise.all([
      prisma.user.count(),
      prisma.buku.count(),
      prisma.peminjaman.count(),
      prisma.peminjaman.aggregate({ _sum: { denda: true } }),
    ]);

    return res.status(200).json({
      status: true,
      message: 'Rekap khusus admin berhasil diambil',
      data: {
        totalUser,
        totalBuku,
        totalPeminjaman: totalPinjam,
        totalDendaSistem: totalDenda._sum.denda || 0,
        catatan: 'Guard otorisasi peran ADMIN aktif dan terverifikasi',
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
