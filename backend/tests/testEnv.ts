/**
 * Deterministic environment for the test run.
 *
 * Imported for its side effects as the FIRST import of every test file, so the
 * values are in place before `src/config/env.ts` reads them. dotenv never
 * overwrites variables that are already set, so these values win over the
 * developer's real `.env` and the suite never reaches a live database.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/agrimatch_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0000000000000000000000000000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-00000000000000000000000000';
process.env.CLIENT_URL ??= 'http://localhost:3000';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
process.env.ENCRYPTION_KEY ??= '0'.repeat(64);

export {};
