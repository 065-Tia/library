require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server E-Library REST API aktif di http://localhost:${PORT}`);
  console.log(`Base API URL: http://localhost:${PORT}/api/v1`);
  console.log(`Akses Svelte Web: http://localhost:5173 -> http://localhost:${PORT}/api/v1`);
  console.log(`Akses Android Emulator: http://10.0.2.2:${PORT}/api/v1`);
});
