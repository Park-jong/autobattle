import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 상대 경로: 저장소 이름·하위 경로가 바뀌어도 GitHub Pages에서 동작
  base: './',
  // 캐릭터 원본 원화(characters/)는 배포하지 않는다. 게임은 public/skins의 축소본만 쓴다 (tools/skin-assets.ps1)
  server: { port: 5738, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
