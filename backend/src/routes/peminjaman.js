const express = require('express');
const prisma = require('../config/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const DENDA_PER_HARI = Number(process.env.DENDA_PER_HARI || 1000);
const MAX_PEMINJAMAN_AKTIF = 3;

function hitungDenda(batasKembali, tanggalKembali = new Date()) {
  const batas = new Date(batasKembali);
  if (isNaN(batas.getTime())) return 0;
  batas.setHours(23, 59, 59, 999);

  const kembali = new Date(tanggalKembali);
  if (isNaN(kembali.getTime()) || kembali <= batas) return 0;

  const selisihMs = kembali.getTime() - batas.getTime();
  const hariTerlambat = Math.ceil(selisihMs / (1000 * 60 * 60 * 24));
  return hariTerlambat * DENDA_PER_HARI;
}

router.post('/ajukan', requireAuth, requireRole('USER', 'ADMIN', 'PETUGAS'), async (req, res, next) => {
  try {
    const { bukuId, durasiHari = 7, catatan } = req.body || {};
    const userId = req.user.sub;

    if (!bukuId || isNaN(bukuId)) {
      return res.status(400).json({ status: false, message: 'ID buku wajib diisi dan berupa angka' });
    }

    const durasi = Math.max(1, Math.min(14, parseInt(durasiHari, 10) || 7));

    const totalPinjamAktif = await prisma.peminjaman.count({
      where: {
        userId,
        status: { in: ['PENDING', 'DISETUJUI', 'DIPINJAM'] },
      },
    });

    if (totalPinjamAktif >= MAX_PEMINJAMAN_AKTIF) {
      return res.status(400).json({
        status: false,
        message: `Batas maksimal peminjaman aktif tercapai (${MAX_PEMINJAMAN_AKTIF} buku). Kembalikan buku sebelumnya sebelum mengajukan peminjaman baru.`,
      });
    }

    const dendaBelumLunas = await prisma.peminjaman.findFirst({
      where: {
        userId,
        status: 'DIKEMBALIKAN',
        isDendaLunas: false,
        denda: { gt: 0 },
      },
    });

    if (dendaBelumLunas) {
      return res.status(400).json({
        status: false,
        message: `Anda memiliki tanggungan denda yang belum dibayar sebesar Rp${dendaBelumLunas.denda.toLocaleString('id-ID')}. Lunasi denda di meja sirkulasi perpustakaan terlebih dahulu.`,
      });
    }

    const pinjamSama = await prisma.peminjaman.findFirst({
      where: {
        userId,
        bukuId: Number(bukuId),
        status: { in: ['PENDING', 'DISETUJUI', 'DIPINJAM'] },
      },
    });

    if (pinjamSama) {
      return res.status(400).json({
        status: false,
        message: 'Anda masih memiliki permohonan atau peminjaman aktif untuk buku ini',
      });
    }

    const hasil = await prisma.$transaction(async (tx) => {
      const buku = await tx.buku.findUnique({
        where: { id: Number(bukuId) },
      });

      if (!buku) {
        throw new Error('BUKU_NOT_FOUND');
      }

      if (buku.isDigital) {
        return {
          tipe: 'EBOOK',
          data: {
            bukuId: buku.id,
            judul: buku.judul,
            isDigital: true,
            fileUrl: buku.fileUrl,
          },
        };
      }

      const antreanReserved = await tx.antrean.count({
        where: {
          bukuId: Number(bukuId),
          status: 'TERSEDIA',
        },
      });

      const stokBebas = buku.stok - antreanReserved;

      if (stokBebas <= 0) {
        const sudahAntre = await tx.antrean.findFirst({
          where: {
            userId,
            bukuId: Number(bukuId),
            status: { in: ['MENUNGGU', 'TERSEDIA'] },
          },
        });

        if (sudahAntre) {
          throw new Error('ALREADY_QUEUED');
        }

        const jumlahAntrean = await tx.antrean.count({
          where: {
            bukuId: Number(bukuId),
            status: 'MENUNGGU',
          },
        });

        const antreanBaru = await tx.antrean.create({
          data: {
            userId,
            bukuId: Number(bukuId),
            antreanKe: jumlahAntrean + 1,
            status: 'MENUNGGU',
          },
          include: { buku: true },
        });

        return { tipe: 'ANTREAN', data: antreanBaru };
      }

      const tanggalPinjam = new Date();
      const batasKembali = new Date();
      batasKembali.setDate(batasKembali.getDate() + durasi);

      const peminjaman = await tx.peminjaman.create({
        data: {
          userId,
          bukuId: Number(bukuId),
          tanggalPinjam,
          batasKembali,
          status: 'PENDING',
          catatan: catatan ? String(catatan).trim() : null,
        },
        include: {
          buku: true,
          user: {
            select: { id: true, nim: true, nama: true, email: true },
          },
        },
      });

      await tx.buku.update({
        where: { id: Number(bukuId) },
        data: { stok: { decrement: 1 } },
      });

      return { tipe: 'PEMINJAMAN', data: peminjaman };
    });

    if (hasil.tipe === 'EBOOK') {
      return res.status(200).json({
        status: true,
        message: 'Buku ini adalah buku digital (e-book) dan dapat langsung diakses secara online tanpa perlu peminjaman fisik.',
        data: hasil.data,
      });
    }

    if (hasil.tipe === 'ANTREAN') {
      return res.status(200).json({
        status: true,
        message: `Stok buku fisik sedang habis/direservasi antrean. Anda berhasil didaftarkan ke antrean pemesanan nomor urut #${hasil.data.antreanKe}`,
        data: hasil.data,
      });
    }

    return res.status(201).json({
      status: true,
      message: 'Pengajuan peminjaman buku berhasil diajukan. Menunggu persetujuan petugas.',
      data: hasil.data,
    });
  } catch (error) {
    if (error.message === 'BUKU_NOT_FOUND') {
      return res.status(404).json({ status: false, message: 'Buku yang diminta tidak ditemukan' });
    }
    if (error.message === 'ALREADY_QUEUED') {
      return res.status(400).json({ status: false, message: 'Anda sudah berada di dalam antrean pemesanan buku ini' });
    }
    next(error);
  }
});

router.post('/klaim-antrean/:id', requireAuth, async (req, res, next) => {
  try {
    const antreanId = Number(req.params.id);
    const userId = req.user.sub;

    const hasil = await prisma.$transaction(async (tx) => {
      const antrean = await tx.antrean.findUnique({
        where: { id: antreanId },
        include: { buku: true },
      });

      if (!antrean) {
        throw new Error('ANTREAN_NOT_FOUND');
      }

      if (antrean.userId !== userId && req.user.role !== 'ADMIN') {
        throw new Error('FORBIDDEN_CLAIM');
      }

      if (antrean.status !== 'TERSEDIA') {
        throw new Error('NOT_AVAILABLE_YET');
      }

      if (antrean.buku.stok <= 0) {
        throw new Error('STOK_HABIS');
      }

      const tanggalPinjam = new Date();
      const batasKembali = new Date();
      batasKembali.setDate(batasKembali.getDate() + 7);

      const peminjaman = await tx.peminjaman.create({
        data: {
          userId,
          bukuId: antrean.bukuId,
          tanggalPinjam,
          batasKembali,
          status: 'DISETUJUI',
          catatan: `Klaim dari antrean #${antrean.antreanKe}`,
        },
        include: { buku: true },
      });

      await tx.buku.update({
        where: { id: antrean.bukuId },
        data: { stok: { decrement: 1 } },
      });

      await tx.antrean.update({
        where: { id: antreanId },
        data: { status: 'SELESAI' },
      });

      return peminjaman;
    });

    return res.status(201).json({
      status: true,
      message: 'Buku antrean berhasil diklaim dan siap diambil di perpustakaan!',
      data: hasil,
    });
  } catch (error) {
    if (error.message === 'ANTREAN_NOT_FOUND') return res.status(404).json({ status: false, message: 'Data antrean tidak ditemukan' });
    if (error.message === 'FORBIDDEN_CLAIM') return res.status(403).json({ status: false, message: 'Anda tidak berhak mengklaim antrean milik pengguna lain' });
    if (error.message === 'NOT_AVAILABLE_YET') return res.status(400).json({ status: false, message: 'Buku antrean belum tersedia untuk diklaim' });
    if (error.message === 'STOK_HABIS') return res.status(400).json({ status: false, message: 'Stok buku tidak mencukupi saat ini' });
    next(error);
  }
});

router.post('/sirkulasi/pinjam-langsung', requireAuth, requireRole('ADMIN', 'PETUGAS'), async (req, res, next) => {
  try {
    const { nim, bukuId, durasiHari = 7, catatan } = req.body || {};

    if (!nim || !bukuId) {
      return res.status(400).json({ status: false, message: 'NIM mahasiswa dan ID buku wajib disertakan' });
    }

    const mahasiswa = await prisma.user.findUnique({ where: { nim: String(nim).trim() } });
    if (!mahasiswa) {
      return res.status(404).json({ status: false, message: `Mahasiswa dengan NIM ${nim} tidak ditemukan` });
    }

    const durasi = Math.max(1, Math.min(30, parseInt(durasiHari, 10) || 7));

    const hasil = await prisma.$transaction(async (tx) => {
      const buku = await tx.buku.findUnique({ where: { id: Number(bukuId) } });
      if (!buku) throw new Error('BUKU_NOT_FOUND');
      if (buku.stok <= 0) throw new Error('STOK_HABIS');

      const tanggalPinjam = new Date();
      const batasKembali = new Date();
      batasKembali.setDate(batasKembali.getDate() + durasi);

      const peminjaman = await tx.peminjaman.create({
        data: {
          userId: mahasiswa.id,
          bukuId: buku.id,
          tanggalPinjam,
          batasKembali,
          status: 'DIPINJAM',
          catatan: catatan ? `[Sirkulasi Langsung] ${String(catatan).trim()}` : '[Sirkulasi Langsung]',
        },
        include: {
          buku: true,
          user: { select: { id: true, nim: true, nama: true, email: true } },
        },
      });

      await tx.buku.update({
        where: { id: buku.id },
        data: { stok: { decrement: 1 } },
      });

      return peminjaman;
    });

    return res.status(201).json({
      status: true,
      message: 'Peminjaman langsung berhasil dicatat dan buku resmi berstatus DIPINJAM',
      data: hasil,
    });
  } catch (error) {
    if (error.message === 'BUKU_NOT_FOUND') return res.status(404).json({ status: false, message: 'Buku tidak ditemukan' });
    if (error.message === 'STOK_HABIS') return res.status(400).json({ status: false, message: 'Stok buku habis' });
    next(error);
  }
});

router.get('/saya', requireAuth, async (req, res, next) => {
  try {
    const list = await prisma.peminjaman.findMany({
      where: { userId: req.user.sub },
      include: {
        buku: {
          include: { kategori: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const hasil = list.map((item) => {
      let estimasiDenda = item.denda;
      if (item.status === 'DIPINJAM' && new Date() > new Date(item.batasKembali)) {
        estimasiDenda = hitungDenda(item.batasKembali);
      }
      return {
        ...item,
        dendaBerjalan: estimasiDenda,
        isTerlambat: new Date() > new Date(item.batasKembali) && item.status === 'DIPINJAM',
      };
    });

    return res.status(200).json({
      status: true,
      message: 'Riwayat peminjaman pribadi berhasil diambil',
      data: hasil,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/antrean/saya', requireAuth, async (req, res, next) => {
  try {
    const list = await prisma.antrean.findMany({
      where: { userId: req.user.sub },
      include: {
        buku: {
          select: { id: true, judul: true, penulis: true, coverUrl: true, stok: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      status: true,
      message: 'Daftar antrean buku pribadi berhasil diambil',
      data: list,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/antrean/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.antrean.findUnique({ where: { id } });

    if (!item) {
      return res.status(404).json({ status: false, message: 'Data antrean tidak ditemukan' });
    }

    if (item.userId !== req.user.sub && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: false, message: 'Anda tidak berhak membatalkan antrean ini' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.antrean.update({
        where: { id },
        data: { status: 'DIBATALKAN' },
      });

      if (item.status === 'TERSEDIA') {
        const nextQueue = await tx.antrean.findFirst({
          where: { bukuId: item.bukuId, status: 'MENUNGGU' },
          orderBy: { antreanKe: 'asc' },
        });

        if (nextQueue) {
          await tx.antrean.update({
            where: { id: nextQueue.id },
            data: { status: 'TERSEDIA' },
          });
        }
      }
    });

    return res.status(200).json({
      status: true,
      message: 'Antrean pemesanan buku berhasil dibatalkan',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/batal', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ status: false, message: 'ID peminjaman harus berupa angka' });
    }

    const pinjam = await prisma.peminjaman.findUnique({ where: { id } });
    if (!pinjam) {
      return res.status(404).json({ status: false, message: 'Data peminjaman tidak ditemukan' });
    }

    if (pinjam.userId !== req.user.sub && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: false, message: 'Anda tidak berhak membatalkan pengajuan ini' });
    }

    if (pinjam.status !== 'PENDING') {
      return res.status(400).json({
        status: false,
        message: `Pengajuan peminjaman tidak dapat dibatalkan karena statusnya sudah '${pinjam.status}'`,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.peminjaman.update({
        where: { id },
        data: {
          status: 'DITOLAK',
          catatan: `${pinjam.catatan || ''} [Dibatalkan oleh peminjam pada ${new Date().toLocaleDateString('id-ID')}]`.trim(),
        },
      });

      await tx.buku.update({
        where: { id: pinjam.bukuId },
        data: { stok: { increment: 1 } },
      });

      const antreanTerdepan = await tx.antrean.findFirst({
        where: { bukuId: pinjam.bukuId, status: 'MENUNGGU' },
        orderBy: { antreanKe: 'asc' },
      });

      if (antreanTerdepan) {
        await tx.antrean.update({
          where: { id: antreanTerdepan.id },
          data: { status: 'TERSEDIA' },
        });
      }
    });

    return res.status(200).json({
      status: true,
      message: 'Pengajuan peminjaman berhasil dibatalkan dan stok buku telah dikembalikan.',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAuth, requireRole('ADMIN', 'PETUGAS'), async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (status) {
      where.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const keyword = search.trim();
      where.OR = [
        { user: { nama: { contains: keyword } } },
        { user: { nim: { contains: keyword } } },
        { buku: { judul: { contains: keyword } } },
      ];
    }

    const [total, items] = await prisma.$transaction([
      prisma.peminjaman.count({ where }),
      prisma.peminjaman.findMany({
        where,
        include: {
          user: {
            select: { id: true, nim: true, nama: true, email: true, noTelepon: true },
          },
          buku: {
            select: { id: true, isbn: true, judul: true, penulis: true, coverUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const mapped = items.map((p) => {
      let dendaAktual = p.denda;
      if (p.status === 'DIPINJAM' && new Date() > new Date(p.batasKembali)) {
        dendaAktual = hitungDenda(p.batasKembali);
      }
      return {
        ...p,
        dendaBerjalan: dendaAktual,
        isTerlambat: new Date() > new Date(p.batasKembali) && p.status === 'DIPINJAM',
      };
    });

    return res.status(200).json({
      status: true,
      message: 'Daftar peminjaman perpustakaan berhasil diambil',
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

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ status: false, message: 'ID peminjaman harus berupa angka' });
    }

    const item = await prisma.peminjaman.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nim: true, nama: true, email: true, noTelepon: true } },
        buku: { include: { kategori: true } },
      },
    });

    if (!item) {
      return res.status(404).json({ status: false, message: 'Data peminjaman tidak ditemukan' });
    }

    if (item.userId !== req.user.sub && !['ADMIN', 'PETUGAS'].includes(req.user.role)) {
      return res.status(403).json({ status: false, message: 'Anda tidak berhak melihat transaksi milik pengguna lain' });
    }

    let dendaAktual = item.denda;
    if (item.status === 'DIPINJAM' && new Date() > new Date(item.batasKembali)) {
      dendaAktual = hitungDenda(item.batasKembali);
    }

    return res.status(200).json({
      status: true,
      message: 'Detail peminjaman berhasil diambil',
      data: {
        ...item,
        dendaBerjalan: dendaAktual,
        isTerlambat: new Date() > new Date(item.batasKembali) && item.status === 'DIPINJAM',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id/status', requireAuth, requireRole('ADMIN', 'PETUGAS'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status, catatan } = req.body || {};

    const validStatus = ['PENDING', 'DISETUJUI', 'DIPINJAM', 'DITOLAK'];
    if (!validStatus.includes(status)) {
      return res.status(400).json({
        status: false,
        message: `Status tidak valid. Pilihan: ${validStatus.join(', ')}`,
      });
    }

    const pinjam = await prisma.peminjaman.findUnique({ where: { id } });
    if (!pinjam) {
      return res.status(404).json({ status: false, message: 'Data peminjaman tidak ditemukan' });
    }

    if (pinjam.status === 'DIKEMBALIKAN') {
      return res.status(400).json({
        status: false,
        message: 'Transaksi peminjaman ini sudah selesai (DIKEMBALIKAN) dan tidak dapat diubah statusnya.',
      });
    }

    await prisma.$transaction(async (tx) => {
      if (status === 'DITOLAK' && pinjam.status !== 'DITOLAK') {
        await tx.buku.update({
          where: { id: pinjam.bukuId },
          data: { stok: { increment: 1 } },
        });

        const antreanTerdepan = await tx.antrean.findFirst({
          where: { bukuId: pinjam.bukuId, status: 'MENUNGGU' },
          orderBy: { antreanKe: 'asc' },
        });

        if (antreanTerdepan) {
          await tx.antrean.update({
            where: { id: antreanTerdepan.id },
            data: { status: 'TERSEDIA' },
          });
        }
      }

      if (pinjam.status === 'DITOLAK' && (status === 'PENDING' || status === 'DISETUJUI' || status === 'DIPINJAM')) {
        const buku = await tx.buku.findUnique({ where: { id: pinjam.bukuId } });
        if (buku.stok <= 0) {
          throw new Error('STOK_HABIS');
        }
        await tx.buku.update({
          where: { id: pinjam.bukuId },
          data: { stok: { decrement: 1 } },
        });
      }

      await tx.peminjaman.update({
        where: { id },
        data: {
          status,
          catatan: catatan ? String(catatan).trim() : pinjam.catatan,
        },
      });
    });

    return res.status(200).json({
      status: true,
      message: `Status peminjaman berhasil diperbarui menjadi ${status}`,
    });
  } catch (error) {
    if (error.message === 'STOK_HABIS') {
      return res.status(400).json({ status: false, message: 'Stok buku sudah habis, tidak dapat mengaktifkan peminjaman kembali.' });
    }
    next(error);
  }
});

router.post('/:id/kembali', requireAuth, requireRole('ADMIN', 'PETUGAS'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { catatan } = req.body || {};

    const pinjam = await prisma.peminjaman.findUnique({
      where: { id },
      include: { buku: true, user: true },
    });

    if (!pinjam) {
      return res.status(404).json({ status: false, message: 'Data peminjaman tidak ditemukan' });
    }

    if (pinjam.status === 'DIKEMBALIKAN') {
      return res.status(400).json({ status: false, message: 'Buku ini sudah berstatus dikembalikan sebelumnya' });
    }

    if (pinjam.status === 'DITOLAK') {
      return res.status(400).json({ status: false, message: 'Peminjaman ini berstatus ditolak, tidak dapat dikembalikan' });
    }

    const tanggalKembali = new Date();
    const denda = hitungDenda(pinjam.batasKembali, tanggalKembali);

    const updated = await prisma.$transaction(async (tx) => {
      const selesai = await tx.peminjaman.update({
        where: { id },
        data: {
          status: 'DIKEMBALIKAN',
          tanggalKembali,
          denda,
          isDendaLunas: denda === 0,
          catatan: catatan ? `${pinjam.catatan || ''} | Pengembalian: ${String(catatan).trim()}` : pinjam.catatan,
        },
      });

      await tx.buku.update({
        where: { id: pinjam.bukuId },
        data: { stok: { increment: 1 } },
      });

      const antreanTerdepan = await tx.antrean.findFirst({
        where: { bukuId: pinjam.bukuId, status: 'MENUNGGU' },
        orderBy: { antreanKe: 'asc' },
      });

      if (antreanTerdepan) {
        await tx.antrean.update({
          where: { id: antreanTerdepan.id },
          data: { status: 'TERSEDIA' },
        });
      }

      return selesai;
    });

    return res.status(200).json({
      status: true,
      message: `Buku berhasil dicatat pengembaliannya. ${denda > 0 ? `Denda keterlambatan: Rp${denda.toLocaleString('id-ID')} (Belum Lunas)` : 'Tidak ada denda.'}`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id/bayar-denda', requireAuth, requireRole('ADMIN', 'PETUGAS'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pinjam = await prisma.peminjaman.findUnique({ where: { id } });

    if (!pinjam) {
      return res.status(404).json({ status: false, message: 'Data peminjaman tidak ditemukan' });
    }

    if (pinjam.denda <= 0) {
      return res.status(400).json({ status: false, message: 'Peminjaman ini tidak memiliki tagihan denda' });
    }

    if (pinjam.isDendaLunas) {
      return res.status(400).json({ status: false, message: 'Denda peminjaman ini sudah berstatus lunas' });
    }

    const updated = await prisma.peminjaman.update({
      where: { id },
      data: {
        isDendaLunas: true,
        catatan: `${pinjam.catatan || ''} [Denda Rp${pinjam.denda.toLocaleString('id-ID')} LUNAS pada ${new Date().toLocaleDateString('id-ID')}]`.trim(),
      },
    });

    return res.status(200).json({
      status: true,
      message: 'Pembayaran denda berhasil dicatat. Status tagihan lunas.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/perpanjang', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pinjam = await prisma.peminjaman.findUnique({ where: { id } });

    if (!pinjam) {
      return res.status(404).json({ status: false, message: 'Peminjaman tidak ditemukan' });
    }

    if (pinjam.userId !== req.user.sub && req.user.role !== 'ADMIN') {
      return res.status(403).json({ status: false, message: 'Anda tidak memiliki hak untuk perpanjangan ini' });
    }

    if (pinjam.status !== 'DIPINJAM') {
      return res.status(400).json({ status: false, message: 'Hanya buku dengan status DIPINJAM yang dapat diperpanjang' });
    }

    if (new Date() > new Date(pinjam.batasKembali)) {
      return res.status(400).json({
        status: false,
        message: 'Buku sudah melewati batas waktu kembali (terlambat). Silakan kembalikan ke perpustakaan untuk membayar denda.',
      });
    }

    const dendaBelumLunas = await prisma.peminjaman.findFirst({
      where: {
        userId: pinjam.userId,
        status: 'DIKEMBALIKAN',
        isDendaLunas: false,
        denda: { gt: 0 },
      },
    });

    if (dendaBelumLunas) {
      return res.status(400).json({
        status: false,
        message: `Anda memiliki tanggungan denda yang belum dibayar sebesar Rp${dendaBelumLunas.denda.toLocaleString('id-ID')}. Lunasi denda terlebih dahulu sebelum memperpanjang pinjaman.`,
      });
    }

    if (pinjam.catatan && pinjam.catatan.includes('[Diperpanjang]')) {
      return res.status(400).json({
        status: false,
        message: 'Perpanjangan hanya dapat dilakukan maksimal 1 kali per peminjaman',
      });
    }

    const adaAntrean = await prisma.antrean.findFirst({
      where: { bukuId: pinjam.bukuId, status: { in: ['MENUNGGU', 'TERSEDIA'] } },
    });

    if (adaAntrean) {
      return res.status(400).json({
        status: false,
        message: 'Buku ini tidak dapat diperpanjang karena sedang memiliki antrean pemesanan oleh mahasiswa lain',
      });
    }

    const batasBaru = new Date(pinjam.batasKembali);
    batasBaru.setDate(batasBaru.getDate() + 7);

    const updated = await prisma.peminjaman.update({
      where: { id },
      data: {
        batasKembali: batasBaru,
        catatan: `${pinjam.catatan || ''} [Diperpanjang +7 hari pada ${new Date().toLocaleDateString('id-ID')}]`.trim(),
      },
    });

    return res.status(200).json({
      status: true,
      message: 'Masa peminjaman berhasil diperpanjang 7 hari',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
