import pino from 'pino';

export function createLogger({ env, logLevel }) {
  return pino({
    name: 'customers-api',
    level: logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    // Human-readable output locally; structured JSON everywhere else.
    transport: env === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  });
}
