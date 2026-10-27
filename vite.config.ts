import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 상대 경로: 저장소 이름·하위 경로가 바뀌어도 GitHub Pages에서 동작
  base: './',
  server: { port: 5738, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
