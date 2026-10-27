import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5738, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
