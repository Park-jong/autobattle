import { SKINS, isSkinId } from './skins';
import { appSkin, type SkinStore } from './SkinStore';
import './skin.css';

/** 스킨 선택 상자 (DOM). 여러 곳에 두어도 같은 저장소를 보므로 서로 맞춰진다 */
export class SkinPicker {
  readonly root = document.createElement('label');
  private readonly select = document.createElement('select');

  constructor(private readonly store: SkinStore = appSkin, testId = 'skin-select') {
    this.root.className = 'skin-picker';
    const caption = document.createElement('span');
    caption.textContent = '스킨';
    this.select.className = 'dbg-input skin-select';
    this.select.dataset.testid = testId;
    for (const skin of SKINS) {
      const option = document.createElement('option');
      option.value = skin.id;
      option.textContent = skin.name;
      option.title = skin.description;
      this.select.append(option);
    }
    this.select.addEventListener('change', () => {
      if (isSkinId(this.select.value)) this.store.set(this.select.value);
    });
    this.root.append(caption, this.select);
    store.subscribe(() => this.sync());
    this.sync();
  }

  private sync(): void {
    this.select.value = this.store.current;
    this.root.title = SKINS.find((s) => s.id === this.store.current)?.description ?? '';
  }
}
