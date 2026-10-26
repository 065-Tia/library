const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Mulai proses seeding database E-Library...');

  const hashAdmin = await bcrypt.hash('admin123', 10);
  const hashPetugas = await bcrypt.hash('petugas123', 10);
  const hashMhs = await bcrypt.hash('mhs123', 10);

  await prisma.user.upsert({
    where: { nim: '20240001' },
    update: {},
    create: {
      nim: '20240001',
      nama: 'Admin Perpustakaan UNIRA',
      email: 'admin@elibrary.unira.ac.id',
      password: hashAdmin,
      role: 'ADMIN',
      noTelepon: '081234567890',
      alamat: 'Kampus UNIRA Pamekasan',
    },
  });

  await prisma.user.upsert({
    where: { nim: '20240002' },
    update: {},
    create: {
      nim: '20240002',
      nama: 'Petugas Sirkulasi',
      email: 'petugas@elibrary.unira.ac.id',
      password: hashPetugas,
      role: 'PETUGAS',
      noTelepon: '081234567891',
      alamat: 'Ruang Layanan Perpustakaan UNIRA',
    },
  });

  await prisma.user.upsert({
    where: { nim: '2024520058' },
    update: {},
    create: {
      nim: '2024520058',
      nama: 'Dimas Prasetyo J.',
      email: 'dimas@student.unira.ac.id',
      password: hashMhs,
      role: 'USER',
      noTelepon: '082345678901',
      alamat: 'Pamekasan, Madura',
    },
  });

  await prisma.user.upsert({
    where: { nim: '2024520065' },
    update: {},
    create: {
      nim: '2024520065',
      nama: 'Nur Hidayah Titiani',
      email: 'hidayah@student.unira.ac.id',
      password: hashMhs,
      role: 'USER',
      noTelepon: '082345678902',
      alamat: 'Pamekasan, Madura',
    },
  });

  console.log('Pengguna (Admin, Petugas, Mahasiswa) berhasil dibuat.');

  const kat1 = await prisma.kategori.upsert({
    where: { nama: 'Pemrograman & Rekayasa Perangkat Lunak' },
    update: {},
    create: {
      nama: 'Pemrograman & Rekayasa Perangkat Lunak',
      deskripsi: 'Buku-buku mengenai arsitektur perangkat lunak, coding, web, dan mobile',
    },
  });

  const kat2 = await prisma.kategori.upsert({
    where: { nama: 'Basis Data & Sistem Informasi' },
    update: {},
    create: {
      nama: 'Basis Data & Sistem Informasi',
      deskripsi: 'Buku perancangan basis data relasional, SQL, NoSQL, dan analitik',
    },
  });

  await prisma.kategori.upsert({
    where: { nama: 'Kecerdasan Buatan & Data Science' },
    update: {},
    create: {
      nama: 'Kecerdasan Buatan & Data Science',
      deskripsi: 'Buku machine learning, data mining, dan kecerdasan artifisial',
    },
  });

  console.log('Kategori buku berhasil dibuat.');

  const bukuList = [
    {
      isbn: '978-602-05-1234-1',
      judul: 'Clean Code: Panduan Menulis Kode yang Rapi dan Teruji',
      penulis: 'Robert C. Martin',
      penerbit: 'Prentice Hall',
      tahunTerbit: 2021,
      stok: 5,
      deskripsi: 'Panduan fundamental mengenai arsitektur kode bersih, refactoring, dan penulisan unit test.',
      coverUrl: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?w=400',
      isDigital: false,
      kategoriId: kat1.id,
    },
    {
      isbn: '978-602-05-5678-2',
      judul: 'Fullstack Web Modern dengan Svelte 5 dan Express.js',
      penulis: 'Tim Dosen Informatika UNIRA',
      penerbit: 'Informatika Press',
      tahunTerbit: 2025,
      stok: 3,
      deskripsi: 'Buku rujukan membangun aplikasi web terpadu dengan arsitektur micro-service dan single API.',
      coverUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400',
      isDigital: false,
      kategoriId: kat1.id,
    },
    {
      isbn: '978-602-05-9999-3',
      judul: 'Mastering Flutter 3: Dari Nol Menjadi Ahli Multiplatform',
      penulis: 'Google Developer Group',
      penerbit: 'Tech Madura Media',
      tahunTerbit: 2024,
      stok: 4,
      deskripsi: 'Membangun aplikasi mobile profesional berbasis Flutter dengan manajemen state terstandar.',
      coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400',
      isDigital: false,
      kategoriId: kat1.id,
    },
    {
      isbn: '978-602-05-3333-4',
      judul: 'Perancangan Basis Data Relasional dengan MySQL & Prisma ORM',
      penulis: 'Muhammad Umar Mansyur',
      penerbit: 'UNIRA Academic Publishing',
      tahunTerbit: 2025,
      stok: 2,
      deskripsi: 'Panduan praktis perancangan ERD, normalisasi, dan implementasi modern Object-Relational Mapping.',
      coverUrl: 'https://images.unsplash.com/photo-1507842229451-9f7a17f54924?w=400',
      isDigital: true,
      fileUrl: 'https://example.com/ebooks/basis-data-unira.pdf',
      kategoriId: kat2.id,
    },
  ];

  for (const b of bukuList) {
    await prisma.buku.upsert({
      where: { isbn: b.isbn },
      update: {},
      create: b,
    });
  }

  console.log('Koleksi buku fisik & e-book berhasil di-seed.');
  console.log('Seeding database selesai tanpa kendala!');
}

main()
  .catch((e) => {
    console.error('Terjadi kesalahan saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
