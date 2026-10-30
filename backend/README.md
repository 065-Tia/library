# Backend REST API — E-Library (Kelompok 05)

Backend API untuk aplikasi E-Library Pemrograman Berbasis Platform (Teknik Informatika, Universitas Madura). Melayani klien **Web (Svelte 5)** dan **Mobile (Flutter 3.x)** secara terpusat melalui arsitektur *Single REST API*.

---

## 🛠️ Tech Stack & Spesifikasi
- **Runtime:** Node.js (v20+ / v24 LTS)
- **Framework:** Express.js 4.21.2
- **ORM:** Prisma ORM 6.x
- **Database:** MySQL (XAMPP / MariaDB) dengan Relasi Terindeks (`@@index`) & Integritas `onDelete: Restrict`
- **Autentikasi:** Stateless JWT (`jsonwebtoken`)
- **Password Security:** Salted Hash 10 rounds (`bcryptjs`)
- **CORS:** Diaktifkan untuk port 5173 (Svelte), localhost, dan IP Mobile

---

## 📁 Struktur Direktori
```text
backend/
├── prisma/
│   ├── schema.prisma       # Skema tabel (User, Kategori, Buku, Peminjaman, Antrean)
│   └── seed.js             # Seeding data default (Admin, Petugas, Mahasiswa, Buku)
├── src/
│   ├── config/
│   │   └── prisma.js       # Instance Prisma Client singleton
│   ├── middleware/
│   │   ├── auth.js         # requireAuth (401) & requireRole (403)
│   │   └── errorHandler.js # 404 Not Found & 500/503 Prisma Error Handler
│   ├── routes/
│   │   ├── index.js        # Root /api/v1 router & aggregator
│   │   ├── auth.js         # /api/v1/auth (register, login, me, profile, password)
│   │   ├── buku.js         # /api/v1/buku (CRUD, filter, search, sort, detail stok)
│   │   ├── kategori.js     # /api/v1/kategori (CRUD kategori buku dengan proteksi relasi)
│   │   ├── peminjaman.js   # /api/v1/peminjaman (ajukan, antrean, klaim, sirkulasi langsung, denda, pelunasan)
│   │   ├── user.js         # /api/v1/user (kelola pengguna khusus Admin dengan proteksi lockout)
│   │   └── dashboard.js    # /api/v1/dashboard/stats (ringkasan analitik perpustakaan untuk pimpinan)
│   ├── app.js              # Inisialisasi Express & CORS
│   └── server.js           # Server listener port 3000
├── test/
│   └── audit-suite.js      # Pengujian otomatis forensik keamanan, validasi, dan logika
├── .env.example            # Template environment variables
├── .env                    # Variabel lokal (JANGAN DI-COMMIT KE GIT)
├── .gitignore              # Mengabaikan .env dan node_modules
└── package.json
```

---

## 🚀 Panduan Menjalankan

### 1. Pastikan Service MySQL Aktif di XAMPP
Buka XAMPP Control Panel, lalu klik **Start** pada modul **MySQL**.

### 2. Migrasi Database & Seeding
Jalankan perintah berikut di folder `backend/`:
```bash
# Sinkronkan skema tabel ke database MySQL
npm run prisma:push

# Masukkan data awal (Akun default & katalog buku)
npm run prisma:seed
```

### 3. Menjalankan Server API
```bash
# Mode pengembangan dengan auto-reload (Node watch)
npm run dev

# Atau mode produksi biasa
npm start
```

### 4. Menjalankan Uji Audit Otomatis
```bash
npm test
```

---

## 🔑 Akun Default Hasil Seeding
| Role | NIM | Password | Keterangan |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `20240001` | `admin123` | Hak akses penuh: kelola buku, user, dashboard |
| **PETUGAS** | `20240002` | `petugas123` | Sirkulasi: approve pinjam, pinjam langsung, pengembalian, cek denda |
| **USER** | `2024520058` | `mhs123` | Mahasiswa: cari buku, ajukan pinjam, antrean |
| **USER** | `2024520065` | `mhs123` | Mahasiswa: riwayat transaksi |

---

## 📡 Daftar Endpoint Lengkap (Base URL: `/api/v1`)

### 1. Autentikasi (`/api/v1/auth`)
- `POST /auth/register` — Pendaftaran akun mahasiswa baru (Public, terkunci ke role `USER`)
- `POST /auth/login` — Masuk sistem menggunakan NIM & Password (Public)
- `GET /auth/me` — Ambil data profil akun yang sedang login beserta jumlah pinjaman aktif (Bearer Token)
- `PUT /auth/profile` — Perbarui data diri (Bearer Token)
- `PUT /auth/password` — Ubah password pribadi (Bearer Token)

