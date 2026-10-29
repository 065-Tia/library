const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.sub;
    const sekarang = new Date();

    const [
      totalJudulBuku,
      totalStokFisik,
      totalEbook,
      totalAnggota,
      totalPeminjamanAktif,
      totalPeminjamanTerlambat,
      totalDendaSistem,
    ] = await Promise.all([
      prisma.buku.count(),
      prisma.buku.aggregate({ _sum: { stok: true } }),
      prisma.buku.count({ where: { isDigital: true } }),
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.peminjaman.count({
        where: { status: { in: ['PENDING', 'DISETUJUI', 'DIPINJAM'] } },
      }),
      prisma.peminjaman.count({
        where: {
          status: 'DIPINJAM',
          batasKembali: { lt: sekarang },
        },
      }),
      prisma.peminjaman.aggregate({
        _sum: { denda: true },
      }),
    ]);

    const [bukuTerpopuler, anggotaTeraktif, koleksiPerluDitambah] = await Promise.all([
      prisma.buku.findMany({
        take: 5,
        orderBy: {
          peminjaman: { _count: 'desc' },
        },
        select: {
          id: true,
          judul: true,
          penulis: true,
          stok: true,
          coverUrl: true,
          _count: {
            select: { peminjaman: true },
          },
        },
      }),
      prisma.user.findMany({
        where: { role: 'USER' },
        take: 5,
        orderBy: {
          peminjaman: { _count: 'desc' },
        },
        select: {
          id: true,
          nim: true,
          nama: true,
          _count: {
            select: { peminjaman: true },
          },
        },
      }),
      prisma.buku.findMany({
        where: { stok: { lte: 1 }, isDigital: false },
        take: 5,
        select: {
          id: true,
          judul: true,
          stok: true,
          isbn: true,
        },
      }),
    ]);

    const peminjamanTerbaru = await prisma.peminjaman.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, nama: true, nim: true } },
        buku: { select: { id: true, judul: true } },
      },
    });

    let dataUser = null;
    if (userRole === 'USER') {
      const [bukuSedangDipinjam, riwayatSelesai, totalDendaUser, antreanAktif] = await Promise.all([
        prisma.peminjaman.count({
          where: { userId, status: 'DIPINJAM' },
        }),
        prisma.peminjaman.count({
          where: { userId, status: 'DIKEMBALIKAN' },
        }),
        prisma.peminjaman.aggregate({
          where: { userId },
          _sum: { denda: true },
        }),
        prisma.antrean.count({
          where: { userId, status: 'MENUNGGU' },
        }),
      ]);

      dataUser = {
        bukuSedangDipinjam,
        riwayatSelesai,
        totalDenda: totalDendaUser._sum.denda || 0,
        antreanAktif,
      };
    }

    return res.status(200).json({
      status: true,
      message: 'Statistik dashboard berhasil diambil',
      data: {
        ringkasan: {
          totalJudulBuku,
          totalStokBuku: totalStokFisik._sum.stok || 0,
          totalEbook,
          totalAnggota,
          peminjamanAktif: totalPeminjamanAktif,
          peminjamanTerlambat: totalPeminjamanTerlambat,
          totalDendaTerkumpul: totalDendaSistem._sum.denda || 0,
        },
        analitik: {
          bukuTerpopuler: bukuTerpopuler.map((b) => ({
            id: b.id,
            judul: b.judul,
            penulis: b.penulis,
            stok: b.stok,
            totalDipinjam: b._count.peminjaman,
          })),
          anggotaTeraktif: anggotaTeraktif.map((u) => ({
            id: u.id,
            nim: u.nim,
            nama: u.nama,
            totalPinjam: u._count.peminjaman,
          })),
          rekomendasiPengadaan: koleksiPerluDitambah,
        },
        peminjamanTerbaru,
        ...(dataUser && { userStats: dataUser }),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
