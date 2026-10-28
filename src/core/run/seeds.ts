/**
 * 런 시드에서 용도별 하위 시드를 파생한다 (FNV-1a + 최종 믹스).
 * 용도(라벨)와 노드 ID, 시도 번호만으로 결정되므로 한쪽 선택이 다른 쪽 난수를 바꾸지 않는다.
 */
export function deriveSeed(base: number, ...parts: readonly (string | number)[]): number {
  let h = (base | 0) ^ 0x9e3779b9;
  for (const part of parts) {
    const text = `${part}|`;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
