const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      nim: user.nim,
      nama: user.nama,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

router.post('/register', async (req, res, next) => {
  try {
    let { nim, nama, email, password, noTelepon, alamat } = req.body || {};

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
      return res.status(400).json({
        status: false,
        message: 'Password minimal terdiri dari 6 karakter',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: false,
        message: 'Format email tidak valid',
      });
    }

    const existingNim = await prisma.user.findUnique({ where: { nim } });
    if (existingNim) {
      return res.status(400).json({
        status: false,
        message: `NIM ${nim} sudah terdaftar dalam sistem`,
      });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({
        status: false,
        message: `Email ${email} sudah terdaftar dalam sistem`,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        nim,
        nama,
        email,
        password: hashedPassword,
        role: 'USER',
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

    const token = generateToken(newUser);

    return res.status(201).json({
      status: true,
      message: 'Registrasi akun berhasil',
      data: {
        token,
        user: newUser,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    let { nim, password } = req.body || {};

    nim = typeof nim === 'string' ? nim.trim() : '';
    password = typeof password === 'string' ? password : '';

    if (!nim || !password) {
      return res.status(400).json({
        status: false,
        message: 'NIM dan password wajib diisi',
      });
    }

    const user = await prisma.user.findUnique({ where: { nim } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        status: false,
        message: 'NIM atau password yang Anda masukkan salah',
      });
    }

    const token = generateToken(user);

    const userData = {
      id: user.id,
      nim: user.nim,
      nama: user.nama,
      email: user.email,
      role: user.role,
      noTelepon: user.noTelepon,
      alamat: user.alamat,
    };

    return res.status(200).json({
      status: true,
      message: 'Login berhasil',
      data: {
        token,
        user: userData,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true,
        nim: true,
        nama: true,
        email: true,
        role: true,
        noTelepon: true,
        alamat: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            peminjaman: {
              where: { status: { in: ['PENDING', 'DISETUJUI', 'DIPINJAM'] } },
            },
            antrean: {
              where: { status: { in: ['MENUNGGU', 'TERSEDIA'] } },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'Data pengguna tidak ditemukan',
      });
    }

    const { _count, ...userData } = user;

    return res.status(200).json({
      status: true,
      message: 'Profil berhasil diambil',
      data: {
        ...userData,
        pinjamanAktif: _count.peminjaman,
        antreanAktif: _count.antrean,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    let { nama, email, noTelepon, alamat } = req.body || {};

    const updateData = {};
    if (nama !== undefined) {
      const trimmedNama = String(nama).trim();
      if (!trimmedNama) {
        return res.status(400).json({ status: false, message: 'Nama tidak boleh kosong' });
      }
      updateData.nama = trimmedNama;
    }

    if (email !== undefined) {
      const trimmedEmail = String(email).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ status: false, message: 'Format email tidak valid' });
      }

      const duplicate = await prisma.user.findFirst({
        where: { email: trimmedEmail, NOT: { id: req.user.sub } },
      });
      if (duplicate) {
        return res.status(400).json({ status: false, message: 'Email sudah digunakan oleh akun lain' });
      }
      updateData.email = trimmedEmail;
    }

    if (noTelepon !== undefined) updateData.noTelepon = String(noTelepon).trim() || null;
    if (alamat !== undefined) updateData.alamat = String(alamat).trim() || null;

    const updated = await prisma.user.update({
      where: { id: req.user.sub },
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
      message: 'Profil berhasil diperbarui',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const { passwordLama, passwordBaru } = req.body || {};

    if (!passwordLama || !passwordBaru) {
      return res.status(400).json({
        status: false,
        message: 'Password lama dan password baru wajib diisi',
      });
    }

    if (String(passwordBaru).length < 6) {
      return res.status(400).json({
        status: false,
        message: 'Password baru minimal terdiri dari 6 karakter',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user || !(await bcrypt.compare(passwordLama, user.password))) {
      return res.status(400).json({
        status: false,
        message: 'Password lama Anda tidak cocok',
      });
    }

    const newHashed = await bcrypt.hash(passwordBaru, 10);
    await prisma.user.update({
      where: { id: req.user.sub },
      data: { password: newHashed },
    });

    return res.status(200).json({
      status: true,
      message: 'Password berhasil diperbarui',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
