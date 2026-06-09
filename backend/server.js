require('./config/loadEnv').loadEnv();

(async () => {
  try {
    const { bootstrapDatabase } = require('./db/bootstrap');
    await bootstrapDatabase();
    const { listenApp } = require('./createHttpServer');
    const PORT = process.env.PORT || 3000;
    await listenApp(PORT);
    console.log(`Server running on port ${PORT}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();