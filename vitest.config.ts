import { defineConfig } from 'vitest/config';

// Lets `npx vitest run <file>` work from the repo root using each workspace's own config.
export default defineConfig({
  test: { projects: ['packages/*', 'apps/*'] },
});
