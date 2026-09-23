import { PollyClient } from '@aws-sdk/client-polly';
import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { createLogger } from './config/logger.js';
import { createCustomerRepository } from './customers/customer.repository.js';
import { createCustomerService } from './customers/customer.service.js';
import { createPool } from './db/pool.js';
import { createPronounceService } from './pronounce/pronounce.service.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const logger = createLogger(config);

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

// Composition root: wire concrete dependencies together.
const pool = createPool(config.db, logger);
const pollyClient = new PollyClient({ region: config.aws.region });

const pronounceService = createPronounceService({
  pollyClient,
  defaultVoiceId: config.aws.pollyVoiceId,
  logger,
});
const customerService = createCustomerService({
  customerRepository: createCustomerRepository(pool),
  pronounceService,
  logger,
});

const app = createApp({
  config,
  logger,
  customerService,
  checkReadiness: () => pool.query('SELECT 1'),
});

const server = app.listen(config.port, (err) => {
  if (err) {
    logger.fatal({ err }, 'Failed to start HTTP server');
    process.exit(1);
  }
  logger.info(
    { port: config.port, env: config.env, region: config.aws.region, voice: config.aws.pollyVoiceId },
    `Customers API listening on http://localhost:${config.port} (docs: /swagger-ui.html)`,
  );
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');

  // Force exit if in-flight requests or connections don't drain in time.
  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
      server.closeIdleConnections();
    });
    await pool.end();
    pollyClient.destroy();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
