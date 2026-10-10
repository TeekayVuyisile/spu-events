import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // Workspace packages ship as TS source, so bundle them; npm deps stay external.
  noExternal: [/^@monthati\//],
  sourcemap: true,
  clean: true,
});
