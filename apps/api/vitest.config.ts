import { defineConfig } from 'vitest/config';

/**
 * Test env is declared here rather than in a .env.test file so the suite is
 * hermetic: it can never pick up development secrets or, far worse, point at the
 * real Atlas cluster. MONGODB_URI is a placeholder that src/test/setup.ts
 * replaces with an in-memory server's URI.
 */
const testEnv = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/findbd-test-placeholder',
  JWT_ACCESS_SECRET: 'test_access_secret_0000000000000000000000000000000000',
  JWT_REFRESH_SECRET: 'test_refresh_secret_1111111111111111111111111111111111',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: '30',
  MATCH_DATE_WINDOW_DAYS: '30',
  MATCH_DATE_SLACK_DAYS: '1',
  MATCH_CANDIDATE_LIMIT: '300',
};

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    env: testEnv,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
