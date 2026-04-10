require('dotenv').config();
const app = require('./app');
const { botsEnabled, removeAllBots, startBotEngine } = require('./services/botEngine');

const PORT = Number(process.env.PORT) || 4000;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (botsEnabled()) {
    startBotEngine().catch((error) => {
      console.error('[bot-engine] startup failed:', error.message);
    });
    return;
  }

  removeAllBots()
    .then((count) => {
      if (count > 0) {
        console.log(`[bot-engine] removed ${count} bot account(s) because ENABLE_BOTS is disabled`);
      }
    })
    .catch((error) => {
      console.error('[bot-engine] cleanup failed:', error.message);
    });
});
