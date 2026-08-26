import { createApp } from './app.js';
import { env, hasCloudinary } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { logger } from './lib/logger.js';

/**
 * Server entrypoint.
 *
 * The database connects before the port opens. Starting the other way round means
 * the first users through the door get 500s from a server that looks healthy to
 * whatever restarted it — better to fail loudly at boot.
 */

async function main(): Promise<void> {
  await connectDatabase();
  logger.info({ database: 'connected' }, 'mongodb ready');

  if (!hasCloudinary) {
    // Not fatal: reports work without photos. But it is the single most likely
    // reason someone finds the uploader missing, so it is worth one line at boot.
    logger.warn('cloudinary is not configured — report photo upload is disabled');
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, webOrigin: env.WEB_ORIGIN },
      'findbd api listening',
    );
  });

  /**
   * Graceful shutdown.
   *
   * A report creation runs matching inline, so an in-flight request can be doing
   * real work when the platform sends SIGTERM. `server.close()` stops accepting
   * new connections and waits for the current ones, and Mongo is disconnected only
   * after that — the alternative is a half-written report.
   *
   * The 10-second timer is the backstop for a connection that never finishes.
   */
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    const force = setTimeout(() => {
      logger.error('shutdown timed out — exiting anyway');
      process.exit(1);
    }, 10_000);
    force.unref();

    server.close(() => {
      void disconnectDatabase()
        .catch((err: unknown) => logger.error({ err }, 'database disconnect failed'))
        .finally(() => {
          clearTimeout(force);
          process.exit(0);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  /**
   * An unhandled rejection means some promise chain is missing a `.catch` —
   * process state is no longer trustworthy, so log it and let the supervisor
   * restart a clean one rather than serving from a process in an unknown state.
   */
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled rejection');
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    shutdown('uncaughtException');
  });
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
