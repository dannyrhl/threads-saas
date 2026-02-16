require('dotenv').config();
const app = require('./app');

const PORT = Number(process.env.PORT) || 4000;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
