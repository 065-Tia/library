const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (_req, res) => {
  res.status(200).json({
    status: true,
    message: 'Server E-Library aktif. Silakan gunakan base endpoint /api/v1',
  });
});

app.use('/api/v1', apiRouter);
app.use('/', apiRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
