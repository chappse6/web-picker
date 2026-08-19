import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default to node; extension tests opt into jsdom via a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // A real headed Chrome session is opt-in. npm exposes the lifecycle event
    // on every platform, so the dedicated script can keep its documented CLI.
    exclude: process.env.npm_lifecycle_event === 'test:e2e' ? [] : ['test/e2e/**'],
  },
});
