const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { search, kategoriId, isDigital, available, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const allowedSortFields = ['judul', 'tahunTerbit', 'stok', 'createdAt'];
    const sortBy = allowedSortFields.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortBy]: sortOrder };

    const where = {};

    if (search && typeof search === 'string' && search.trim()) {
      const keyword = search.trim();
      where.OR = [
        { judul: { contains: keyword } },
        { penulis: { contains: keyword } },
        { penerbit: { contains: keyword } },
        { isbn: { contains: keyword } },
      ];
    }

    if (kategoriId && !isNaN(kategoriId)) {
      where.kategoriId = Number(kategoriId);
    }

    if (isDigital !== undefined) {
      where.isDigital = isDigital === 'true' || isDigital === '1';
    }

    if (available === 'true' || available === '1') {
      where.stok = { gt: 0 };
    }

    const [total, items] = await prisma.$transaction([
      prisma.buku.count({ where }),
      prisma.buku.findMany({
        where,
        include: {
          kategori: {
            select: { id: true, nama: true },
          },
        },
        orderBy,
        skip,
        take: limitNum,
      }),
    ]);

    return res.status(200).json({
      status: true,
      message: 'Daftar buku berhasil diambil',
      data: items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ status: false, message: 'ID buku harus berupa angka' });
    }

    const buku = await prisma.buku.findUnique({
      where: { id },
      include: {
        kategori: true,
        _count: {
          select: {
            peminjaman: {
              where: { status: { in: ['PENDING', 'DISETUJUI', 'DIPINJAM'] } },
            },
            antrean: {
              where: { status: 'MENUNGGU' },
            },
          },
        },
      },
    });

    if (!buku) {
      return res.status(404).json({ status: false, message: 'Buku tidak ditemukan' });
    }

    return res.status(200).json({
      status: true,
      message: 'Detail buku berhasil diambil',
      data: {
        ...buku,
        sedangDipinjam: buku._count.peminjaman,
        totalAntrean: buku._count.antrean,
        tersedia: buku.stok > 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    let {
      isbn,
      judul,
      penulis,
      penerbit,
      tahunTerbit,
      stok = 1,
      deskripsi,
      coverUrl,
      isDigital = false,
      fileUrl,
      kategoriId,
    } = req.body || {};

    isbn = typeof isbn === 'string' ? isbn.trim() : '';
    judul = typeof judul === 'string' ? judul.trim() : '';
    penulis = typeof penulis === 'string' ? penulis.trim() : '';
    penerbit = typeof penerbit === 'string' ? penerbit.trim() : '';

    if (!isbn || !judul || !penulis || !penerbit || !tahunTerbit || !kategoriId) {
      return res.status(400).json({
        status: false,
        message: 'Field isbn, judul, penulis, penerbit, tahunTerbit, dan kategoriId wajib diisi',
      });
    }

    const parsedTahun = parseInt(tahunTerbit, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(parsedTahun) || parsedTahun < 1900 || parsedTahun > currentYear + 1) {
      return res.status(400).json({
        status: false,
        message: `Tahun terbit harus berupa tahun valid antara 1900 dan ${currentYear + 1}`,
      });
    }

    const parsedStok = parseInt(stok, 10);
    if (isNaN(parsedStok) || parsedStok < 0) {
      return res.status(400).json({
        status: false,
        message: 'Stok buku tidak boleh berupa angka negatif',
      });
    }

    const existingIsbn = await prisma.buku.findUnique({ where: { isbn } });
    if (existingIsbn) {
      return res.status(400).json({
        status: false,
        message: `Buku dengan ISBN ${isbn} sudah terdaftar`,
      });
    }

    const kategori = await prisma.kategori.findUnique({ where: { id: Number(kategoriId) } });
    if (!kategori) {
      return res.status(400).json({ status: false, message: 'Kategori yang dipilih tidak valid' });
    }

    const baru = await prisma.buku.create({
      data: {
        isbn,
        judul,
        penulis,
        penerbit,
        tahunTerbit: parsedTahun,
        stok: parsedStok,
        deskripsi: deskripsi ? String(deskripsi).trim() : null,
        coverUrl: coverUrl ? String(coverUrl).trim() : null,
        isDigital: Boolean(isDigital),
        fileUrl: fileUrl ? String(fileUrl).trim() : null,
        kategoriId: Number(kategoriId),
      },
      include: {
        kategori: true,
      },
    });

    return res.status(201).json({
      status: true,
      message: 'Buku berhasil ditambahkan',
      data: baru,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ status: false, message: 'ID buku tidak valid' });
    }

    const existing = await prisma.buku.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ status: false, message: 'Buku tidak ditemukan' });
    }

    const {
      isbn,
      judul,
      penulis,
      penerbit,
      tahunTerbit,
      stok,
      deskripsi,
      coverUrl,
      isDigital,
      fileUrl,
      kategoriId,
    } = req.body || {};

    const updateData = {};

    if (isbn !== undefined) {
      const trimmedIsbn = String(isbn).trim();
      if (!trimmedIsbn) {
        return res.status(400).json({ status: false, message: 'ISBN tidak boleh kosong' });
      }
      if (trimmedIsbn !== existing.isbn) {
        const duplicate = await prisma.buku.findUnique({ where: { isbn: trimmedIsbn } });
        if (duplicate) {
          return res.status(400).json({ status: false, message: 'ISBN sudah digunakan buku lain' });
        }
      }
      updateData.isbn = trimmedIsbn;
    }

    if (judul !== undefined) updateData.judul = String(judul).trim();
    if (penulis !== undefined) updateData.penulis = String(penulis).trim();
    if (penerbit !== undefined) updateData.penerbit = String(penerbit).trim();

    if (tahunTerbit !== undefined) {
      const parsedTahun = parseInt(tahunTerbit, 10);
      const currentYear = new Date().getFullYear();
      if (isNaN(parsedTahun) || parsedTahun < 1900 || parsedTahun > currentYear + 1) {
        return res.status(400).json({ status: false, message: 'Tahun terbit tidak valid' });
      }
      updateData.tahunTerbit = parsedTahun;
    }

    if (stok !== undefined) {
      const parsedStok = parseInt(stok, 10);
      if (isNaN(parsedStok) || parsedStok < 0) {
        return res.status(400).json({ status: false, message: 'Stok tidak boleh bernilai negatif' });
      }
      updateData.stok = parsedStok;
    }

    if (deskripsi !== undefined) updateData.deskripsi = String(deskripsi).trim() || null;
    if (coverUrl !== undefined) updateData.coverUrl = String(coverUrl).trim() || null;
    if (isDigital !== undefined) updateData.isDigital = Boolean(isDigital);
    if (fileUrl !== undefined) updateData.fileUrl = String(fileUrl).trim() || null;

    if (kategoriId !== undefined) {
      const kategori = await prisma.kategori.findUnique({ where: { id: Number(kategoriId) } });
      if (!kategori) {
        return res.status(400).json({ status: false, message: 'Kategori tidak valid' });
      }
      updateData.kategoriId = Number(kategoriId);
    }

    const updated = await prisma.buku.update({
      where: { id },
      data: updateData,
      include: {
        kategori: true,
      },
    });

    return res.status(200).json({
      status: true,
      message: 'Data buku berhasil diperbarui',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ status: false, message: 'ID buku tidak valid' });
    }

    const existing = await prisma.buku.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ status: false, message: 'Buku tidak ditemukan' });
    }

    const activeLoans = await prisma.peminjaman.count({
      where: {
        bukuId: id,
        status: { in: ['PENDING', 'DISETUJUI', 'DIPINJAM'] },
      },
    });

    if (activeLoans > 0) {
      return res.status(400).json({
        status: false,
        message: `Buku tidak dapat dihapus karena masih memiliki ${activeLoans} transaksi peminjaman aktif. Pastikan semua peminjaman buku ini telah dikembalikan atau dibatalkan terlebih dahulu.`,
      });
    }

    await prisma.buku.delete({ where: { id } });

    return res.status(200).json({
      status: true,
      message: 'Buku berhasil dihapus dari koleksi perpustakaan',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
