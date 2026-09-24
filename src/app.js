import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { createCustomerRouter } from './customers/customer.routes.js';
import { openApiDocument } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Builds the Express app from injected dependencies, with no I/O at import time,
 * so tests can create it with fakes and without opening a port.
 */
export function createApp({ config, logger, customerService, checkReadiness = async () => {} }) {
  const app = express();

  app.set('trust proxy', config.trustProxy);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{1,128}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(
    helmet({
      // The frontend plays the MP3 from another origin (<audio src=...>), which CORP same-origin would block.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: false,
    }),
  );

  // Liveness: the process is up. Readiness: its dependencies (PostgreSQL) are reachable.
  app.get('/health', (req, res) => res.json({ status: 'UP' }));
  app.get('/ready', async (req, res) => {
    try {
      await checkReadiness();
      res.json({ status: 'UP' });
    } catch (err) {
      req.log.warn({ err }, 'Readiness check failed');
      res.status(503).json({ status: 'DOWN' });
    }
  });

  // Same documentation URLs as the Spring Boot (springdoc) version.
  app.get('/v3/api-docs', (req, res) => res.json(openApiDocument));
  app.get('/swagger-ui.html', (req, res) => res.redirect('/swagger-ui/index.html'));
  app.get('/swagger-ui/swagger-initializer.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`window.onload = function() {
  window.ui = SwaggerUIBundle({
    url: '/v3/api-docs',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    plugins: [SwaggerUIBundle.plugins.DownloadUrl],
    layout: 'StandaloneLayout'
  });
};`);
  });
  app.use('/swagger-ui', swaggerUi.serve);

  app.use(
    '/api',
    createCustomerRouter({
      customerService,
      pronounceRateLimitPerMinute: config.pronounceRateLimitPerMinute,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
