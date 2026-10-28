/** 런 화면 공용 DOM 도우미 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(text: string, onClick: () => void, className = 'dbg-btn'): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** 테스트·자동화용 식별자를 붙인다 */
export function tagged<T extends HTMLElement>(node: T, testId: string): T {
  node.dataset.testid = testId;
  return node;
}
