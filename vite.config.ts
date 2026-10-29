import { defineConfig } from 'vitest/config';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // 상대 경로: 저장소 이름·하위 경로가 바뀌어도 GitHub Pages에서 동작
  base: './',
  plugins: [{
    name: 'character-art-assets',
    apply: 'build',
    generateBundle() {
      // 기획 원화는 게임 코드와 별도로 보관하고 배포 시 안정된 URL로 제공한다.
      for (let number = 1; number <= 30; number++) {
        const unit = `U${String(number).padStart(2, '0')}`;
        for (const kind of ['illustration', 'portrait', 'sd']) {
          const fileName = `characters/${unit}/${kind}.png`;
          const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
          if (existsSync(path)) this.emitFile({ type: 'asset', fileName, source: readFileSync(path) });
        }
      }
      const manifest = fileURLToPath(new URL('./characters/asset-manifest.json', import.meta.url));
      if (existsSync(manifest)) {
        this.emitFile({ type: 'asset', fileName: 'characters/asset-manifest.json', source: readFileSync(manifest) });
      }
    },
  }],
  server: { port: 5738, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
