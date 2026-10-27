const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const kategori = await prisma.kategori.findMany({
      include: {
        _count: {
          select: { buku: true },
        },
      },
      orderBy: { nama: 'asc' },
    });

    res.status(200).json({
      status: true,
      message: 'Daftar kategori berhasil diambil',
      data: kategori,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ status: false, message: 'ID kategori harus berupa angka' });
    }

    const item = await prisma.kategori.findUnique({
      where: { id },
      include: {
        buku: true,
      },
    });

    if (!item) {
      return res.status(404).json({ status: false, message: 'Kategori tidak ditemukan' });
    }

    res.status(200).json({
      status: true,
      message: 'Detail kategori berhasil diambil',
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, requireRole('ADMIN', 'PETUGAS'), async (req, res, next) => {
  try {
    const { nama, deskripsi } = req.body || {};
    if (!nama) {
      return res.status(400).json({ status: false, message: 'Nama kategori wajib diisi' });
    }

    const existing = await prisma.kategori.findUnique({ where: { nama } });
    if (existing) {
      return res.status(400).json({ status: false, message: 'Nama kategori sudah ada' });
    }

    const created = await prisma.kategori.create({
      data: { nama, deskripsi: deskripsi || null },
    });

    res.status(201).json({
      status: true,
      message: 'Kategori berhasil ditambahkan',
      data: created,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireAuth, requireRole('ADMIN', 'PETUGAS'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nama, deskripsi } = req.body || {};

    const existing = await prisma.kategori.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ status: false, message: 'Kategori tidak ditemukan' });
    }

    const updateData = {};
    if (nama !== undefined) {
      const trimmedNama = String(nama).trim();
      if (!trimmedNama) {
        return res.status(400).json({ status: false, message: 'Nama kategori tidak boleh kosong' });
      }
      updateData.nama = trimmedNama;
    }
    if (deskripsi !== undefined) {
      updateData.deskripsi = String(deskripsi).trim() || null;
    }

    const updated = await prisma.kategori.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      status: true,
      message: 'Kategori berhasil diperbarui',
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
      return res.status(400).json({ status: false, message: 'ID kategori harus berupa angka' });
    }

    const existing = await prisma.kategori.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ status: false, message: 'Kategori tidak ditemukan' });
    }

    const bookCount = await prisma.buku.count({ where: { kategoriId: id } });
    if (bookCount > 0) {
      return res.status(400).json({
        status: false,
        message: `Kategori '${existing.nama}' tidak dapat dihapus karena masih digunakan oleh ${bookCount} buku. Pindahkan kategori buku tersebut terlebih dahulu.`,
      });
    }

    await prisma.kategori.delete({ where: { id } });

    res.status(200).json({
      status: true,
      message: 'Kategori berhasil dihapus',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
