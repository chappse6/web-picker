import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default to node; extension tests opt into jsdom via a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
