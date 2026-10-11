import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Test files share one real database, so run them one at a time.
    fileParallelism: false,
  },
});
