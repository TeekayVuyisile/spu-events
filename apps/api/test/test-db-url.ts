import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const apiEnvFile = fileURLToPath(new URL('../.env', import.meta.url));

/**
 * Integration tests run against a real Postgres database named in TEST_DATABASE_URL
 * (apps/api/.env locally, the CI service in GitHub Actions). Tests wipe it, so the
 * name must contain "test" as a guard against pointing it at real data.
 */
export function testDatabaseUrl() {
  if (!process.env.TEST_DATABASE_URL && existsSync(apiEnvFile)) process.loadEnvFile(apiEnvFile);

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Add it to apps/api/.env (see .env.example), e.g.\n' +
        '  TEST_DATABASE_URL=postgres://postgres:password@localhost:5432/spu_events_test',
    );
  }
  if (!new URL(url).pathname.includes('test')) {
    throw new Error(
      `Refusing to run tests: the TEST_DATABASE_URL database name must contain "test"`,
    );
  }
  return url;
}
