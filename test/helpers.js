import pino from 'pino';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';

export const silentLogger = pino({ level: 'silent' });

export const sampleRow = Object.freeze({
  customer_pk: '3f1c2b7e-8a4d-4c3b-9e2f-1a2b3c4d5e6f',
  id: 1,
  company_id: 10,
  name: 'Ana Souza',
  email: 'ana@example.com',
  age: 34,
  country: 'Brazil',
  phone: '+55 11 99999-0000',
  created_at: '2025-01-15T10:30:00',
});

export function buildTestApp({ customerService, checkReadiness, env = {} } = {}) {
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env });
  return createApp({ config, logger: silentLogger, customerService, checkReadiness });
}
