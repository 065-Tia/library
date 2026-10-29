const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (role && ['ADMIN', 'PETUGAS', 'USER'].includes(role.toUpperCase())) {
      where.role = role.toUpperCase();
    }

    if (search && typeof search === 'string' && search.trim()) {
      const keyword = search.trim();
      where.OR = [
        { nama: { contains: keyword } },
        { nim: { contains: keyword } },
        { email: { contains: keyword } },
      ];
    }

    const [total, items] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          nim: true,
          nama: true,
          email: true,
          role: true,
          noTelepon: true,
          alamat: true,
          createdAt: true,
          _count: {
            select: {
              peminjaman: {
                where: { status: { in: ['PENDING', 'DISETUJUI', 'DIPINJAM'] } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const mapped = items.map((u) => ({
      ...u,
      pinjamanAktif: u._count.peminjaman,
    }));

    return res.status(200).json({
      status: true,
      message: 'Daftar pengguna berhasil diambil',
      data: mapped,
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
      return res.status(400).json({ status: false, message: 'ID pengguna tidak valid' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nim: true,
        nama: true,
        email: true,
        role: true,
        noTelepon: true,
        alamat: true,
        createdAt: true,
        peminjaman: {
          include: {
            buku: {
              select: { id: true, judul: true, isbn: true, coverUrl: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan' });
    }

    return res.status(200).json({
      status: true,
      message: 'Detail pengguna berhasil diambil',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    let { nim, nama, email, password, role = 'USER', noTelepon, alamat } = req.body || {};

    nim = typeof nim === 'string' ? nim.trim() : '';
    nama = typeof nama === 'string' ? nama.trim() : '';
    email = typeof email === 'string' ? email.trim().toLowerCase() : '';
    password = typeof password === 'string' ? password : '';

    if (!nim || !nama || !email || !password) {
      return res.status(400).json({
        status: false,
        message: 'Field nim, nama, email, dan password wajib diisi',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ status: false, message: 'Password minimal 6 karakter' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ status: false, message: 'Format email tidak valid' });
    }

    const duplicate = await prisma.user.findFirst({
      where: { OR: [{ nim }, { email }] },
    });

    if (duplicate) {
      return res.status(400).json({
        status: false,
        message: duplicate.nim === nim ? `NIM ${nim} sudah terdaftar` : `Email ${email} sudah terdaftar`,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const validRole = ['ADMIN', 'PETUGAS', 'USER'].includes(role) ? role : 'USER';

    const created = await prisma.user.create({
      data: {
        nim,
        nama,
        email,
        password: hashedPassword,
        role: validRole,
        noTelepon: noTelepon ? String(noTelepon).trim() : null,
        alamat: alamat ? String(alamat).trim() : null,
      },
      select: {
        id: true,
        nim: true,
        nama: true,
        email: true,
        role: true,
        noTelepon: true,
        alamat: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      status: true,
      message: 'Pengguna baru berhasil ditambahkan oleh admin',
      data: created,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ status: false, message: 'ID pengguna tidak valid' });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan' });
    }

    const { nama, email, role, noTelepon, alamat, passwordBaru } = req.body || {};

    if (id === req.user.sub && role && role !== 'ADMIN') {
      return res.status(400).json({
        status: false,
        message: 'Anda tidak dapat menurunkan hak akses peran (role) Anda sendiri saat sedang login.',
      });
    }

    const updateData = {};

    if (nama !== undefined) {
      const trimmedNama = String(nama).trim();
      if (!trimmedNama) return res.status(400).json({ status: false, message: 'Nama tidak boleh kosong' });
      updateData.nama = trimmedNama;
    }

    if (email !== undefined) {
      const trimmedEmail = String(email).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ status: false, message: 'Format email tidak valid' });
      }

      const duplicate = await prisma.user.findFirst({
        where: { email: trimmedEmail, NOT: { id } },
      });
      if (duplicate) {
        return res.status(400).json({ status: false, message: 'Email sudah digunakan akun lain' });
      }
      updateData.email = trimmedEmail;
    }

    if (role && ['ADMIN', 'PETUGAS', 'USER'].includes(role)) {
      updateData.role = role;
    }

    if (noTelepon !== undefined) updateData.noTelepon = String(noTelepon).trim() || null;
    if (alamat !== undefined) updateData.alamat = String(alamat).trim() || null;

    if (passwordBaru) {
      if (String(passwordBaru).length < 6) {
        return res.status(400).json({ status: false, message: 'Password baru minimal 6 karakter' });
      }
      updateData.password = await bcrypt.hash(passwordBaru, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        nim: true,
        nama: true,
        email: true,
        role: true,
        noTelepon: true,
        alamat: true,
        updatedAt: true,
      },
    });

    return res.status(200).json({
      status: true,
      message: 'Data pengguna berhasil diperbarui',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ status: false, message: 'ID pengguna tidak valid' });
    }

    if (id === req.user.sub) {
      return res.status(400).json({
        status: false,
        message: 'Anda tidak dapat menghapus akun Anda sendiri saat sedang login.',
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan' });
    }

    const activeLoans = await prisma.peminjaman.count({
      where: {
        userId: id,
        status: { in: ['PENDING', 'DISETUJUI', 'DIPINJAM'] },
      },
    });

    if (activeLoans > 0) {
      return res.status(400).json({
        status: false,
        message: `Pengguna tidak dapat dihapus karena masih memiliki ${activeLoans} peminjaman buku yang belum dikembalikan.`,
      });
    }

    const unpaidFines = await prisma.peminjaman.count({
      where: {
        userId: id,
        status: 'DIKEMBALIKAN',
        isDendaLunas: false,
        denda: { gt: 0 },
      },
    });

    if (unpaidFines > 0) {
      return res.status(400).json({
        status: false,
        message: `Pengguna tidak dapat dihapus karena masih memiliki ${unpaidFines} tagihan denda keterlambatan yang belum dilunasi.`,
      });
    }

    await prisma.user.delete({ where: { id } });

    return res.status(200).json({
      status: true,
      message: 'Akun pengguna berhasil dihapus dari sistem perpustakaan',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
