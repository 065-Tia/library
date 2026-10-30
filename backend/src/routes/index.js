const express = require('express');

const authRouter = require('./auth');
const bukuRouter = require('./buku');
const kategoriRouter = require('./kategori');
const peminjamanRouter = require('./peminjaman');
const userRouter = require('./user');
const dashboardRouter = require('./dashboard');
const adminRouter = require('./admin');

const router = express.Router();

router.get('/', (_req, res) => {
  res.status(200).json({
    status: true,
    message: 'Welcome to E-Library REST API v1 - Kelompok 05 UNIRA',
    data: {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      modules: {
        auth: '/api/v1/auth',
        buku: '/api/v1/buku',
        kategori: '/api/v1/kategori',
        peminjaman: '/api/v1/peminjaman',
        user: '/api/v1/user',
        dashboard: '/api/v1/dashboard',
        admin: '/api/v1/admin',
      },
    },
  });
});

router.use('/auth', authRouter);
router.use('/buku', bukuRouter);
router.use('/kategori', kategoriRouter);
router.use('/peminjaman', peminjamanRouter);
router.use('/user', userRouter);
router.use('/dashboard', dashboardRouter);
router.use('/admin', adminRouter);

module.exports = router;
