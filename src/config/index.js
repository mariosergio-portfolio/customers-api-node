import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8082),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1).default('postgres'),
  DB_USER: z.string().min(1).default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: z.stringbool().default(false),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  AWS_REGION: z.string().min(1).default('us-east-1'),
  AWS_POLLY_VOICE_ID: z.string().min(1).default('Joanna'),

  CORS_ORIGIN: z.string().min(1).default('*'),
  TRUST_PROXY: z.stringbool().default(false),
  PRONOUNCE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
});

/**
 * Validates environment variables once at startup and returns an immutable config object.
 * Fails fast with a readable message when something is misconfigured.
 */
export function loadConfig(env = process.env) {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const e = result.data;
  return Object.freeze({
    env: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    db: Object.freeze({
      host: e.DB_HOST,
      port: e.DB_PORT,
      database: e.DB_NAME,
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      ssl: e.DB_SSL,
      max: e.DB_POOL_MAX,
    }),
    aws: Object.freeze({
      region: e.AWS_REGION,
      pollyVoiceId: e.AWS_POLLY_VOICE_ID,
    }),
    corsOrigin: e.CORS_ORIGIN === '*' ? '*' : e.CORS_ORIGIN.split(',').map((o) => o.trim()),
    trustProxy: e.TRUST_PROXY,
    pronounceRateLimitPerMinute: e.PRONOUNCE_RATE_LIMIT_PER_MINUTE,
  });
}
