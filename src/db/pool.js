import pg from 'pg';

const { Pool, types } = pg;

// Per-pool type parsers (not global) so the JSON output matches the Java API:
//   - int8 (BIGINT) as a JS number instead of a string (ids are well below 2^53)
//   - TIMESTAMP WITHOUT TIME ZONE as an ISO-8601 local date-time string ("2025-01-15T10:30:00"),
//     the same shape Jackson produces for LocalDateTime, instead of a Date shifted to UTC.
const INT8_OID = 20;
const TIMESTAMP_OID = 1114;

const typeParsers = {
  getTypeParser(oid, format) {
    if (oid === INT8_OID) return (value) => Number(value);
    if (oid === TIMESTAMP_OID) return (value) => value.replace(' ', 'T');
    return types.getTypeParser(oid, format);
  },
};

export function createPool(dbConfig, logger) {
  const pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl ? { rejectUnauthorized: true } : false,
    max: dbConfig.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'customers-api-node',
    types: typeParsers,
  });

  // An idle client erroring must not crash the process; the pool discards it.
  pool.on('error', (err) => logger.error({ err }, 'Unexpected error on idle PostgreSQL client'));

  return pool;
}
