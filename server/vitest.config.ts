import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    hookTimeout: 600000,
    testTimeout: 600000,
    sequence: {
      concurrent: false,
    },
  },
});