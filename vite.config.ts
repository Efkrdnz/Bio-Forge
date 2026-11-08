import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