### 2. Koleksi Buku (`/api/v1/buku`)
- `GET /buku` — Daftar buku + Search (`?search=...`) + Filter Kategori (`?kategoriId=...`) + E-Book (`?isDigital=true`) + Sorting (`?sortBy=judul&order=asc`)
- `GET /buku/:id` — Detail buku, status stok ketersediaan, dan antrean
- `POST /buku` — Tambah buku baru (Admin only)
- `PUT /buku/:id` — Edit informasi buku & stok (Admin only)
- `DELETE /buku/:id` — Hapus buku (Admin only; dilindungi dari penghapusan jika masih ada peminjaman aktif)

### 3. Kategori Buku (`/api/v1/kategori`)
- `GET /kategori` — Daftar kategori dan jumlah buku di dalamnya
- `POST /kategori` — Tambah kategori (Admin/Petugas)
- `PUT /kategori/:id` — Ubah kategori (Admin/Petugas)
- `DELETE /kategori/:id` — Hapus kategori (Admin only; dilindungi dari penghapusan jika masih memuat buku)

### 4. Sirkulasi Peminjaman, Antrean, & Denda (`/api/v1/peminjaman`)
- `POST /peminjaman/ajukan` — Mahasiswa mengajukan pinjam buku (Otomatis masuk antrean jika stok habis, auto-direct jika e-book digital, dibatasi maks 3 buku aktif, dicek tanggungan denda)
- `POST /peminjaman/:id/batal` — Mahasiswa membatalkan pengajuan pinjam mandiri yang masih berstatus `PENDING` (mengembalikan stok dan mempromosikan antrean jika ada)
- `POST /peminjaman/klaim-antrean/:id` — Mahasiswa mengklaim buku antrean yang sudah berstatus `TERSEDIA`
- `POST /peminjaman/sirkulasi/pinjam-langsung` — Petugas langsung memproses peminjaman di meja sirkulasi
- `GET /peminjaman/saya` — Riwayat peminjaman akun yang sedang login beserta denda berjalan
- `GET /peminjaman/antrean/saya` — Daftar antrean buku yang sedang dipesan oleh pengguna
- `DELETE /peminjaman/antrean/:id` — Batalkan antrean pemesanan sendiri (otomatis mengalihkan hak ke nomor antrean berikutnya jika statusnya `TERSEDIA`)
- `GET /peminjaman` — Daftar seluruh transaksi peminjaman perpustakaan (Admin & Petugas)
- `GET /peminjaman/:id` — Detail satu transaksi peminjaman (Peminjam, Petugas, Admin)
- `PUT /peminjaman/:id/status` — Persetujuan/Penolakan peminjaman (Petugas; state-machine terproteksi, jika `DITOLAK` stok dikembalikan dan antrean dipromosikan)
- `POST /peminjaman/:id/kembali` — Pengembalian buku + kalkulasi denda otomatis + reservasi ke antrean berikutnya (Petugas)
- `PUT /peminjaman/:id/bayar-denda` — Petugas mencatat pelunasan denda keterlambatan
- `POST /peminjaman/:id/perpanjang` — Perpanjangan masa pinjam (+7 hari, maks 1x perpanjang, dicek antrean & bebas tunggakan denda)

### 5. Pengelolaan Pengguna (`/api/v1/user`) — *Admin Only*
- `GET /user` — Daftar seluruh akun pengguna (bisa filter role & search)
- `GET /user/:id` — Detail akun dan riwayat peminjamannya
- `POST /user` — Tambah akun pengguna baru secara manual
- `PUT /user/:id` — Edit akun dan ubah peran (*Role*; Admin dilindungi dari self-lockout)
- `DELETE /user/:id` — Hapus akun pengguna (Dilindungi jika masih meminjam buku, menunggak denda, atau self-delete)

### 6. Rekapitulasi Khusus Admin (`/api/v1/admin`) — Sesuai Modul Pertemuan 3
- `GET /admin/rekap` — Rekapitulasi sistem untuk penilaian modul P3 (Admin -> 200, Mahasiswa -> 403, Tanpa Token -> 401). Mendukung pula akses langsung via `http://localhost:3000/admin/rekap`.

### 7. Dasbor Statistik & Analitik (`/api/v1/dashboard`)
- `GET /dashboard/stats` — Ringkasan total judul, stok fisik, e-book, pinjaman aktif, terlambat, total denda terkumpul, 5 buku paling sering dipinjam, 5 anggota paling aktif, dan rekomendasi pengadaan koleksi.
