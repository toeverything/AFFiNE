import { buildApp } from './app.js';
import { loadConfig, loadDotEnv } from './config/env.js';

loadDotEnv();

const config = loadConfig();
const { app } = await buildApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutdown');
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'shutdown_error');
    process.exit(1);
  }
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(
    {
      url: `http://${config.HOST}:${config.PORT}`,
      publicUrl: config.MOSAIC_PUBLIC_URL,
      compatibility: config.MOSAIC_COMPAT_VERSION,
    },
    'mosaic_server_listening'
  );
} catch (error) {
  app.log.error({ err: error }, 'listen_failed');
  process.exit(1);
}
