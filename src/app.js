const express = require('express');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const dreaddRoutes = require('./routes/threadRoutes');
const profileRoutes = require('./routes/profileRoutes');
const messageRoutes = require('./routes/messageRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json({ limit: '15mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/dreadds', dreaddRoutes);
app.use('/api/threads', dreaddRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/messages', messageRoutes);

const frontendDistPath = path.resolve(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
